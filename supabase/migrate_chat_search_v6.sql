-- Noma chat search metadata v6.
--
-- Adds bounded recognition metadata to items and teaches the existing CRUD
-- RPCs to persist and search it. Apply after migrate_user_system_v5.sql.

begin;

alter table public.items
  add column if not exists aliases text[] not null default '{}'::text[],
  add column if not exists attributes jsonb not null default '{}'::jsonb;

alter table public.items
  drop constraint if exists items_aliases_limit,
  drop constraint if exists items_attributes_object,
  drop constraint if exists items_attributes_size;

alter table public.items
  add constraint items_aliases_limit check (cardinality(aliases) <= 12),
  add constraint items_attributes_object check (jsonb_typeof(attributes) = 'object'),
  add constraint items_attributes_size check (octet_length(attributes::text) <= 4096);

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
  if found then return to_jsonb(result_row); end if;

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
    sub_location_img, sub_location_highlight, aliases, attributes, space_id,
    version, deleted_at, created_at, updated_at
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
    case
      when jsonb_typeof(p_item -> 'aliases') = 'array' then
        array(select left(trim(alias_value), 80) from jsonb_array_elements_text(p_item -> 'aliases') as alias_values(alias_value) where trim(alias_value) <> '' limit 12)
      else '{}'::text[]
    end,
    case when jsonb_typeof(p_item -> 'attributes') = 'object' then p_item -> 'attributes' else '{}'::jsonb end,
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
    aliases = case
      when jsonb_typeof(p_patch -> 'aliases') = 'array' then
        array(select left(trim(alias_value), 80) from jsonb_array_elements_text(p_patch -> 'aliases') as alias_values(alias_value) where trim(alias_value) <> '' limit 12)
      else aliases
    end,
    attributes = case when jsonb_typeof(p_patch -> 'attributes') = 'object' then p_patch -> 'attributes' else attributes end,
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
    and (
      p_query is null
      or trim(p_query) = ''
      or not exists (
        select 1
        from unnest(regexp_split_to_array(lower(trim(p_query)), '\s+')) as query_tokens(query_token)
        where concat_ws(
          ' ',
          item.name,
          item.parent_location_name,
          item.sub_location_name,
          array_to_string(item.aliases, ' '),
          item.attributes ->> 'brand',
          item.attributes ->> 'colors',
          item.attributes ->> 'materials',
          item.attributes ->> 'features'
        ) not ilike '%' || query_token || '%'
      )
    )
    and (p_category is null or trim(p_category) = '' or item.category = p_category)
    and (p_space_id is null or trim(p_space_id) = '' or item.space_id = p_space_id)
  order by item.updated_at desc, item.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100) + 1;
$$;

revoke all on function public.create_my_item(jsonb) from public;
revoke all on function public.update_my_item(text, integer, jsonb) from public;
revoke all on function public.list_my_items(timestamptz, text, integer, text, text, text) from public;
grant execute on function public.create_my_item(jsonb) to authenticated;
grant execute on function public.update_my_item(text, integer, jsonb) to authenticated;
grant execute on function public.list_my_items(timestamptz, text, integer, text, text, text) to authenticated;

commit;
