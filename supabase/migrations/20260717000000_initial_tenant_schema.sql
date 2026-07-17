-- DawaiSaathi production data model.
--
-- This is intentionally a fresh tenant schema, not a D1 table copy. It
-- establishes an authenticated household boundary before any real data moves.
-- Apply it to a new Supabase project, validate the rollout gates in docs/08,
-- then enable the Supabase runtime path. Do not import real health data into
-- a project until this migration and its RLS tests have passed.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

-- Check constraints must reject invalid client input even when it bypasses UI
-- validation. These functions are schema-qualified and have no mutable search
-- path so they are safe to use in public-table constraints.
create or replace function private.is_iana_timezone(value text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = value);
$$;

create or replace function private.is_valid_schedule_times(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    jsonb_typeof(value) = 'array'
    and jsonb_array_length(value) between 1 and 4
    and not exists (
      select 1
      from jsonb_array_elements_text(value) as element(time)
      where time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or (substring(time from 4 for 2)::integer % 15) <> 0
    )
    and (
      select count(*) = count(distinct time)
      from jsonb_array_elements_text(value) as element(time)
    );
$$;

create type public.household_role as enum ('owner', 'caregiver', 'viewer');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'en' check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  timezone text not null default 'Asia/Kolkata' check (private.is_iana_timezone(timezone)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default extensions.gen_random_uuid(),
  caregiver_name text not null check (char_length(btrim(caregiver_name)) between 1 and 120),
  ui_language text not null default 'en' check (ui_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.household_role not null default 'caregiver',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- The active household is a convenience preference, not an authorization
-- boundary. Every protected operation still proves membership with RLS.
alter table public.profiles
  add column active_household_id uuid references public.households (id) on delete set null;

-- Invitations are bound to one verified caregiver email or E.164 phone and
-- are single-use. Only a SHA-256 hash of the opaque token is stored; the raw
-- token is returned once to the trusted sender workflow and must never be
-- logged or placed in analytics.
create table public.household_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  invitee_email text check (
    invitee_email = lower(btrim(invitee_email))
    and char_length(invitee_email) between 3 and 254
    and invitee_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  invitee_phone_e164 text check (invitee_phone_e164 ~ '^[+][1-9][0-9]{6,14}$'),
  role public.household_role not null default 'caregiver' check (role in ('caregiver', 'viewer')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((invitee_email is not null) <> (invitee_phone_e164 is not null)),
  check (expires_at > created_at),
  check (accepted_at is null or accepted_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

create unique index household_invitations_one_live_email_idx
  on public.household_invitations (household_id, invitee_email)
  where invitee_email is not null and accepted_at is null and revoked_at is null;
create unique index household_invitations_one_live_phone_idx
  on public.household_invitations (household_id, invitee_phone_e164)
  where invitee_phone_e164 is not null and accepted_at is null and revoked_at is null;

create table public.patients (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone_e164 text not null check (phone_e164 ~ '^[+][1-9][0-9]{6,14}$'),
  language text not null default 'hi' check (language in ('en', 'hi', 'bn', 'ar', 'fr', 'pt', 'af', 'am', 'sw', 'ha', 'yo', 'es')),
  voice_gender text not null default 'female' check (voice_gender in ('female', 'male')),
  timezone text not null default 'Asia/Kolkata' check (private.is_iana_timezone(timezone)),
  sms_reminder_consent_at timestamptz,
  sms_reminder_consent_version text check (sms_reminder_consent_version is null or char_length(btrim(sms_reminder_consent_version)) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  check (
    (sms_reminder_consent_at is null and sms_reminder_consent_version is null)
    or (
      sms_reminder_consent_at is not null
      and sms_reminder_consent_version is not null
      and language in ('en', 'hi')
    )
  )
);

create table public.scan_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  patient_id uuid not null,
  status text not null default 'processing' check (status in ('processing', 'extracted', 'confirming', 'confirmed', 'failed')),
  raw_extraction jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, patient_id, household_id),
  foreign key (patient_id, household_id)
    references public.patients (id, household_id) on delete cascade
);

create table public.scan_photos (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  patient_id uuid not null,
  batch_id uuid not null,
  object_key text not null check (char_length(object_key) between 1 and 512 and object_key !~ '(^|/)[.][.](/|$)'),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  created_at timestamptz not null default now(),
  foreign key (batch_id, patient_id, household_id)
    references public.scan_batches (id, patient_id, household_id) on delete cascade
);

create table public.medications (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  patient_id uuid not null,
  scan_batch_id uuid,
  brand_name text not null check (char_length(btrim(brand_name)) between 1 and 240),
  display_generic text not null check (char_length(btrim(display_generic)) between 1 and 240),
  salts jsonb not null default '[]'::jsonb check (jsonb_typeof(salts) = 'array'),
  form text not null default 'tablet' check (form in ('tablet', 'capsule', 'syrup', 'drops', 'injection', 'cream', 'other')),
  pack_size integer check (pack_size > 0),
  mrp_inr numeric(12, 2) check (mrp_inr >= 0),
  expiry_month date,
  batch_number text,
  manufacturer text,
  high_risk boolean not null default false,
  high_risk_reason text,
  field_confidence jsonb check (field_confidence is null or jsonb_typeof(field_confidence) = 'object'),
  usual_frequency_hint jsonb check (usual_frequency_hint is null or jsonb_typeof(usual_frequency_hint) = 'object'),
  status text not null default 'active' check (status in ('active', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, patient_id, household_id),
  foreign key (patient_id, household_id)
    references public.patients (id, household_id) on delete cascade,
  foreign key (scan_batch_id, patient_id, household_id)
    references public.scan_batches (id, patient_id, household_id) on delete restrict
);

create table public.schedules (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  patient_id uuid not null,
  medication_id uuid not null,
  times jsonb not null check (private.is_valid_schedule_times(times)),
  dose_instruction text not null check (char_length(btrim(dose_instruction)) between 1 and 120),
  food_relation text not null default 'any' check (food_relation in ('before_food', 'after_food', 'with_food', 'any')),
  start_date date not null,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  unique (id, medication_id, patient_id, household_id),
  foreign key (medication_id, patient_id, household_id)
    references public.medications (id, patient_id, household_id) on delete cascade
);

create table public.dose_events (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  patient_id uuid not null,
  medication_id uuid not null,
  schedule_id uuid not null,
  scheduled_at_utc timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'calling', 'confirmed', 'missed', 'skipped', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at_utc timestamptz,
  confirmed_at_utc timestamptz,
  confirmed_via text check (confirmed_via in ('ivr_dtmf', 'caregiver_manual', 'simulated')),
  idempotency_key uuid not null default extensions.gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, scheduled_at_utc),
  unique (household_id, idempotency_key),
  unique (id, patient_id, household_id),
  foreign key (schedule_id, medication_id, patient_id, household_id)
    references public.schedules (id, medication_id, patient_id, household_id) on delete cascade
);

create table public.reminder_calls (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  patient_id uuid not null,
  scheduled_at_utc timestamptz not null,
  attempt integer not null check (attempt > 0),
  mode text not null default 'twilio' check (mode in ('twilio', 'simulated')),
  idempotency_key uuid not null default extensions.gen_random_uuid(),
  twilio_call_sid text unique,
  twilio_status text,
  digits_pressed text,
  outcome text check (outcome in ('confirmed', 'no_input', 'not_answered', 'failed')),
  replay_count integer not null default 0 check (replay_count >= 0),
  audio_object_key text not null check (char_length(audio_object_key) between 1 and 512 and audio_object_key !~ '(^|/)[.][.](/|$)'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, idempotency_key),
  unique (id, patient_id, household_id),
  foreign key (patient_id, household_id)
    references public.patients (id, household_id) on delete cascade
);

create table public.reminder_call_dose_events (
  call_id uuid not null,
  dose_event_id uuid not null,
  household_id uuid not null,
  patient_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (call_id, dose_event_id),
  foreign key (call_id, patient_id, household_id)
    references public.reminder_calls (id, patient_id, household_id) on delete cascade,
  foreign key (dose_event_id, patient_id, household_id)
    references public.dose_events (id, patient_id, household_id) on delete cascade
);

create table public.interaction_findings (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  patient_id uuid not null,
  run_id uuid not null default extensions.gen_random_uuid(),
  pair_key text not null,
  med_a_id uuid not null,
  med_b_id uuid not null,
  salt_a text not null,
  salt_b text not null,
  severity text not null check (severity in ('major', 'moderate', 'minor', 'unverified')),
  source text not null check (source in ('curated', 'openfda', 'llm_suspected')),
  explanation_en text not null,
  explanation_hi text not null,
  action_en text not null,
  action_hi text not null,
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  acknowledged boolean not null default false,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (patient_id, household_id)
    references public.patients (id, household_id) on delete cascade,
  foreign key (med_a_id, patient_id, household_id)
    references public.medications (id, patient_id, household_id) on delete cascade,
  foreign key (med_b_id, patient_id, household_id)
    references public.medications (id, patient_id, household_id) on delete cascade,
  check (med_a_id <> med_b_id)
);

create table public.generic_matches (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  patient_id uuid not null,
  medication_id uuid not null,
  ja_product_code text,
  ja_product_name text,
  ja_pack_size integer check (ja_pack_size > 0),
  ja_mrp_inr numeric(12, 2) check (ja_mrp_inr >= 0),
  ja_unit_price_inr numeric(12, 4) check (ja_unit_price_inr >= 0),
  brand_unit_price_inr numeric(12, 4) check (brand_unit_price_inr >= 0),
  monthly_savings_inr integer check (monthly_savings_inr >= 0),
  confidence text check (confidence in ('high', 'medium', 'low')),
  estimated boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (medication_id, patient_id, household_id)
    references public.medications (id, patient_id, household_id) on delete cascade
);

create table public.caregiver_alerts (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  patient_id uuid not null,
  type text not null check (type in ('unconfirmed_dose', 'call_failed', 'safety_finding')),
  message_en text not null,
  message_hi text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, patient_id, household_id),
  foreign key (patient_id, household_id)
    references public.patients (id, household_id) on delete cascade
);

create table public.caregiver_alert_dose_events (
  alert_id uuid not null,
  dose_event_id uuid not null,
  household_id uuid not null,
  patient_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (alert_id, dose_event_id),
  foreign key (alert_id, patient_id, household_id)
    references public.caregiver_alerts (id, patient_id, household_id) on delete cascade,
  foreign key (dose_event_id, patient_id, household_id)
    references public.dose_events (id, patient_id, household_id) on delete cascade
);

create table public.audio_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  patient_id uuid not null,
  content_hash text not null check (content_hash ~ '^[A-Fa-f0-9]{64}$'),
  language text not null check (language in ('en', 'hi', 'bn', 'ar', 'fr', 'pt', 'af', 'am', 'sw', 'ha', 'yo', 'es')),
  script_text text not null,
  object_key text not null check (char_length(object_key) between 1 and 512 and object_key !~ '(^|/)[.][.](/|$)'),
  created_at timestamptz not null default now(),
  unique (household_id, content_hash),
  foreign key (patient_id, household_id)
    references public.patients (id, household_id) on delete cascade
);

-- Worker-only tables are not exposed through the Data API. They have no
-- browser grants and must be accessed only by trusted Workers/RPCs.
create table private.ai_request_budgets (
  day date not null,
  operation text not null check (operation in ('llm', 'tts')),
  requests integer not null default 0 check (requests >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, operation)
);

create table private.sms_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  patient_id uuid not null,
  reminder_call_id uuid not null unique,
  to_e164 text not null check (to_e164 ~ '^[+][1-9][0-9]{6,14}$'),
  kind text not null default 'unconfirmed_reminder',
  body_version text not null check (char_length(btrim(body_version)) between 1 and 64),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed')),
  twilio_message_sid text unique,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (patient_id, household_id)
    references public.patients (id, household_id) on delete cascade,
  foreign key (reminder_call_id, patient_id, household_id)
    references public.reminder_calls (id, patient_id, household_id) on delete cascade
);

-- A Twilio STOP is provider-level for a recipient and sender scope, not a
-- household preference. It intentionally has no patient foreign key, so a
-- valid opt-out still suppresses future sends after a household is deleted or
-- a phone number is later added to another household.
create table private.sms_sender_suppressions (
  sender_scope text not null check (char_length(btrim(sender_scope)) between 1 and 128),
  phone_e164 text not null check (phone_e164 ~ '^[+][1-9][0-9]{6,14}$'),
  opted_out_at timestamptz not null default now(),
  source text not null default 'twilio_stop' check (source in ('twilio_stop')),
  updated_at timestamptz not null default now(),
  primary key (sender_scope, phone_e164)
);

-- The RPC uses this record to make a network retry (including one with a new
-- client idempotency key) return the same first household, not a second
-- family. It is private because it is an internal workflow ledger, not
-- application data exposed through the Data API.
create table private.household_onboarding_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key),
  unique (user_id)
);

create table public.household_audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

-- Query indexes begin with household_id so RLS-scoped application paths stay
-- efficient as the number of families grows.
create index household_members_user_household_idx on public.household_members (user_id, household_id);
create index profiles_active_household_idx on public.profiles (active_household_id) where active_household_id is not null;
create index household_invitations_household_pending_idx on public.household_invitations (household_id, expires_at)
  where accepted_at is null and revoked_at is null;
create index household_invitations_invitee_pending_idx on public.household_invitations (invitee_email, expires_at)
  where invitee_email is not null and accepted_at is null and revoked_at is null;
create index household_invitations_phone_pending_idx on public.household_invitations (invitee_phone_e164, expires_at)
  where invitee_phone_e164 is not null and accepted_at is null and revoked_at is null;
create index patients_household_created_idx on public.patients (household_id, created_at desc);
create index scan_batches_household_status_created_idx on public.scan_batches (household_id, status, created_at desc);
create index scan_photos_household_batch_idx on public.scan_photos (household_id, batch_id);
create index scan_batches_patient_idx on public.scan_batches (patient_id);
create index scan_photos_patient_idx on public.scan_photos (patient_id);
create index medications_household_patient_status_idx on public.medications (household_id, patient_id, status);
create index medications_scan_batch_idx on public.medications (scan_batch_id);
create index schedules_household_patient_active_idx on public.schedules (household_id, patient_id, active);
create index schedules_medication_idx on public.schedules (medication_id);
create index dose_events_household_status_due_idx on public.dose_events (household_id, status, scheduled_at_utc);
create index dose_events_schedule_idx on public.dose_events (schedule_id);
create index dose_events_due_partial_idx on public.dose_events (scheduled_at_utc, next_attempt_at_utc)
  where status in ('scheduled', 'calling');
create index reminder_calls_household_patient_scheduled_idx on public.reminder_calls (household_id, patient_id, scheduled_at_utc desc);
create index reminder_call_dose_events_household_idx on public.reminder_call_dose_events (household_id, dose_event_id);
create index interaction_findings_household_patient_ack_idx on public.interaction_findings (household_id, patient_id, acknowledged);
create index generic_matches_household_medication_idx on public.generic_matches (household_id, medication_id);
create index caregiver_alerts_household_patient_read_idx on public.caregiver_alerts (household_id, patient_id, read_at, created_at desc);
create index caregiver_alert_dose_events_household_idx on public.caregiver_alert_dose_events (household_id, dose_event_id);
create index audio_assets_household_patient_idx on public.audio_assets (household_id, patient_id, created_at desc);
create index household_audit_events_household_created_idx on public.household_audit_events (household_id, created_at desc);
create index household_audit_events_actor_idx on public.household_audit_events (actor_user_id);
create index private_sms_deliveries_patient_created_idx on private.sms_deliveries (patient_id, created_at desc);
create index private_sms_deliveries_status_created_idx on private.sms_deliveries (status, created_at);
create index private_household_onboarding_requests_household_idx on private.household_onboarding_requests (household_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- A member who happens to belong to two households must not be able to move a
-- record between them through an update. Cross-household transfers require a
-- separately audited server-side workflow.
create or replace function private.prevent_household_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.household_id is distinct from new.household_id then
    raise exception 'household_id is immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Consent is tied to a specific recipient and reviewed SMS language. Even a
-- direct authenticated REST update cannot carry a previous opt-in to a new
-- phone number or an unreviewed language.
create or replace function private.reset_patient_sms_consent_on_delivery_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.phone_e164 is distinct from new.phone_e164
    or new.language not in ('en', 'hi') then
    new.sms_reminder_consent_at = null;
    new.sms_reminder_consent_version = null;
  end if;
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger households_set_updated_at before update on public.households
  for each row execute function private.set_updated_at();
create trigger household_invitations_set_updated_at before update on public.household_invitations
  for each row execute function private.set_updated_at();
create trigger patients_set_updated_at before update on public.patients
  for each row execute function private.set_updated_at();
create trigger patients_reset_sms_consent_on_delivery_change before update on public.patients
  for each row execute function private.reset_patient_sms_consent_on_delivery_change();
create trigger scan_batches_set_updated_at before update on public.scan_batches
  for each row execute function private.set_updated_at();
create trigger medications_set_updated_at before update on public.medications
  for each row execute function private.set_updated_at();
create trigger schedules_set_updated_at before update on public.schedules
  for each row execute function private.set_updated_at();
create trigger dose_events_set_updated_at before update on public.dose_events
  for each row execute function private.set_updated_at();
create trigger reminder_calls_set_updated_at before update on public.reminder_calls
  for each row execute function private.set_updated_at();
create trigger ai_request_budgets_set_updated_at before update on private.ai_request_budgets
  for each row execute function private.set_updated_at();
create trigger sms_deliveries_set_updated_at before update on private.sms_deliveries
  for each row execute function private.set_updated_at();
create trigger sms_sender_suppressions_set_updated_at before update on private.sms_sender_suppressions
  for each row execute function private.set_updated_at();

do $$
declare
  tenant_table text;
begin
  foreach tenant_table in array array[
    'patients',
    'household_invitations',
    'scan_batches',
    'scan_photos',
    'medications',
    'schedules',
    'dose_events',
    'reminder_calls',
    'reminder_call_dose_events',
    'interaction_findings',
    'generic_matches',
    'caregiver_alerts',
    'caregiver_alert_dose_events',
    'audio_assets',
    'household_audit_events'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.prevent_household_id_change()',
      tenant_table || '_prevent_household_move',
      tenant_table
    );
  end loop;
end;
$$;

-- Security-definer helpers avoid recursive RLS evaluation on household_members.
-- They return only a boolean and pin search_path to prevent object shadowing.
create or replace function private.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members as membership
    where membership.household_id = target_household_id
      and membership.user_id = auth.uid()
  );
$$;

create or replace function private.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members as membership
    where membership.household_id = target_household_id
      and membership.user_id = auth.uid()
      and membership.role = 'owner'
  );
$$;

create or replace function private.is_household_caregiver(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members as membership
    where membership.household_id = target_household_id
      and membership.user_id = auth.uid()
      and membership.role in ('owner', 'caregiver')
  );
$$;

create or replace function private.current_active_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile.active_household_id
  from public.profiles as profile
  where profile.id = auth.uid();
$$;

-- Auth sign-up creates only a profile. Health data is created only through an
-- authenticated, idempotent onboarding RPC; an account cannot attach itself
-- to another family's household by passing an ID from the browser.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.create_household_onboarding(
  caregiver_name_input text,
  ui_language_input text,
  timezone_input text,
  patient_name_input text,
  patient_phone_e164_input text,
  patient_language_input text,
  patient_voice_gender_input text,
  sms_reminder_consent_input boolean,
  idempotency_key_input uuid
)
returns table (household_id uuid, patient_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  existing_request private.household_onboarding_requests%rowtype;
  created_household_id uuid;
  created_patient_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required to finish onboarding' using errcode = '42501';
  end if;
  if idempotency_key_input is null then
    raise exception 'An onboarding idempotency key is required' using errcode = '22023';
  end if;
  -- Serialize all onboarding attempts for this authenticated caregiver. A
  -- retry must return the existing setup even if the app generated a new key
  -- or submitted stale form values; it must never overwrite health data.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text, 0)
  );
  select *
  into existing_request
  from private.household_onboarding_requests
  where user_id = caller_id;
  if found then
    return query select existing_request.household_id, existing_request.patient_id;
    return;
  end if;

  -- A caregiver who joined another household through an invite cannot use the
  -- first-household flow to silently create a second independent account.
  if exists (
    select 1
    from public.household_members as membership
    where membership.user_id = caller_id
  ) then
    raise exception 'This caregiver already belongs to a household' using errcode = '23505';
  end if;

  if caregiver_name_input is null or char_length(btrim(caregiver_name_input)) not between 1 and 120 then
    raise exception 'Caregiver name must contain between 1 and 120 characters' using errcode = '22023';
  end if;
  if patient_name_input is null or char_length(btrim(patient_name_input)) not between 1 and 120 then
    raise exception 'Patient name must contain between 1 and 120 characters' using errcode = '22023';
  end if;
  if patient_phone_e164_input is null or patient_phone_e164_input !~ '^[+][1-9][0-9]{6,14}$' then
    raise exception 'Patient phone must be a valid E.164 phone number' using errcode = '22023';
  end if;
  if ui_language_input not in ('en', 'hi', 'es') then
    raise exception 'The app interface language must be en, hi, or es' using errcode = '22023';
  end if;
  if patient_language_input not in ('en', 'hi', 'bn', 'ar', 'fr', 'pt', 'af', 'am', 'sw', 'ha', 'yo', 'es') then
    raise exception 'The patient call language is not supported' using errcode = '22023';
  end if;
  if coalesce(sms_reminder_consent_input, false) and patient_language_input not in ('en', 'hi') then
    raise exception 'SMS follow-ups are currently available only in English and Hindi' using errcode = '22023';
  end if;
  if patient_voice_gender_input not in ('female', 'male') then
    raise exception 'The patient voice must be female or male' using errcode = '22023';
  end if;
  if timezone_input is null or not private.is_iana_timezone(timezone_input) then
    raise exception 'A valid IANA timezone is required' using errcode = '22023';
  end if;

  insert into public.households (caregiver_name, ui_language)
  values (btrim(caregiver_name_input), ui_language_input)
  returning id into created_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (created_household_id, caller_id, 'owner');

  insert into public.patients (
    household_id,
    name,
    phone_e164,
    language,
    voice_gender,
    timezone,
    sms_reminder_consent_at,
    sms_reminder_consent_version
  )
  values (
    created_household_id,
    btrim(patient_name_input),
    patient_phone_e164_input,
    patient_language_input,
    patient_voice_gender_input,
    timezone_input,
    case when coalesce(sms_reminder_consent_input, false) then now() else null end,
    case when coalesce(sms_reminder_consent_input, false) then '2026-07-17' else null end
  )
  returning id into created_patient_id;

  insert into public.profiles (id, display_name, locale, timezone, active_household_id)
  values (caller_id, btrim(caregiver_name_input), ui_language_input, timezone_input, created_household_id)
  on conflict (id) do update
    set display_name = excluded.display_name,
        locale = excluded.locale,
        timezone = excluded.timezone,
        active_household_id = excluded.active_household_id;

  insert into private.household_onboarding_requests (
    user_id,
    idempotency_key,
    household_id,
    patient_id
  )
  values (caller_id, idempotency_key_input, created_household_id, created_patient_id);

  insert into public.household_audit_events (
    household_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    created_household_id,
    caller_id,
    'household_onboarded',
    'household',
    created_household_id,
    jsonb_build_object('onboarding_version', '2026-07-17')
  );

  return query select created_household_id, created_patient_id;
end;
$$;

-- A user may belong to several families, but their chosen household is set
-- server-side after a membership check. This never turns a request parameter
-- into an authorization decision.
create or replace function public.set_active_household(target_household_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Authentication is required to switch households' using errcode = '42501';
  end if;
  if target_household_id is null or not private.is_household_member(target_household_id) then
    raise exception 'You do not have access to that household' using errcode = '42501';
  end if;

  insert into public.profiles (id, active_household_id)
  values (caller_id, target_household_id)
  on conflict (id) do update
    set active_household_id = excluded.active_household_id;

  return target_household_id;
end;
$$;

-- Invitation creation/revocation is owner-only. Delivery itself belongs in a
-- trusted Worker so raw tokens never pass through browser analytics.
create or replace function public.create_household_invitation(
  invitee_contact_input text,
  role_input text default 'caregiver'
)
returns table (invitation_id uuid, invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_household_id uuid;
  normalized_email text;
  normalized_phone text;
  requested_role public.household_role;
  raw_token text;
  hashed_token text;
  created_invitation_id uuid;
  invitation_expiry timestamptz := now() + interval '7 days';
begin
  if caller_id is null then
    raise exception 'Authentication is required to invite a caregiver' using errcode = '42501';
  end if;
  normalized_email := lower(btrim(invitee_contact_input));
  normalized_phone := btrim(invitee_contact_input);
  if normalized_phone !~ '^[+][1-9][0-9]{6,14}$' then
    normalized_phone := null;
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    normalized_email := null;
  end if;
  if normalized_email is null and normalized_phone is null then
    raise exception 'A valid invitation email or phone number is required' using errcode = '22023';
  end if;
  if role_input not in ('caregiver', 'viewer') then
    raise exception 'Only caregiver or viewer invitations are allowed' using errcode = '22023';
  end if;
  requested_role := role_input::public.household_role;
  target_household_id := private.current_active_household_id();
  if target_household_id is null or not private.is_household_owner(target_household_id) then
    raise exception 'Only the household owner can invite a caregiver' using errcode = '42501';
  end if;

  raw_token := replace(extensions.gen_random_uuid()::text, '-', '')
    || replace(extensions.gen_random_uuid()::text, '-', '');
  hashed_token := encode(extensions.digest(raw_token, 'sha256'), 'hex');

  -- Re-sending replaces an unaccepted link instead of leaving multiple valid
  -- credentials for the same verified email address or phone number.
  update public.household_invitations
  set revoked_at = now()
  where household_id = target_household_id
    and (
      (normalized_email is not null and invitee_email = normalized_email)
      or (normalized_phone is not null and invitee_phone_e164 = normalized_phone)
    )
    and accepted_at is null
    and revoked_at is null;

  insert into public.household_invitations (
    household_id,
    invitee_email,
    invitee_phone_e164,
    role,
    token_hash,
    invited_by,
    expires_at
  )
  values (
    target_household_id,
    normalized_email,
    normalized_phone,
    requested_role,
    hashed_token,
    caller_id,
    invitation_expiry
  )
  returning id into created_invitation_id;

  insert into public.household_audit_events (
    household_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_household_id,
    caller_id,
    'caregiver_invited',
    'household_invitation',
    created_invitation_id,
    jsonb_build_object('role', role_input)
  );

  return query select created_invitation_id, raw_token, invitation_expiry;
end;
$$;

create or replace function public.accept_household_invitation(invite_token_input text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  caller_phone text;
  invitation public.household_invitations%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required to accept an invitation' using errcode = '42501';
  end if;
  if invite_token_input is null or invite_token_input !~ '^[a-f0-9]{64}$' then
    raise exception 'The invitation link is invalid' using errcode = '22023';
  end if;

  select *
  into invitation
  from public.household_invitations
  where token_hash = encode(extensions.digest(invite_token_input, 'sha256'), 'hex')
  for update;
  if not found
    or invitation.accepted_at is not null
    or invitation.revoked_at is not null
    or invitation.expires_at <= now() then
    raise exception 'The invitation link is expired or has already been used' using errcode = '22023';
  end if;

  select lower(user_record.email), user_record.phone
  into caller_email, caller_phone
  from auth.users as user_record
  where user_record.id = caller_id;
  if (invitation.invitee_email is not null and caller_email is distinct from invitation.invitee_email)
    or (invitation.invitee_phone_e164 is not null and caller_phone is distinct from invitation.invitee_phone_e164) then
    raise exception 'Sign in with the caregiver email address or phone number that received this invitation' using errcode = '42501';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (invitation.household_id, caller_id, invitation.role)
  on conflict (household_id, user_id) do nothing;

  insert into public.profiles (id, active_household_id)
  values (caller_id, invitation.household_id)
  on conflict (id) do update
    set active_household_id = coalesce(public.profiles.active_household_id, excluded.active_household_id);

  update public.household_invitations
  set accepted_at = now(),
      accepted_by = caller_id
  where id = invitation.id;

  insert into public.household_audit_events (
    household_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    invitation.household_id,
    caller_id,
    'caregiver_invitation_accepted',
    'household_invitation',
    invitation.id,
    jsonb_build_object('role', invitation.role::text)
  );

  return invitation.household_id;
end;
$$;

create or replace function public.revoke_household_invitation(invitation_id_input uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  invitation public.household_invitations%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required to revoke an invitation' using errcode = '42501';
  end if;
  select *
  into invitation
  from public.household_invitations
  where id = invitation_id_input
  for update;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if not private.is_household_owner(invitation.household_id) then
    raise exception 'Only the household owner can revoke an invitation' using errcode = '42501';
  end if;
  if invitation.accepted_at is not null or invitation.revoked_at is not null then
    raise exception 'That invitation is no longer active' using errcode = '22023';
  end if;

  update public.household_invitations
  set revoked_at = now()
  where id = invitation.id;

  insert into public.household_audit_events (
    household_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id
  )
  values (invitation.household_id, caller_id, 'caregiver_invitation_revoked', 'household_invitation', invitation.id);
end;
$$;

create or replace function public.remove_household_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_household_id uuid;
  target_role public.household_role;
begin
  if caller_id is null then
    raise exception 'Authentication is required to manage caregivers' using errcode = '42501';
  end if;
  target_household_id := private.current_active_household_id();
  if target_household_id is null or not private.is_household_owner(target_household_id) then
    raise exception 'Only the household owner can remove a caregiver' using errcode = '42501';
  end if;
  if target_user_id is null or target_user_id = caller_id then
    raise exception 'The household owner cannot remove themselves' using errcode = '22023';
  end if;
  select membership.role
  into target_role
  from public.household_members as membership
  where membership.household_id = target_household_id
    and membership.user_id = target_user_id
  for update;
  if not found then
    raise exception 'Caregiver not found in this household' using errcode = 'P0002';
  end if;
  if target_role = 'owner' then
    raise exception 'Transfer ownership through a separately audited workflow before removing an owner' using errcode = '22023';
  end if;

  delete from public.household_members
  where household_id = target_household_id
    and user_id = target_user_id;
  update public.profiles
  set active_household_id = null
  where id = target_user_id
    and active_household_id = target_household_id;

  insert into public.household_audit_events (
    household_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id
  )
  values (target_household_id, caller_id, 'caregiver_removed', 'household_member', target_user_id);
end;
$$;

-- Every table reachable through Supabase's exposed public schema has RLS. The
-- private tables have RLS too as defense in depth, even though they receive no
-- browser grants and are not part of the Data API.
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.households enable row level security;
alter table public.households force row level security;
alter table public.household_members enable row level security;
alter table public.household_members force row level security;
alter table public.household_invitations enable row level security;
alter table public.household_invitations force row level security;
alter table private.ai_request_budgets enable row level security;
alter table private.sms_deliveries enable row level security;
alter table private.sms_sender_suppressions enable row level security;
alter table private.household_onboarding_requests enable row level security;

create policy profiles_select_self on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_self on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy households_select_member on public.households
  for select to authenticated using ((select private.is_household_member(id)));
create policy households_update_owner on public.households
  for update to authenticated
  using ((select private.is_household_owner(id)))
  with check ((select private.is_household_owner(id)));

create policy household_members_select_member on public.household_members
  for select to authenticated using ((select private.is_household_member(household_id)));
create policy household_invitations_select_owner on public.household_invitations
  for select to authenticated using ((select private.is_household_owner(household_id)));

-- A viewer can read a household. Only an owner/caregiver can change the
-- caregiver-managed records. Reminder state, calls, audio, audit records, and
-- SMS delivery are system-owned: there is intentionally no direct browser
-- mutation policy for them.
do $$
declare
  tenant_table text;
begin
  foreach tenant_table in array array[
    'patients',
    'scan_batches',
    'scan_photos',
    'medications',
    'schedules',
    'dose_events',
    'reminder_calls',
    'reminder_call_dose_events',
    'interaction_findings',
    'generic_matches',
    'caregiver_alerts',
    'caregiver_alert_dose_events',
    'audio_assets'
  ]
  loop
    execute format('alter table public.%I enable row level security', tenant_table);
    execute format('alter table public.%I force row level security', tenant_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_household_member(household_id)))',
      tenant_table || '_select_member',
      tenant_table
    );
  end loop;
end;
$$;

alter table public.household_audit_events enable row level security;
alter table public.household_audit_events force row level security;
create policy household_audit_events_select_owner on public.household_audit_events
  for select to authenticated using ((select private.is_household_owner(household_id)));

do $$
declare
  writable_table text;
begin
  foreach writable_table in array array[
    'patients',
    'scan_batches',
    'scan_photos',
    'medications',
    'schedules'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_household_caregiver(household_id)))',
      writable_table || '_insert_caregiver',
      writable_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.is_household_caregiver(household_id))) with check ((select private.is_household_caregiver(household_id)))',
      writable_table || '_update_caregiver',
      writable_table
    );
  end loop;
end;
$$;

create policy interaction_findings_acknowledge_caregiver on public.interaction_findings
  for update to authenticated
  using ((select private.is_household_caregiver(household_id)))
  with check ((select private.is_household_caregiver(household_id)));
create policy caregiver_alerts_acknowledge_caregiver on public.caregiver_alerts
  for update to authenticated
  using ((select private.is_household_caregiver(household_id)))
  with check ((select private.is_household_caregiver(household_id)));

-- Deny anonymous access explicitly, then grant only the surface that the RLS
-- policies above were designed to authorize. The service-role key remains
-- Worker-only and is never placed in a NEXT_PUBLIC_* variable.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on schema private from anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant usage on schema private to authenticated, service_role;

grant select on
  public.profiles,
  public.households,
  public.household_members,
  public.household_invitations,
  public.patients,
  public.scan_batches,
  public.scan_photos,
  public.medications,
  public.schedules,
  public.dose_events,
  public.reminder_calls,
  public.reminder_call_dose_events,
  public.interaction_findings,
  public.generic_matches,
  public.caregiver_alerts,
  public.caregiver_alert_dose_events,
  public.audio_assets,
  public.household_audit_events
to authenticated;
grant update (display_name, locale, timezone) on public.profiles to authenticated;
grant update (caregiver_name, ui_language) on public.households to authenticated;
grant insert, update on
  public.patients,
  public.scan_batches,
  public.scan_photos,
  public.medications,
  public.schedules
to authenticated;
grant update (acknowledged, acknowledged_at) on public.interaction_findings to authenticated;
grant update (read_at) on public.caregiver_alerts to authenticated;

-- The trusted Worker needs the whole transactional surface; its service role
-- is never sent to the browser and bypasses RLS only after Worker-side request
-- authentication, validation, and audit logging have happened.
grant all on all tables in schema public to service_role;
grant all on all tables in schema private to service_role;

revoke all on all functions in schema public from public;
revoke all on all functions in schema private from public;
-- These deterministic constraint helpers must be callable by an authenticated
-- INSERT/UPDATE; they validate shape only and expose no tenant data.
grant execute on function private.is_iana_timezone(text) to authenticated;
grant execute on function private.is_valid_schedule_times(jsonb) to authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function private.is_household_owner(uuid) to authenticated;
grant execute on function private.is_household_caregiver(uuid) to authenticated;
grant execute on function private.current_active_household_id() to authenticated;
grant execute on function public.create_household_onboarding(text, text, text, text, text, text, text, boolean, uuid) to authenticated;
grant execute on function public.set_active_household(uuid) to authenticated;
grant execute on function public.create_household_invitation(text, text) to authenticated;
grant execute on function public.accept_household_invitation(text) to authenticated;
grant execute on function public.revoke_household_invitation(uuid) to authenticated;
grant execute on function public.remove_household_member(uuid) to authenticated;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;

comment on table public.households is 'Authenticated caregiver households. Every health-record table is tenant scoped by household_id and checked by RLS.';
comment on table public.household_invitations is 'Owner-managed, email- or phone-bound, single-use caregiver invitations. Only a SHA-256 token hash is stored.';
comment on table private.ai_request_budgets is 'Worker-only AI cost guardrail; no browser grants.';
comment on table private.sms_sender_suppressions is 'Worker-only, sender-scoped Twilio STOP suppression that survives household deletion.';
comment on function private.reset_patient_sms_consent_on_delivery_change() is 'Clears SMS consent when a patient recipient phone or reviewed SMS language changes.';
comment on table private.household_onboarding_requests is 'Private, one-per-auth-user ledger for atomic first-household onboarding.';
comment on function public.create_household_onboarding(text, text, text, text, text, text, text, boolean, uuid) is 'Authenticated, atomic, immutable first-caregiver and first-patient onboarding RPC.';
