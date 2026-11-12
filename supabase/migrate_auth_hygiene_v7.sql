-- Keeps admin-facing user views limited to verified accounts and exposes a
-- service-role-only candidate list for deleting abandoned email OTP signups.

begin;

create or replace view public.noma_user_data_summary as
select
  app_user.id as user_id,
  app_user.email,
  coalesce(app_user.raw_user_meta_data ->> 'display_name', split_part(app_user.email, '@', 1)) as display_name,
  count(distinct item.id) as item_count,
  count(distinct case when space.kind = 'parent' then space.id end) as parent_space_count,
  count(distinct case when space.kind = 'sub' then space.id end) as sub_space_count,
  greatest(max(item.updated_at), max(space.updated_at)) as last_activity_at
from auth.users as app_user
left join public.items as item on item.user_id::text = app_user.id::text
left join public.spaces as space on space.user_id::text = app_user.id::text
where app_user.email_confirmed_at is not null
group by app_user.id, app_user.email, app_user.raw_user_meta_data;

create or replace view public.noma_user_data_detail as
select
  item.user_id,
  coalesce(app_user.raw_user_meta_data ->> 'display_name', split_part(app_user.email, '@', 1)) as display_name,
  app_user.email,
  parent.name as parent_space,
  child.name as sub_space,
  item.id as item_id,
  item.name as item_name,
  item.category,
  item.sticker_url,
  item.parent_location_img,
  item.sub_location_img,
  item.updated_at
from public.items as item
join auth.users as app_user on app_user.id::text = item.user_id::text
left join public.spaces as child on child.id = item.space_id and child.kind = 'sub'
left join public.spaces as parent on parent.id = child.parent_id and parent.kind = 'parent'
where app_user.email_confirmed_at is not null;

revoke all on public.noma_user_data_summary from anon, authenticated;
revoke all on public.noma_user_data_detail from anon, authenticated;

create or replace function public.list_noma_unverified_auth_cleanup(
  p_cutoff timestamptz,
  p_limit integer default 200
)
returns table(user_id uuid, email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'NOMA_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    app_user.id,
    app_user.email::text,
    app_user.created_at
  from auth.users as app_user
  where app_user.email is not null
    and app_user.email_confirmed_at is null
    and app_user.last_sign_in_at is null
    and app_user.created_at <= p_cutoff
  order by app_user.created_at asc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

revoke all on function public.list_noma_unverified_auth_cleanup(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.list_noma_unverified_auth_cleanup(timestamptz, integer)
  to service_role;

notify pgrst, 'reload schema';

commit;
