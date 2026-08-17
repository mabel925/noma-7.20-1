-- Optional username uniqueness check used before sending an email code.
-- Run once in the Supabase SQL editor. It reads only normalized display names
-- and returns a boolean, not another user's email or profile data.

create or replace function public.check_display_name_available(
  candidate_name text,
  candidate_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_name text := lower(regexp_replace(trim(coalesce(candidate_name, '')), '\s+', ' ', 'g'));
  normalized_email text := lower(trim(coalesce(candidate_email, '')));
  conflict_found boolean;
begin
  if normalized_name = '' then
    return true;
  end if;

  select exists (
    select 1
    from auth.users as existing_user
    where existing_user.email_confirmed_at is not null
      and lower(regexp_replace(trim(coalesce(existing_user.raw_user_meta_data ->> 'display_name', '')), '\s+', ' ', 'g')) = normalized_name
      and (normalized_email = '' or lower(coalesce(existing_user.email, '')) <> normalized_email)
  )
  into conflict_found;

  return not conflict_found;
end;
$$;

revoke all on function public.check_display_name_available(text, text) from public;
grant execute on function public.check_display_name_available(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
