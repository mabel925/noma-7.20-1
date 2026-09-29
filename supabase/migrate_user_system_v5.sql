-- Noma user system v5.
--
-- This migration changes the app from client-owned full-array synchronization
-- to server-owned, explicit CRUD with cursor pagination and soft deletion.
-- It is intentionally additive so it can be applied after v4. Existing test
-- rows remain readable, but production rollout may clear them if desired.

begin;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  normalized_display_name text not null,
  avatar_key text,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_display_name)
);

create table if not exists public.media_objects (
  key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('sticker', 'space', 'avatar', 'other')),
  bytes bigint check (bytes is null or bytes >= 0),
  sha256 text,
  ref_count integer not null default 0 check (ref_count >= 0),
  orphaned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.items
  add column if not exists version integer not null default 1,
  add column if not exists deleted_at timestamptz;

alter table public.spaces
  add column if not exists version integer not null default 1,
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.spaces'::regclass and conname = 'spaces_parent_id_fkey'
  ) then
    alter table public.spaces
      add constraint spaces_parent_id_fkey foreign key (parent_id)
      references public.spaces(id) on delete set null not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.items'::regclass and conname = 'items_space_id_fkey'
  ) then
    alter table public.items
      add constraint items_space_id_fkey foreign key (space_id)
      references public.spaces(id) on delete set null not valid;
  end if;
end
$$;

create index if not exists items_user_active_cursor_idx
  on public.items(user_id, updated_at desc, id desc)
  where deleted_at is null;

create index if not exists items_user_active_location_idx
  on public.items(user_id, parent_location_name, sub_location_name)
  where deleted_at is null;

create index if not exists spaces_user_active_parent_idx
  on public.spaces(user_id, parent_id, updated_at desc)
  where deleted_at is null;

create index if not exists media_objects_user_orphan_idx
  on public.media_objects(user_id, orphaned_at)
  where orphaned_at is not null;

alter table public.profiles enable row level security;
alter table public.media_objects enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own media registry" on public.media_objects;
create policy "Users can read own media registry"
on public.media_objects for select to authenticated
using (auth.uid() = user_id);

revoke all on public.profiles from anon;
revoke all on public.media_objects from anon;
grant select on public.profiles to authenticated;
grant select on public.media_objects to authenticated;

-- v5 mutations are RPC-only. This prevents a client from bypassing version
-- checks, soft deletion, plan limits, or media reference accounting.
revoke all on public.items from anon, authenticated;
revoke all on public.spaces from anon, authenticated;

create or replace function public.normalize_noma_display_name(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(trim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.bootstrap_my_account(preferred_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  app_user auth.users%rowtype;
  chosen_name text;
  normalized_name text;
  profile_row public.profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'NOMA_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into app_user from auth.users where id = current_user_id;
  chosen_name := trim(coalesce(
    nullif(preferred_display_name, ''),
    nullif(app_user.raw_user_meta_data ->> 'display_name', ''),
    split_part(app_user.email, '@', 1),
    'Noma user'
  ));
  normalized_name := public.normalize_noma_display_name(chosen_name);

  insert into public.profiles (user_id, display_name, normalized_display_name)
  values (current_user_id, chosen_name, normalized_name)
  on conflict (user_id) do update
  set display_name = case
        when preferred_display_name is not null and trim(preferred_display_name) <> '' then excluded.display_name
        else public.profiles.display_name
      end,
      normalized_display_name = case
        when preferred_display_name is not null and trim(preferred_display_name) <> '' then excluded.normalized_display_name
        else public.profiles.normalized_display_name
      end,
      updated_at = now()
  returning * into profile_row;

  perform public.ensure_noma_entitlement(current_user_id);

  return jsonb_build_object(
    'userId', profile_row.user_id,
    'displayName', profile_row.display_name,
    'avatarKey', profile_row.avatar_key,
    'status', profile_row.status
  );
end;
$$;

create or replace function public.check_display_name_available(
  candidate_name text,
  candidate_email text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select not exists (
    select 1
    from public.profiles as profile
    join auth.users as app_user on app_user.id = profile.user_id
    where profile.normalized_display_name = public.normalize_noma_display_name(candidate_name)
      and (
        trim(coalesce(candidate_email, '')) = ''
        or lower(coalesce(app_user.email, '')) <> lower(trim(candidate_email))
      )
  );
$$;

create or replace function public.adjust_noma_media_reference(
  target_user_id uuid,
  media_value text,
  media_kind text,
  delta integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  object_key text;
begin
  if media_value is null or media_value not like 'r2:%' or delta = 0 then
    return;
  end if;
  object_key := substring(media_value from 4);
  if object_key = '' or object_key not like 'users/' || target_user_id::text || '/%' then
    return;
  end if;

  insert into public.media_objects (key, user_id, kind, ref_count, orphaned_at)
  values (object_key, target_user_id, media_kind, greatest(delta, 0), case when delta < 0 then now() else null end)
  on conflict (key) do update
  set ref_count = greatest(0, public.media_objects.ref_count + delta),
      orphaned_at = case
        when greatest(0, public.media_objects.ref_count + delta) = 0 then coalesce(public.media_objects.orphaned_at, now())
        else null
      end,
      updated_at = now();
end;
$$;

create or replace function public.ensure_noma_item_spaces(
  target_user_id uuid,
  parent_name text,
  sub_name text,
  parent_image text,
  sub_image text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_parent text := trim(coalesce(parent_name, ''));
  clean_sub text := trim(coalesce(sub_name, ''));
  parent_space_id text;
  child_space_id text;
begin
  if clean_parent <> '' then
    parent_space_id := 'parent:' || target_user_id::text || ':' || clean_parent;
    insert into public.spaces (id, user_id, name, kind, parent_id, parent_name, image_url, metadata, deleted_at, updated_at)
    values (parent_space_id, target_user_id, clean_parent, 'parent', null, null, parent_image, '{}'::jsonb, null, now())
    on conflict (id) do update
    set image_url = coalesce(excluded.image_url, public.spaces.image_url),
        deleted_at = null,
        version = public.spaces.version + 1,
        updated_at = now();
  end if;

  if clean_sub <> '' then
    child_space_id := 'sub:' || target_user_id::text || ':' || clean_parent || '::' || clean_sub;
    insert into public.spaces (id, user_id, name, kind, parent_id, parent_name, image_url, metadata, deleted_at, updated_at)
    values (child_space_id, target_user_id, clean_sub, 'sub', parent_space_id, nullif(clean_parent, ''), sub_image, '{}'::jsonb, null, now())
    on conflict (id) do update
    set parent_id = excluded.parent_id,
        parent_name = excluded.parent_name,
        image_url = coalesce(excluded.image_url, public.spaces.image_url),
        deleted_at = null,
        version = public.spaces.version + 1,
        updated_at = now();
    return child_space_id;
  end if;

  return parent_space_id;
end;
$$;

create or replace function public.refresh_noma_space_counts(
  target_user_id uuid,
  parent_name text,
  sub_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_parent text := trim(coalesce(parent_name, ''));
  clean_sub text := trim(coalesce(sub_name, ''));
  parent_count integer;
  child_count integer;
begin
  if clean_parent <> '' then
    select count(*)::integer into parent_count
    from public.items
    where user_id::text = target_user_id::text
      and deleted_at is null
      and parent_location_name = clean_parent;

    update public.spaces
    set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{item_count}', to_jsonb(parent_count), true),
        deleted_at = case when parent_count = 0 then coalesce(deleted_at, now()) else null end,
        updated_at = now()
    where id = 'parent:' || target_user_id::text || ':' || clean_parent;
  end if;

  if clean_sub <> '' then
    select count(*)::integer into child_count
    from public.items
    where user_id::text = target_user_id::text
      and deleted_at is null
      and parent_location_name = clean_parent
      and sub_location_name = clean_sub;

    update public.spaces
    set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{item_count}', to_jsonb(child_count), true),
        deleted_at = case when child_count = 0 then coalesce(deleted_at, now()) else null end,
        updated_at = now()
    where id = 'sub:' || target_user_id::text || ':' || clean_parent || '::' || clean_sub;
  end if;
end;
$$;

create or replace function public.create_my_item(p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  item_id text := trim(coalesce(p_item ->> 'id', ''));
  parent_name text := trim(coalesce(p_item ->> 'parent_location_name', ''));
  sub_name text := trim(coalesce(p_item ->> 'sub_location_name', ''));
  item_space_id text;
  result_row public.items%rowtype;
begin
  if current_user_id is null then raise exception 'NOMA_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if item_id = '' or item_id !~ '^[A-Za-z0-9_-]{8,160}$' then
    raise exception 'NOMA_INVALID_ITEM_ID' using errcode = 'P0001';
  end if;

  perform public.bootstrap_my_account(null);
  select * into result_row
  from public.items
  where id = item_id and user_id::text = current_user_id::text and deleted_at is null;
  if found then
    return to_jsonb(result_row);
  end if;
  item_space_id := public.ensure_noma_item_spaces(
    current_user_id,
    parent_name,
    sub_name,
    nullif(p_item ->> 'parent_location_img', ''),
    nullif(p_item ->> 'sub_location_img', '')
  );

  insert into public.items (
    id, user_id, name, category, price, date, emoji, sticker_url,
    parent_location_name, sub_location_name, parent_location_img,
    sub_location_img, sub_location_highlight, space_id, version,
    deleted_at, created_at, updated_at
  ) values (
    item_id,
    current_user_id,
    coalesce(nullif(trim(p_item ->> 'name'), ''), 'Untitled'),
    coalesce(nullif(trim(p_item ->> 'category'), ''), '其它'),
    coalesce(p_item ->> 'price', '$0.00'),
    coalesce(p_item ->> 'date', 'Today'),
    coalesce(p_item ->> 'emoji', '📝'),
    nullif(p_item ->> 'sticker_url', ''),
    parent_name,
    sub_name,
    nullif(p_item ->> 'parent_location_img', ''),
    nullif(p_item ->> 'sub_location_img', ''),
    case when p_item ? 'sub_location_highlight' then p_item -> 'sub_location_highlight' else null end,
    item_space_id,
    1,
    null,
    coalesce((p_item ->> 'created_at')::timestamptz, now()),
    now()
  ) returning * into result_row;

  perform public.adjust_noma_media_reference(current_user_id, result_row.sticker_url, 'sticker', 1);
  perform public.adjust_noma_media_reference(current_user_id, result_row.parent_location_img, 'space', 1);
  perform public.adjust_noma_media_reference(current_user_id, result_row.sub_location_img, 'space', 1);
  perform public.refresh_noma_space_counts(current_user_id, parent_name, sub_name);

  return to_jsonb(result_row);
end;
$$;

create or replace function public.update_my_item(
  p_item_id text,
  p_expected_version integer,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  previous_row public.items%rowtype;
  result_row public.items%rowtype;
  next_parent text;
  next_sub text;
  next_space_id text;
begin
  if current_user_id is null then raise exception 'NOMA_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  select * into previous_row from public.items
  where id = p_item_id and user_id::text = current_user_id::text and deleted_at is null
  for update;
  if not found then raise exception 'NOMA_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  if previous_row.version <> p_expected_version then
    raise exception 'NOMA_ITEM_VERSION_CONFLICT:%', previous_row.version using errcode = '40001';
  end if;

  next_parent := case when p_patch ? 'parent_location_name' then trim(coalesce(p_patch ->> 'parent_location_name', '')) else previous_row.parent_location_name end;
  next_sub := case when p_patch ? 'sub_location_name' then trim(coalesce(p_patch ->> 'sub_location_name', '')) else previous_row.sub_location_name end;
  next_space_id := public.ensure_noma_item_spaces(
    current_user_id,
    next_parent,
    next_sub,
    case when p_patch ? 'parent_location_img' then nullif(p_patch ->> 'parent_location_img', '') else previous_row.parent_location_img end,
    case when p_patch ? 'sub_location_img' then nullif(p_patch ->> 'sub_location_img', '') else previous_row.sub_location_img end
  );

  update public.items set
    name = case when p_patch ? 'name' then coalesce(nullif(trim(p_patch ->> 'name'), ''), name) else name end,
    category = case when p_patch ? 'category' then coalesce(nullif(trim(p_patch ->> 'category'), ''), category) else category end,
    price = case when p_patch ? 'price' then coalesce(p_patch ->> 'price', price) else price end,
    date = case when p_patch ? 'date' then coalesce(p_patch ->> 'date', date) else date end,
    emoji = case when p_patch ? 'emoji' then coalesce(p_patch ->> 'emoji', emoji) else emoji end,
    sticker_url = case when p_patch ? 'sticker_url' then nullif(p_patch ->> 'sticker_url', '') else sticker_url end,
    parent_location_name = next_parent,
    sub_location_name = next_sub,
    parent_location_img = case when p_patch ? 'parent_location_img' then nullif(p_patch ->> 'parent_location_img', '') else parent_location_img end,
    sub_location_img = case when p_patch ? 'sub_location_img' then nullif(p_patch ->> 'sub_location_img', '') else sub_location_img end,
    sub_location_highlight = case when p_patch ? 'sub_location_highlight' then p_patch -> 'sub_location_highlight' else sub_location_highlight end,
    space_id = next_space_id,
    version = version + 1,
    updated_at = now()
  where id = p_item_id and user_id::text = current_user_id::text
  returning * into result_row;

  if previous_row.sticker_url is distinct from result_row.sticker_url then
    perform public.adjust_noma_media_reference(current_user_id, previous_row.sticker_url, 'sticker', -1);
    perform public.adjust_noma_media_reference(current_user_id, result_row.sticker_url, 'sticker', 1);
  end if;
  if previous_row.parent_location_img is distinct from result_row.parent_location_img then
    perform public.adjust_noma_media_reference(current_user_id, previous_row.parent_location_img, 'space', -1);
    perform public.adjust_noma_media_reference(current_user_id, result_row.parent_location_img, 'space', 1);
  end if;
  if previous_row.sub_location_img is distinct from result_row.sub_location_img then
    perform public.adjust_noma_media_reference(current_user_id, previous_row.sub_location_img, 'space', -1);
    perform public.adjust_noma_media_reference(current_user_id, result_row.sub_location_img, 'space', 1);
  end if;

  perform public.refresh_noma_space_counts(current_user_id, previous_row.parent_location_name, previous_row.sub_location_name);
  perform public.refresh_noma_space_counts(current_user_id, result_row.parent_location_name, result_row.sub_location_name);
  return to_jsonb(result_row);
end;
$$;

create or replace function public.delete_my_item(p_item_id text, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  previous_row public.items%rowtype;
  result_row public.items%rowtype;
begin
  if current_user_id is null then raise exception 'NOMA_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  select * into previous_row from public.items
  where id = p_item_id and user_id::text = current_user_id::text and deleted_at is null
  for update;
  if not found then raise exception 'NOMA_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  if previous_row.version <> p_expected_version then
    raise exception 'NOMA_ITEM_VERSION_CONFLICT:%', previous_row.version using errcode = '40001';
  end if;

  update public.items
  set deleted_at = now(), version = version + 1, updated_at = now()
  where id = p_item_id and user_id::text = current_user_id::text
  returning * into result_row;

  perform public.adjust_noma_media_reference(current_user_id, previous_row.sticker_url, 'sticker', -1);
  perform public.adjust_noma_media_reference(current_user_id, previous_row.parent_location_img, 'space', -1);
  perform public.adjust_noma_media_reference(current_user_id, previous_row.sub_location_img, 'space', -1);
  perform public.refresh_noma_space_counts(current_user_id, previous_row.parent_location_name, previous_row.sub_location_name);
  return to_jsonb(result_row);
end;
$$;

create or replace function public.restore_my_item(p_item_id text, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  previous_row public.items%rowtype;
  result_row public.items%rowtype;
  effective_item_limit integer;
  current_item_count integer;
  restored_space_id text;
begin
  if current_user_id is null then raise exception 'NOMA_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 1));
  select * into previous_row from public.items
  where id = p_item_id and user_id::text = current_user_id::text and deleted_at is not null
  for update;
  if not found then raise exception 'NOMA_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  if previous_row.version <> p_expected_version then
    raise exception 'NOMA_ITEM_VERSION_CONFLICT:%', previous_row.version using errcode = '40001';
  end if;

  select coalesce(entitlement.item_limit_override, plan_row.item_limit)
  into effective_item_limit
  from public.user_entitlements as entitlement
  join public.plans as plan_row on plan_row.code = entitlement.plan_code
  where entitlement.user_id = current_user_id;
  select count(*)::integer into current_item_count
  from public.items
  where user_id::text = current_user_id::text and deleted_at is null;
  if effective_item_limit is not null and current_item_count >= effective_item_limit then
    raise exception 'NOMA_ITEM_LIMIT_REACHED:%', effective_item_limit using errcode = 'P0001';
  end if;

  restored_space_id := public.ensure_noma_item_spaces(
    current_user_id,
    previous_row.parent_location_name,
    previous_row.sub_location_name,
    previous_row.parent_location_img,
    previous_row.sub_location_img
  );
  update public.items
  set deleted_at = null, space_id = restored_space_id, version = version + 1, updated_at = now()
  where id = p_item_id and user_id::text = current_user_id::text
  returning * into result_row;

  perform public.adjust_noma_media_reference(current_user_id, result_row.sticker_url, 'sticker', 1);
  perform public.adjust_noma_media_reference(current_user_id, result_row.parent_location_img, 'space', 1);
  perform public.adjust_noma_media_reference(current_user_id, result_row.sub_location_img, 'space', 1);
  perform public.refresh_noma_space_counts(current_user_id, result_row.parent_location_name, result_row.sub_location_name);
  return to_jsonb(result_row);
end;
$$;

create or replace function public.list_my_items(
  p_cursor_updated_at timestamptz default null,
  p_cursor_id text default null,
  p_limit integer default 30,
  p_query text default null,
  p_category text default null,
  p_space_id text default null
)
returns setof public.items
language sql
stable
security definer
set search_path = public, auth
as $$
  select item.*
  from public.items as item
  where item.user_id::text = auth.uid()::text
    and item.deleted_at is null
    and (
      p_cursor_updated_at is null
      or item.updated_at < p_cursor_updated_at
      or (item.updated_at = p_cursor_updated_at and item.id < coalesce(p_cursor_id, ''))
    )
    and (p_query is null or trim(p_query) = '' or concat_ws(' ', item.name, item.parent_location_name, item.sub_location_name) ilike '%' || trim(p_query) || '%')
    and (p_category is null or trim(p_category) = '' or lower(item.category) = lower(trim(p_category)))
    and (p_space_id is null or trim(p_space_id) = '' or item.space_id = p_space_id)
  order by item.updated_at desc, item.id desc
  limit least(greatest(p_limit, 1), 100) + 1;
$$;

create or replace function public.get_my_memory_summary()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'itemCount', count(*)::integer,
    'parentSpaceCount', count(distinct nullif(parent_location_name, ''))::integer,
    'subSpaceCount', count(distinct case when sub_location_name <> '' then parent_location_name || '::' || sub_location_name end)::integer
  )
  from public.items
  where user_id::text = auth.uid()::text and deleted_at is null;
$$;

-- Soft-deleted rows must not consume an item's plan quota.
create or replace function public.get_my_access()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  entitlement public.user_entitlements%rowtype;
  plan_row public.plans%rowtype;
  base_ai_limit integer;
  effective_ai_limit integer;
  effective_item_limit integer;
  bonus_credits integer;
  ai_used integer;
  item_count integer;
begin
  if current_user_id is null then raise exception 'NOMA_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  perform public.ensure_noma_entitlement(current_user_id);
  select * into entitlement from public.user_entitlements where user_id = current_user_id;
  select * into plan_row from public.plans where code = entitlement.plan_code;
  base_ai_limit := coalesce(entitlement.ai_scan_limit_override, plan_row.ai_scan_limit);
  effective_item_limit := coalesce(entitlement.item_limit_override, plan_row.item_limit);
  select coalesce(sum(amount), 0)::integer into bonus_credits
  from public.ai_credit_grants
  where user_id = current_user_id and (expires_at is null or expires_at > now());
  effective_ai_limit := case when base_ai_limit is null then null else base_ai_limit + bonus_credits end;
  select count(*)::integer into ai_used from public.ai_scan_usage where user_id = current_user_id;
  select count(*)::integer into item_count from public.items
  where user_id::text = current_user_id::text and deleted_at is null;
  return jsonb_build_object(
    'planCode', entitlement.plan_code,
    'planName', plan_row.display_name,
    'aiScanLimit', effective_ai_limit,
    'aiScansUsed', ai_used,
    'aiScansRemaining', case when effective_ai_limit is null then null else greatest(effective_ai_limit - ai_used, 0) end,
    'itemLimit', effective_item_limit,
    'itemCount', item_count,
    'itemsRemaining', case when effective_item_limit is null then null else greatest(effective_item_limit - item_count, 0) end
  );
end;
$$;

create or replace function public.enforce_noma_item_limit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid := (new.user_id::text)::uuid;
  effective_item_limit integer;
  current_item_count integer;
begin
  perform public.ensure_noma_entitlement(target_user_id);
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 1));
  select coalesce(entitlement.item_limit_override, plan_row.item_limit)
  into effective_item_limit
  from public.user_entitlements as entitlement
  join public.plans as plan_row on plan_row.code = entitlement.plan_code
  where entitlement.user_id = target_user_id;
  if effective_item_limit is null then return new; end if;
  select count(*)::integer into current_item_count
  from public.items
  where user_id::text = target_user_id::text and deleted_at is null;
  if current_item_count >= effective_item_limit then
    raise exception 'NOMA_ITEM_LIMIT_REACHED:%', effective_item_limit using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_noma_display_name(text) from public;
revoke all on function public.adjust_noma_media_reference(uuid, text, text, integer) from public;
revoke all on function public.ensure_noma_item_spaces(uuid, text, text, text, text) from public;
revoke all on function public.refresh_noma_space_counts(uuid, text, text) from public;

revoke all on function public.bootstrap_my_account(text) from public;
revoke all on function public.check_display_name_available(text, text) from public;
revoke all on function public.create_my_item(jsonb) from public;
revoke all on function public.update_my_item(text, integer, jsonb) from public;
revoke all on function public.delete_my_item(text, integer) from public;
revoke all on function public.restore_my_item(text, integer) from public;
revoke all on function public.list_my_items(timestamptz, text, integer, text, text, text) from public;
revoke all on function public.get_my_memory_summary() from public;

grant execute on function public.bootstrap_my_account(text) to authenticated;
grant execute on function public.check_display_name_available(text, text) to anon, authenticated;
grant execute on function public.create_my_item(jsonb) to authenticated;
grant execute on function public.update_my_item(text, integer, jsonb) to authenticated;
grant execute on function public.delete_my_item(text, integer) to authenticated;
grant execute on function public.restore_my_item(text, integer) to authenticated;
grant execute on function public.list_my_items(timestamptz, text, integer, text, text, text) to authenticated;
grant execute on function public.get_my_memory_summary() to authenticated;

notify pgrst, 'reload schema';
commit;
