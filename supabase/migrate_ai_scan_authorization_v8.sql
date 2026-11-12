-- Keeps account/plan initialization in the login flow and makes each AI scan
-- perform only the authoritative, atomic quota reservation it still requires.

begin;

create or replace function public.authorize_ai_scan(p_scan_id text, p_feature text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_plan_code text;
  base_ai_limit integer;
  effective_ai_limit integer;
  bonus_credits integer;
  ai_used integer;
  usage_row public.ai_scan_usage%rowtype;
  feature_attempt_count integer;
begin
  if current_user_id is null then
    raise exception 'NOMA_AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_scan_id is null or p_scan_id !~ '^[A-Za-z0-9:_-]{8,120}$' then
    raise exception 'NOMA_INVALID_SCAN_ID' using errcode = 'P0001';
  end if;
  if p_feature not in ('vision', 'matting') then
    raise exception 'NOMA_INVALID_AI_FEATURE' using errcode = 'P0001';
  end if;

  -- Serializes quota reservations for one user across devices without
  -- repeating login-time account initialization or allowlist checks.
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select
    entitlement.plan_code,
    coalesce(entitlement.ai_scan_limit_override, plan_row.ai_scan_limit),
    coalesce((
      select sum(grant_row.amount)::integer
      from public.ai_credit_grants as grant_row
      where grant_row.user_id = current_user_id
        and (grant_row.expires_at is null or grant_row.expires_at > now())
    ), 0),
    (
      select count(*)::integer
      from public.ai_scan_usage as usage_count
      where usage_count.user_id = current_user_id
    )
  into current_plan_code, base_ai_limit, bonus_credits, ai_used
  from public.user_entitlements as entitlement
  join public.plans as plan_row on plan_row.code = entitlement.plan_code
  where entitlement.user_id = current_user_id;

  if not found then
    raise exception 'NOMA_ACCESS_NOT_READY' using errcode = 'P0001';
  end if;

  effective_ai_limit := case
    when base_ai_limit is null then null
    else base_ai_limit + bonus_credits
  end;

  select * into usage_row
  from public.ai_scan_usage
  where user_id = current_user_id
    and scan_id = p_scan_id
  for update;

  if found then
    feature_attempt_count := coalesce((usage_row.feature_attempts ->> p_feature)::integer, 0);
    if feature_attempt_count >= 2 then
      return jsonb_build_object(
        'allowed', false,
        'charged', false,
        'reason', 'retry_limit',
        'planCode', current_plan_code,
        'limit', effective_ai_limit,
        'used', ai_used,
        'remaining', case when effective_ai_limit is null then null else greatest(effective_ai_limit - ai_used, 0) end
      );
    end if;

    update public.ai_scan_usage
    set features = case
          when p_feature = any(features) then features
          else array_append(features, p_feature)
        end,
        feature_attempts = jsonb_set(
          feature_attempts,
          array[p_feature],
          to_jsonb(feature_attempt_count + 1),
          true
        ),
        updated_at = now()
    where id = usage_row.id;

    return jsonb_build_object(
      'allowed', true,
      'charged', false,
      'planCode', current_plan_code,
      'limit', effective_ai_limit,
      'used', ai_used,
      'remaining', case when effective_ai_limit is null then null else greatest(effective_ai_limit - ai_used, 0) end
    );
  end if;

  if effective_ai_limit is not null and ai_used >= effective_ai_limit then
    return jsonb_build_object(
      'allowed', false,
      'charged', false,
      'reason', 'quota_exhausted',
      'planCode', current_plan_code,
      'limit', effective_ai_limit,
      'used', ai_used,
      'remaining', 0
    );
  end if;

  insert into public.ai_scan_usage (user_id, scan_id, features, feature_attempts)
  values (current_user_id, p_scan_id, array[p_feature], jsonb_build_object(p_feature, 1));

  ai_used := ai_used + 1;
  return jsonb_build_object(
    'allowed', true,
    'charged', true,
    'planCode', current_plan_code,
    'limit', effective_ai_limit,
    'used', ai_used,
    'remaining', case when effective_ai_limit is null then null else greatest(effective_ai_limit - ai_used, 0) end
  );
end;
$$;

revoke all on function public.authorize_ai_scan(text, text) from public;
grant execute on function public.authorize_ai_scan(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
