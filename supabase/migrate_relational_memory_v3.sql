-- Noma relational memory model v3.
-- Run this migration once before deploying the matching frontend commit.
-- It keeps the legacy location columns for backward compatibility while
-- backfilling real parent/child/item relationships.

begin;

alter table public.spaces
  add column if not exists parent_id text,
  add column if not exists created_at timestamptz not null default now();

alter table public.items
  add column if not exists space_id text;

-- Ensure every current item has a generated parent and child space row.
insert into public.spaces (id, user_id, name, kind, parent_name, image_url, metadata, created_at, updated_at)
select
  'parent:' || i.user_id::text || ':' || i.parent_location_name,
  i.user_id,
  i.parent_location_name,
  'parent',
  null,
  max(i.parent_location_img),
  jsonb_build_object('item_count', count(*)),
  min(i.created_at),
  max(i.updated_at)
from public.items as i
where coalesce(trim(i.parent_location_name), '') <> ''
group by i.user_id, i.parent_location_name
on conflict (id) do update
set image_url = coalesce(excluded.image_url, public.spaces.image_url),
    metadata = excluded.metadata,
    updated_at = greatest(public.spaces.updated_at, excluded.updated_at);

insert into public.spaces (id, user_id, name, kind, parent_name, image_url, metadata, created_at, updated_at)
select
  'sub:' || i.user_id::text || ':' || i.parent_location_name || '::' || i.sub_location_name,
  i.user_id,
  i.sub_location_name,
  'sub',
  i.parent_location_name,
  max(i.sub_location_img),
  jsonb_build_object('item_count', count(*)),
  min(i.created_at),
  max(i.updated_at)
from public.items as i
where coalesce(trim(i.parent_location_name), '') <> ''
  and coalesce(trim(i.sub_location_name), '') <> ''
group by i.user_id, i.parent_location_name, i.sub_location_name
on conflict (id) do update
set image_url = coalesce(excluded.image_url, public.spaces.image_url),
    metadata = excluded.metadata,
    updated_at = greatest(public.spaces.updated_at, excluded.updated_at);

update public.spaces as child
set parent_id = parent.id
from public.spaces as parent
where child.kind = 'sub'
  and parent.kind = 'parent'
  and child.user_id::text = parent.user_id::text
  and child.parent_name = parent.name
  and child.parent_id is distinct from parent.id;

update public.items as i
set space_id = child.id
from public.spaces as child
where child.kind = 'sub'
  and child.user_id::text = i.user_id::text
  and child.parent_name = i.parent_location_name
  and child.name = i.sub_location_name
  and i.space_id is distinct from child.id;

create index if not exists spaces_user_id_parent_id_idx
  on public.spaces(user_id, parent_id, updated_at desc);

create index if not exists items_user_id_space_id_idx
  on public.items(user_id, space_id, updated_at desc);

-- These views are for inspection in Supabase's SQL/Table tools. Access is
-- revoked from app roles so user data is not exposed through the public API.
create or replace view public.noma_user_data_summary as
select
  u.id as user_id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1)) as display_name,
  count(distinct i.id) as item_count,
  count(distinct case when s.kind = 'parent' then s.id end) as parent_space_count,
  count(distinct case when s.kind = 'sub' then s.id end) as sub_space_count,
  greatest(max(i.updated_at), max(s.updated_at)) as last_activity_at
from auth.users as u
left join public.items as i on i.user_id::text = u.id::text
left join public.spaces as s on s.user_id::text = u.id::text
group by u.id, u.email, u.raw_user_meta_data;

create or replace view public.noma_user_data_detail as
select
  i.user_id,
  coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1)) as display_name,
  u.email,
  parent.name as parent_space,
  child.name as sub_space,
  i.id as item_id,
  i.name as item_name,
  i.category,
  i.sticker_url,
  i.parent_location_img,
  i.sub_location_img,
  i.updated_at
from public.items as i
left join auth.users as u on u.id::text = i.user_id::text
left join public.spaces as child on child.id = i.space_id and child.kind = 'sub'
left join public.spaces as parent on parent.id = child.parent_id and parent.kind = 'parent';

revoke all on public.noma_user_data_summary from anon, authenticated;
revoke all on public.noma_user_data_detail from anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- Verification queries: these should show the relation fill rate.
select
  count(*) as total_items,
  count(space_id) as linked_items
from public.items;

select
  kind,
  count(*) as total_spaces,
  count(parent_id) as linked_children
from public.spaces
group by kind
order by kind;
