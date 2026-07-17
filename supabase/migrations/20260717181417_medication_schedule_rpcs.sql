-- Controlled RPCs for tenant-scoped medication and schedule mutations.
--
-- The browser role can read reminder state but must not directly mutate
-- system-owned dose_events. These security-definer functions keep the write
-- surface small, validate auth/active household membership inside Postgres,
-- and use an empty search_path with fully qualified relations.

create or replace function public.archive_medication(medication_id_input uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_household_id uuid;
  target_patient_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required to archive a medicine' using errcode = '42501';
  end if;

  target_household_id := private.current_active_household_id();
  if target_household_id is null or not private.is_household_caregiver(target_household_id) then
    raise exception 'Only a household caregiver can archive a medicine' using errcode = '42501';
  end if;

  select medication.patient_id
  into target_patient_id
  from public.medications as medication
  where medication.id = medication_id_input
    and medication.household_id = target_household_id
  for update;

  if not found then
    raise exception 'Medicine not found' using errcode = 'P0002';
  end if;

  update public.medications
  set status = 'archived',
      updated_at = now()
  where id = medication_id_input
    and household_id = target_household_id
    and patient_id = target_patient_id;

  update public.schedules
  set active = false,
      updated_at = now()
  where household_id = target_household_id
    and patient_id = target_patient_id
    and medication_id = medication_id_input
    and active = true;

  update public.dose_events
  set status = 'skipped',
      next_attempt_at_utc = null,
      updated_at = now()
  where household_id = target_household_id
    and patient_id = target_patient_id
    and medication_id = medication_id_input
    and status = 'scheduled'
    and scheduled_at_utc >= now();

  insert into public.household_audit_events (
    household_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id
  )
  values (
    target_household_id,
    caller_id,
    'medication_archived',
    'medication',
    medication_id_input
  );
end;
$$;

create or replace function public.save_medication_schedules(
  schedules_input jsonb,
  weekly_override_patient_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_household_id uuid;
  target_patient_id uuid;
  target_patient_name text;
  target_timezone text;
  medication_ids uuid[];
  expected_count integer;
  owned_count integer;
  schedule_input jsonb;
  input_medication_id uuid;
  input_times jsonb;
  input_dose_instruction text;
  input_food_relation text;
  input_start_date date;
  input_end_date date;
  old_schedule_ids uuid[];
  new_schedule_id uuid;
  local_day date;
  local_time text;
  scheduled_at timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication is required to save schedules' using errcode = '42501';
  end if;

  target_household_id := private.current_active_household_id();
  if target_household_id is null or not private.is_household_caregiver(target_household_id) then
    raise exception 'Only a household caregiver can save schedules' using errcode = '42501';
  end if;

  select patient.id, patient.name, patient.timezone
  into target_patient_id, target_patient_name, target_timezone
  from public.patients as patient
  where patient.household_id = target_household_id
  order by patient.created_at asc
  limit 1;

  if not found then
    raise exception 'No household patient has been set up yet' using errcode = 'P0002';
  end if;

  if jsonb_typeof(schedules_input) <> 'array' or jsonb_array_length(schedules_input) = 0 then
    raise exception 'At least one schedule is required' using errcode = '22023';
  end if;

  select count(*), count(distinct value->>'medicationId')
  into expected_count, owned_count
  from jsonb_array_elements(schedules_input);

  if expected_count <> owned_count then
    raise exception 'Each medicine can have only one active schedule' using errcode = '22023';
  end if;

  select array_agg(distinct (value->>'medicationId')::uuid)
  into medication_ids
  from jsonb_array_elements(schedules_input);

  select count(*)
  into owned_count
  from public.medications as medication
  where medication.household_id = target_household_id
    and medication.patient_id = target_patient_id
    and medication.id = any(medication_ids);

  if owned_count <> coalesce(array_length(medication_ids, 1), 0) then
    raise exception 'One or more medicines do not belong to this household' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.schedules as schedule
    join public.dose_events as event
      on event.schedule_id = schedule.id
     and event.household_id = schedule.household_id
     and event.patient_id = schedule.patient_id
    where schedule.household_id = target_household_id
      and schedule.patient_id = target_patient_id
      and schedule.medication_id = any(medication_ids)
      and schedule.active = true
      and event.status = 'calling'
  ) then
    raise exception 'A reminder call is in progress. Update this schedule after the call finishes.' using errcode = '40001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(schedules_input) as item(value)
    join public.medications as medication
      on medication.id = (item.value->>'medicationId')::uuid
     and medication.household_id = target_household_id
     and medication.patient_id = target_patient_id
    where jsonb_array_length(coalesce(item.value->'times', '[]'::jsonb)) > 0
      and exists (
        select 1
        from jsonb_array_elements(medication.salts) as salt(value)
        where lower(coalesce(salt.value->>'inn', '')) = 'methotrexate'
      )
  ) then
    if lower(btrim(coalesce(weekly_override_patient_name, ''))) <> lower(btrim(target_patient_name)) then
      raise exception 'Methotrexate is usually taken weekly, not daily. Confirm the schedule with the doctor before continuing.' using errcode = '22023';
    end if;
  end if;

  for schedule_input in
    select value from jsonb_array_elements(schedules_input)
  loop
    input_medication_id := (schedule_input->>'medicationId')::uuid;
    input_times := coalesce(schedule_input->'times', '[]'::jsonb);
    input_dose_instruction := nullif(btrim(coalesce(schedule_input->>'doseInstruction', '')), '');
    input_food_relation := coalesce(schedule_input->>'foodRelation', 'any');
    input_start_date := (schedule_input->>'startDate')::date;
    input_end_date := nullif(schedule_input->>'endDate', '')::date;

    if jsonb_typeof(input_times) <> 'array' then
      raise exception 'Schedule times must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(input_times) > 0 and not private.is_valid_schedule_times(input_times) then
      raise exception 'Schedule times must use unique 15-minute HH:MM values' using errcode = '22023';
    end if;
    if jsonb_array_length(input_times) > 0 and input_dose_instruction is null then
      raise exception 'Enter the exact dose instruction before enabling a reminder' using errcode = '22023';
    end if;
    if input_food_relation not in ('before_food', 'after_food', 'with_food', 'any') then
      raise exception 'Food relation is invalid' using errcode = '22023';
    end if;
    if input_start_date is null then
      raise exception 'Start date is required' using errcode = '22023';
    end if;
    if input_end_date is not null and input_end_date < input_start_date then
      raise exception 'End date cannot be before start date' using errcode = '22023';
    end if;

    select coalesce(array_agg(locked_schedule.id), '{}'::uuid[])
    into old_schedule_ids
    from (
      select schedule.id
      from public.schedules as schedule
      where schedule.household_id = target_household_id
        and schedule.patient_id = target_patient_id
        and schedule.medication_id = input_medication_id
        and schedule.active = true
      for update
    ) as locked_schedule;

    if coalesce(array_length(old_schedule_ids, 1), 0) > 0 then
      update public.dose_events
      set status = 'skipped',
          next_attempt_at_utc = null,
          updated_at = now()
      where household_id = target_household_id
        and patient_id = target_patient_id
        and schedule_id = any(old_schedule_ids)
        and status = 'scheduled'
        and scheduled_at_utc >= now();
    end if;

    update public.schedules
    set active = false,
        updated_at = now()
    where household_id = target_household_id
      and patient_id = target_patient_id
      and medication_id = input_medication_id
      and active = true;

    if jsonb_array_length(input_times) = 0 then
      continue;
    end if;

    insert into public.schedules (
      household_id,
      patient_id,
      medication_id,
      times,
      dose_instruction,
      food_relation,
      start_date,
      end_date,
      active
    )
    values (
      target_household_id,
      target_patient_id,
      input_medication_id,
      input_times,
      input_dose_instruction,
      input_food_relation,
      input_start_date,
      input_end_date,
      true
    )
    returning id into new_schedule_id;

    for local_day in
      select (now() at time zone target_timezone)::date + day_offset.value
      from generate_series(0, 1) as day_offset(value)
    loop
      if local_day < input_start_date or (input_end_date is not null and local_day > input_end_date) then
        continue;
      end if;

      for local_time in
        select value from jsonb_array_elements_text(input_times)
      loop
        scheduled_at := (local_day + local_time::time) at time zone target_timezone;
        if scheduled_at < now() - interval '30 minutes' then
          continue;
        end if;

        insert into public.dose_events (
          household_id,
          patient_id,
          medication_id,
          schedule_id,
          scheduled_at_utc,
          status
        )
        values (
          target_household_id,
          target_patient_id,
          input_medication_id,
          new_schedule_id,
          scheduled_at,
          'scheduled'
        )
        on conflict (schedule_id, scheduled_at_utc) do nothing;
      end loop;
    end loop;
  end loop;

  insert into public.household_audit_events (
    household_id,
    actor_user_id,
    event_type,
    entity_type,
    metadata
  )
  values (
    target_household_id,
    caller_id,
    'schedules_saved',
    'schedule',
    jsonb_build_object('medicationIds', medication_ids)
  );
end;
$$;

revoke execute on function public.archive_medication(uuid) from public;
revoke execute on function public.archive_medication(uuid) from anon;
grant execute on function public.archive_medication(uuid) to authenticated;
grant execute on function public.archive_medication(uuid) to service_role;

revoke execute on function public.save_medication_schedules(jsonb, text) from public;
revoke execute on function public.save_medication_schedules(jsonb, text) from anon;
grant execute on function public.save_medication_schedules(jsonb, text) to authenticated;
grant execute on function public.save_medication_schedules(jsonb, text) to service_role;

create or replace function public.mark_dose_event(
  dose_event_id_input uuid,
  status_input text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_household_id uuid;
  target_patient_id uuid;
  current_status text;
begin
  if caller_id is null then
    raise exception 'Authentication is required to mark a dose' using errcode = '42501';
  end if;
  if status_input not in ('confirmed', 'skipped') then
    raise exception 'Dose status is invalid' using errcode = '22023';
  end if;

  target_household_id := private.current_active_household_id();
  if target_household_id is null or not private.is_household_caregiver(target_household_id) then
    raise exception 'Only a household caregiver can mark a dose' using errcode = '42501';
  end if;

  select event.patient_id, event.status
  into target_patient_id, current_status
  from public.dose_events as event
  where event.id = dose_event_id_input
    and event.household_id = target_household_id
  for update;

  if not found then
    raise exception 'Dose not found' using errcode = 'P0002';
  end if;
  if status_input = 'confirmed' and current_status = 'skipped' then
    raise exception 'A skipped dose cannot be marked as taken' using errcode = '40001';
  end if;
  if status_input = 'skipped' and current_status <> 'scheduled' then
    raise exception 'Only a pending dose can be skipped' using errcode = '40001';
  end if;
  if current_status = status_input then
    return;
  end if;

  update public.dose_events
  set status = status_input,
      confirmed_at_utc = case when status_input = 'confirmed' then now() else null end,
      confirmed_via = case when status_input = 'confirmed' then 'caregiver_manual' else null end,
      next_attempt_at_utc = null,
      updated_at = now()
  where id = dose_event_id_input
    and household_id = target_household_id
    and patient_id = target_patient_id;

  if status_input = 'confirmed' then
    update public.reminder_calls as call
    set outcome = 'confirmed',
        updated_at = now()
    where call.household_id = target_household_id
      and call.patient_id = target_patient_id
      and call.outcome is null
      and exists (
        select 1
        from public.reminder_call_dose_events as link
        where link.call_id = call.id
          and link.household_id = target_household_id
          and link.patient_id = target_patient_id
          and link.dose_event_id = dose_event_id_input
      )
      and not exists (
        select 1
        from public.reminder_call_dose_events as link
        join public.dose_events as event
          on event.id = link.dose_event_id
         and event.household_id = link.household_id
         and event.patient_id = link.patient_id
        where link.call_id = call.id
          and link.household_id = target_household_id
          and link.patient_id = target_patient_id
          and event.status <> 'confirmed'
      );
  end if;

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
    'dose_event_marked',
    'dose_event',
    dose_event_id_input,
    jsonb_build_object('status', status_input)
  );
end;
$$;

create or replace function public.confirm_dose_event_group(dose_event_ids_input uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_household_id uuid;
  target_patient_id uuid;
  dose_ids uuid[];
  expected_count integer;
  found_count integer;
  patient_count integer;
  skipped_count integer;
  pending_count integer;
  updated_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication is required to mark doses' using errcode = '42501';
  end if;

  target_household_id := private.current_active_household_id();
  if target_household_id is null or not private.is_household_caregiver(target_household_id) then
    raise exception 'Only a household caregiver can mark doses' using errcode = '42501';
  end if;

  select array_agg(distinct input.dose_id), count(*)::integer
  into dose_ids, expected_count
  from unnest(dose_event_ids_input) as input(dose_id)
  where input.dose_id is not null;

  if coalesce(array_length(dose_ids, 1), 0) = 0 then
    raise exception 'At least one dose is required' using errcode = '22023';
  end if;
  if expected_count <> array_length(dose_ids, 1) then
    raise exception 'Dose events must be unique' using errcode = '22023';
  end if;

  perform 1
  from public.dose_events as event
  where event.id = any(dose_ids)
    and event.household_id = target_household_id
  for update;

  select
    count(*)::integer,
    count(distinct event.patient_id)::integer,
    min(event.patient_id),
    count(*) filter (where event.status = 'skipped')::integer,
    count(*) filter (where event.status <> 'confirmed')::integer
  into found_count, patient_count, target_patient_id, skipped_count, pending_count
  from public.dose_events as event
  where event.id = any(dose_ids)
    and event.household_id = target_household_id;

  if found_count <> array_length(dose_ids, 1) then
    raise exception 'One or more doses were not found' using errcode = 'P0002';
  end if;
  if patient_count <> 1 then
    raise exception 'Dose group must belong to one patient' using errcode = '22023';
  end if;
  if skipped_count > 0 then
    raise exception 'A skipped dose cannot be marked as taken' using errcode = '40001';
  end if;

  update public.dose_events
  set status = 'confirmed',
      confirmed_at_utc = now(),
      confirmed_via = 'caregiver_manual',
      next_attempt_at_utc = null,
      updated_at = now()
  where id = any(dose_ids)
    and household_id = target_household_id
    and patient_id = target_patient_id
    and status in ('scheduled', 'calling', 'missed');

  get diagnostics updated_count = row_count;
  if updated_count <> pending_count then
    raise exception 'This dose group changed. Please refresh and try again.' using errcode = '40001';
  end if;

  update public.reminder_calls as call
  set outcome = 'confirmed',
      updated_at = now()
  where call.household_id = target_household_id
    and call.patient_id = target_patient_id
    and call.outcome is null
    and exists (
      select 1
      from public.reminder_call_dose_events as link
      where link.call_id = call.id
        and link.household_id = target_household_id
        and link.patient_id = target_patient_id
        and link.dose_event_id = any(dose_ids)
    )
    and not exists (
      select 1
      from public.reminder_call_dose_events as link
      join public.dose_events as event
        on event.id = link.dose_event_id
       and event.household_id = link.household_id
       and event.patient_id = link.patient_id
      where link.call_id = call.id
        and link.household_id = target_household_id
        and link.patient_id = target_patient_id
        and event.status <> 'confirmed'
    );

  insert into public.household_audit_events (
    household_id,
    actor_user_id,
    event_type,
    entity_type,
    metadata
  )
  values (
    target_household_id,
    caller_id,
    'dose_event_group_confirmed',
    'dose_event',
    jsonb_build_object('doseEventIds', dose_ids)
  );
end;
$$;

revoke execute on function public.mark_dose_event(uuid, text) from public;
revoke execute on function public.mark_dose_event(uuid, text) from anon;
grant execute on function public.mark_dose_event(uuid, text) to authenticated;
grant execute on function public.mark_dose_event(uuid, text) to service_role;

revoke execute on function public.confirm_dose_event_group(uuid[]) from public;
revoke execute on function public.confirm_dose_event_group(uuid[]) from anon;
grant execute on function public.confirm_dose_event_group(uuid[]) to authenticated;
grant execute on function public.confirm_dose_event_group(uuid[]) to service_role;
