-- Adds a short database claim around R2 garbage collection. A media object
-- cannot gain a new reference while a GC claim is active.

begin;

alter table public.media_objects
  add column if not exists gc_claimed_at timestamptz;

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
  active_gc_claim timestamptz;
begin
  if media_value is null or media_value not like 'r2:%' or delta = 0 then
    return;
  end if;
  object_key := substring(media_value from 4);
  if object_key = '' or object_key not like 'users/' || target_user_id::text || '/%' then
    return;
  end if;

  if delta > 0 then
    select gc_claimed_at into active_gc_claim
    from public.media_objects
    where key = object_key
    for update;
    if active_gc_claim is not null then
      raise exception 'NOMA_MEDIA_GC_IN_PROGRESS' using errcode = 'P0001';
    end if;
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

create or replace function public.claim_noma_media_gc(
  p_cutoff timestamptz,
  p_stale_claim_before timestamptz,
  p_limit integer default 200
)
returns table(key text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'NOMA_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  return query
  with eligible as (
    select media.key
    from public.media_objects as media
    where media.ref_count = 0
      and media.orphaned_at <= p_cutoff
      and (media.gc_claimed_at is null or media.gc_claimed_at < p_stale_claim_before)
      and not exists (
        select 1
        from public.spaces as space
        where space.image_url = 'r2:' || media.key
      )
    order by media.orphaned_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ), claimed as (
    update public.media_objects as media
    set gc_claimed_at = now(), updated_at = now()
    from eligible
    where media.key = eligible.key
      and media.ref_count = 0
      and media.orphaned_at <= p_cutoff
      and not exists (
        select 1
        from public.spaces as space
        where space.image_url = 'r2:' || media.key
      )
    returning media.key
  )
  select claimed.key from claimed;
end;
$$;

revoke all on function public.claim_noma_media_gc(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_noma_media_gc(timestamptz, timestamptz, integer) to service_role;

commit;
