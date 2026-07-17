import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260717181417_medication_schedule_rpcs.sql",
  "utf8",
);

describe("Supabase medication and schedule RPC migration", () => {
  it("keeps exposed RPCs behind authenticated grants and fixed search paths", () => {
    for (const signature of [
      "public.archive_medication(uuid)",
      "public.save_medication_schedules(jsonb, text)",
      "public.mark_dose_event(uuid, text)",
      "public.confirm_dose_event_group(uuid[])",
    ]) {
      expect(migration).toContain("security definer");
      expect(migration).toContain("set search_path = ''");
      expect(migration).toContain(`revoke execute on function ${signature} from public;`);
      expect(migration).toContain(`revoke execute on function ${signature} from anon;`);
      expect(migration).toContain(`grant execute on function ${signature} to authenticated;`);
    }
  });

  it("requires active household caregiver authorization inside each RPC", () => {
    expect(migration.match(/caller_id uuid := auth\.uid\(\);/g)).toHaveLength(4);
    expect(migration.match(/not private\.is_household_caregiver\(target_household_id\)/g)).toHaveLength(4);
    expect(migration.match(/private\.current_active_household_id\(\)/g)).toHaveLength(4);
  });

  it("keeps system-owned dose event mutations scoped to household and patient", () => {
    expect(migration).toContain("update public.dose_events");
    expect(migration.match(/household_id = target_household_id/g)?.length).toBeGreaterThanOrEqual(7);
    expect(migration.match(/patient_id = target_patient_id/g)?.length).toBeGreaterThanOrEqual(7);
    expect(migration).toContain("and medication_id = medication_id_input");
    expect(migration).toContain("and schedule_id = any(old_schedule_ids)");
    expect(migration).toContain("and status = 'scheduled'");
  });

  it("materializes new dose events with explicit tenant columns", () => {
    expect(migration).toContain("insert into public.dose_events");
    expect(migration).toContain("household_id");
    expect(migration).toContain("patient_id");
    expect(migration).toContain("medication_id");
    expect(migration).toContain("schedule_id");
    expect(migration).toContain("on conflict (schedule_id, scheduled_at_utc) do nothing");
  });

  it("settles reminder calls only through tenant-scoped dose event RPCs", () => {
    expect(migration).toContain("create or replace function public.mark_dose_event");
    expect(migration).toContain("create or replace function public.confirm_dose_event_group");
    expect(migration).toContain("update public.reminder_calls as call");
    expect(migration).toContain("from public.reminder_call_dose_events as link");
    expect(migration).toContain("link.household_id = target_household_id");
    expect(migration).toContain("link.patient_id = target_patient_id");
    expect(migration).toContain("event.status <> 'confirmed'");
  });
});
