begin;

alter table planpatch_private.sandbox_settings
  add column trial_check_email_tag bytea,
  add column trial_check_expires_at timestamptz;

create function planpatch_private.is_trial_check_email(address text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(trial_check_expires_at > now()
    and trial_check_email_tag = planpatch_private.trial_tag('email', lower(btrim(address))), false)
  from planpatch_private.sandbox_settings where singleton
$$;
revoke all on function planpatch_private.is_trial_check_email(text) from public, anon, authenticated;

create or replace function planpatch_private.record_trial_signup(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  address inet;
  network_key text;
begin
  if event #>> '{user,is_anonymous}' = 'true'
    or not (planpatch_private.trial_offer()
      or planpatch_private.is_trial_check_email(event #>> '{user,email}')) then
    return '{}'::jsonb;
  end if;

  begin
    address := nullif(event #>> '{metadata,ip_address}', '')::inet;
  exception when invalid_text_representation then return '{}'::jsonb;
  end;
  if address is null then return '{}'::jsonb; end if;
  if address <<= inet '::ffff:0:0/96' then
    address := inet '0.0.0.0' + (address - inet '::ffff:0:0');
  end if;
  network_key := case when family(address) = 4 then host(address)
    else network(set_masklen(address, 64))::text end;

  perform planpatch_private.purge_expired_trial_tags();
  insert into planpatch_private.trial_signups (user_id, network_tag, expires_at)
    values ((event #>> '{user,id}')::uuid, planpatch_private.trial_tag('network', network_key),
      now() + interval '7 days')
    on conflict (user_id) do nothing;
  return '{}'::jsonb;
end
$$;

create or replace function planpatch_private.start_trial(accepted_version text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := planpatch_private.project_user_id();
  offer_enabled boolean := planpatch_private.trial_offer();
  checking_signup boolean;
  verified_email text;
  email_tag bytea;
  signup_tag bytea;
  expiration timestamptz;
  inserted integer;
begin
  if owner_id is null then raise exception 'Verify your email and sign in to start a trial.' using errcode = 'PT401'; end if;
  if accepted_version is distinct from '2026-11-16' then
    raise exception 'Review the current terms before starting your trial.' using errcode = 'PT400';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('planpatch-trial:' || owner_id::text, 0));
  select expires_at into expiration from planpatch_private.trials where user_id = owner_id;
  if found then return expiration; end if;

  select lower(btrim(email)) into verified_email from auth.users where id = owner_id;
  checking_signup := not offer_enabled and planpatch_private.is_trial_check_email(verified_email);
  if not (offer_enabled or checking_signup) then
    raise exception 'Free trials are currently unavailable.' using errcode = 'PT403';
  end if;

  perform planpatch_private.purge_expired_trial_tags();
  select network_tag into signup_tag from planpatch_private.trial_signups where user_id = owner_id;
  if verified_email is null or verified_email = '' or signup_tag is null then
    raise exception 'This account is not eligible for a free trial.' using errcode = 'PT403';
  end if;
  if checking_signup then
    -- Testing a signup leaves the public email and network limits available.
    email_tag := planpatch_private.trial_tag('trial-check-email', verified_email);
    signup_tag := planpatch_private.trial_tag('trial-check-network', encode(signup_tag, 'hex'));
  else
    email_tag := planpatch_private.trial_tag('email', verified_email);
  end if;

  insert into planpatch_private.trial_claim_limits (kind, tag, blocked_until)
    values ('email', email_tag, now() + interval '90 days'),
      ('network', signup_tag, now() + interval '90 days')
    on conflict (kind, tag) do nothing;
  get diagnostics inserted = row_count;
  if inserted <> 2 then
    raise exception 'A free trial has already been claimed for this email or network.' using errcode = 'PT403';
  end if;

  expiration := now() + interval '72 hours';
  insert into planpatch_private.trials values (owner_id, now(), expiration, accepted_version);
  delete from planpatch_private.trial_signups where user_id = owner_id;
  return expiration;
end
$$;

create or replace function planpatch_private.trial_details()
returns table (trial_ends_at timestamptz, monthly_ends_at timestamptz, can_start_trial boolean, locked_project_ids uuid[])
language sql stable security definer set search_path = '' as $$
  select t.expires_at,
    (select max(g.valid_until) from planpatch_private.sandbox_grants g
      where g.user_id = owner.id and g.kind = 'monthly' and paid and g.valid_until > now()),
    (planpatch_private.trial_offer() or planpatch_private.is_trial_check_email(owner.email))
      and t.user_id is null and exists (
        select 1 from planpatch_private.trial_signups s where s.user_id = owner.id and s.expires_at > now()
      ),
    array(select g.project_id from planpatch_private.sandbox_grants g
      join public.projects p on p.id = g.project_id and p.user_id = g.user_id
      where g.user_id = owner.id and g.kind = 'project')
  from auth.users owner
  left join planpatch_private.trials t on t.user_id = owner.id
  where owner.id = (select planpatch_private.project_user_id())
$$;

commit;
