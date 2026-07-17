-- Run with: npx supabase test db
--
-- This is a real RLS regression test, not just a schema snapshot. It uses
-- synthetic users only and rolls every fixture back at the end.
begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- Auth's user table deliberately remains Supabase-managed. The local test
-- stack accepts these minimal synthetic fixtures, and the production signup
-- trigger creates matching profile rows.
insert into auth.users (id, email, phone) values
  ('10000000-0000-0000-0000-000000000001', 'owner-a@example.test', '+919100000001'),
  ('10000000-0000-0000-0000-000000000002', 'owner-b@example.test', '+919100000002'),
  ('10000000-0000-0000-0000-000000000003', 'viewer-a@example.test', '+919100000003'),
  ('10000000-0000-0000-0000-000000000004', 'one-time-owner@example.test', '+919100000004');

insert into public.households (id, caregiver_name, ui_language) values
  ('20000000-0000-0000-0000-000000000001', 'Owner A', 'en'),
  ('20000000-0000-0000-0000-000000000002', 'Owner B', 'en');

insert into public.household_members (household_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'viewer'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'owner');

update public.profiles
set active_household_id = case id
  when '10000000-0000-0000-0000-000000000001'::uuid then '20000000-0000-0000-0000-000000000001'::uuid
  when '10000000-0000-0000-0000-000000000002'::uuid then '20000000-0000-0000-0000-000000000002'::uuid
  else active_household_id
end
where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002'
);

insert into public.patients (id, household_id, name, phone_e164, language, voice_gender, timezone) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Synthetic A', '+919200000001', 'hi', 'female', 'Asia/Kolkata'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Synthetic B', '+919200000002', 'en', 'female', 'Asia/Kolkata');

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'profiles', 'households', 'household_members', 'household_invitations',
        'patients', 'scan_batches', 'scan_photos', 'medications', 'schedules',
        'dose_events', 'reminder_calls', 'reminder_call_dose_events',
        'interaction_findings', 'generic_matches', 'caregiver_alerts',
        'caregiver_alert_dose_events', 'audio_assets', 'household_audit_events'
      )
      and not relation.relrowsecurity
  ),
  'every exposed DawaiSaathi table has RLS enabled'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.patients),
  1::bigint,
  'household A owner sees only household A patient records'
);
select is(
  (
    with changed as (
      update public.patients
      set name = 'Should not be visible'
      where id = '30000000-0000-0000-0000-000000000002'
      returning 1
    )
    select count(*) from changed
  ),
  0::bigint,
  'household A owner cannot update household B patient records'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.patients),
  1::bigint,
  'household A viewer can read their household patient record'
);
select throws_ok(
  $$
    insert into public.patients (household_id, name, phone_e164, language, voice_gender, timezone)
    values ('20000000-0000-0000-0000-000000000001', 'Viewer write', '+919200000003', 'hi', 'female', 'Asia/Kolkata')
  $$,
  '42501',
  null,
  'viewer cannot create a patient record'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.patients),
  1::bigint,
  'household B owner sees only household B patient records'
);
select ok(
  not has_table_privilege('authenticated', 'public.dose_events', 'UPDATE'),
  'browser-authenticated users cannot mutate system-owned dose state directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_household_onboarding(text, text, text, text, text, text, text, boolean, uuid)',
    'EXECUTE'
  ),
  'authenticated users can use the narrow atomic onboarding RPC'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select household_id from public.create_household_onboarding(
    'One-time owner', 'en', 'Africa/Nairobi', 'First patient', '+254700000004', 'sw', 'female', false,
    '40000000-0000-0000-0000-000000000001'
  )),
  (select household_id from public.create_household_onboarding(
    'Stale replacement attempt', 'hi', 'Asia/Kolkata', 'Different patient', '+919200000004', 'hi', 'male', true,
    '40000000-0000-0000-0000-000000000002'
  )),
  'a second onboarding submission returns the original household without replacing it'
);

reset role;
select is(
  (select count(*) from private.household_onboarding_requests
   where user_id = '10000000-0000-0000-0000-000000000004'),
  1::bigint,
  'one authenticated caregiver has exactly one first-household onboarding ledger row'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
update public.patients
set phone_e164 = '+919200000010',
    sms_reminder_consent_at = now(),
    sms_reminder_consent_version = 'synthetic-test'
where id = '30000000-0000-0000-0000-000000000001';
select ok(
  (select sms_reminder_consent_at is null and sms_reminder_consent_version is null
   from public.patients
   where id = '30000000-0000-0000-0000-000000000001'),
  'a direct recipient phone change clears prior SMS consent'
);

reset role;
select * from finish();
rollback;
