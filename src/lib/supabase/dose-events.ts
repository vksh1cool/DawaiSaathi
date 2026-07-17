import "server-only";

import { AppError } from "@/lib/errors";
import { supabaseDatabaseError } from "@/lib/supabase/errors";
import { getSupabaseHousehold, type TenantHousehold } from "@/lib/supabase/household";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";
import { expiryStatus, localDayBoundsUtc, utcToLocalDate, utcToLocalTime } from "@/lib/util/dates";
import type { DoseStatus, FoodRelation, MedForm, TodayGroup } from "@/types/domain";
import { DateTime } from "luxon";

const TODAY_COLUMNS = [
  "id",
  "medication_id",
  "scheduled_at_utc",
  "status",
  "medications!inner(id,brand_name,form,high_risk,expiry_month)",
  "schedules(food_relation)",
].join(",");

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type SupabaseRow = Record<string, unknown>;

const databaseError = supabaseDatabaseError;

async function requireTenant(client: SupabaseClient): Promise<TenantHousehold & { patient: NonNullable<TenantHousehold["patient"]> }> {
  const userId = await getSupabaseUserId();
  if (!userId) throw new AppError("UNAUTHORIZED", "Caregiver sign-in is required.");
  const household = await getSupabaseHousehold(client);
  if (!household?.patient) {
    throw new AppError("NOT_FOUND", "No household set up yet. Complete onboarding first.");
  }
  return household as TenantHousehold & { patient: NonNullable<TenantHousehold["patient"]> };
}

function relation(value: unknown): SupabaseRow {
  if (Array.isArray(value)) return relation(value[0]);
  return value && typeof value === "object" ? (value as SupabaseRow) : {};
}

function dateIso(value: unknown): string {
  if (typeof value === "string") return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(0).toISOString();
}

function groupStatus(events: SupabaseRow[]): TodayGroup["status"] {
  const statuses = events.map((event) => String(event.status) as DoseStatus);
  if (statuses.every((status) => status === "confirmed")) return "confirmed";
  if (statuses.some((status) => status === "scheduled" || status === "calling")) return "upcoming";
  if (statuses.some((status) => status === "missed")) return "not_confirmed";
  return "mixed";
}

function resolveFoodRelation(events: SupabaseRow[]): FoodRelation {
  const values = new Set<FoodRelation>();
  for (const event of events) {
    const relationRow = relation(event.schedules);
    const value = relationRow.food_relation;
    if (value === "before_food" || value === "after_food" || value === "with_food" || value === "any") {
      values.add(value);
    }
  }
  return values.size === 1 ? [...values][0]! : "any";
}

function expiryMonthToApp(value: unknown): string | null {
  return typeof value === "string" && value.length >= 7 ? value.slice(0, 7) : null;
}

export async function getSupabaseToday(): Promise<{ groups: TodayGroup[] }> {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);
  const { startUtc, endUtc } = localDayBoundsUtc(household.patient.timezone, 0);
  const { data, error } = await supabase
    .from("dose_events")
    .select(TODAY_COLUMNS)
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .gte("scheduled_at_utc", startUtc.toISOString())
    .lte("scheduled_at_utc", endUtc.toISOString())
    .order("scheduled_at_utc", { ascending: true });
  if (error) databaseError("load today's doses", error.code);

  const bySlot = new Map<string, SupabaseRow[]>();
  for (const event of (data ?? []) as unknown as SupabaseRow[]) {
    const time = utcToLocalTime(new Date(dateIso(event.scheduled_at_utc)), household.patient.timezone);
    const group = bySlot.get(time);
    if (group) group.push(event);
    else bySlot.set(time, [event]);
  }

  const groups: TodayGroup[] = Array.from(bySlot.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([time, events]) => {
      const medMap = new Map<
        string,
        {
          brandName: string;
          count: number;
          form: MedForm;
          highRisk: boolean;
          expiryStatus: "expired" | "expiring" | "ok" | "unknown";
        }
      >();
      for (const event of events) {
        const medication = relation(event.medications);
        const medicationId = String(event.medication_id);
        const existing = medMap.get(medicationId);
        if (existing) {
          existing.count += 1;
        } else {
          const expiryDate = expiryMonthToApp(medication.expiry_month);
          medMap.set(medicationId, {
            brandName: String(medication.brand_name ?? ""),
            count: 1,
            form: String(medication.form ?? "tablet") as MedForm,
            highRisk: medication.high_risk === true,
            expiryStatus: expiryStatus(expiryDate),
          });
        }
      }
      return {
        time,
        scheduledAtUtc: dateIso(events[0]?.scheduled_at_utc),
        status: groupStatus(events),
        foodRelation: resolveFoodRelation(events),
        meds: Array.from(medMap.entries()).map(([medicationId, value]) => ({ medicationId, ...value })),
        doseEventIds: events.map((event) => String(event.id)),
      };
    });

  return { groups };
}

export async function markSupabaseDose(
  doseEventId: string,
  status: "confirmed" | "skipped",
) {
  const supabase = await createSupabaseServerClient();
  await requireTenant(supabase);
  const { error } = await supabase.rpc("mark_dose_event", {
    dose_event_id_input: doseEventId,
    status_input: status,
  });
  if (error) databaseError("mark this dose", error.code);
  return { id: doseEventId, status };
}

export async function confirmSupabaseDoseGroup(doseEventIds: string[]) {
  const supabase = await createSupabaseServerClient();
  await requireTenant(supabase);
  const { error } = await supabase.rpc("confirm_dose_event_group", {
    dose_event_ids_input: doseEventIds,
  });
  if (error) databaseError("mark these doses", error.code);
  return doseEventIds.map((id) => ({ id, status: "confirmed" as const }));
}

export async function getSupabaseAdherence(days: number) {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);
  const tz = household.patient.timezone;
  const start = DateTime.now().setZone(tz).startOf("day").minus({ days: days - 1 });
  const startUtc = start.toUTC().toJSDate();
  const endUtc = DateTime.now().setZone(tz).endOf("day").toUTC().toJSDate();
  const { data, error } = await supabase
    .from("dose_events")
    .select("scheduled_at_utc,status")
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .gte("scheduled_at_utc", startUtc.toISOString())
    .lte("scheduled_at_utc", endUtc.toISOString());
  if (error) databaseError("load adherence", error.code);

  let confirmed = 0;
  let notConfirmed = 0;
  const byDayMap = new Map<string, { confirmed: number; notConfirmed: number; pending: number }>();
  for (let index = 0; index < days; index++) {
    const date = start.plus({ days: index }).toFormat("yyyy-MM-dd");
    byDayMap.set(date, { confirmed: 0, notConfirmed: 0, pending: 0 });
  }

  for (const event of (data ?? []) as unknown as SupabaseRow[]) {
    const date = utcToLocalDate(new Date(dateIso(event.scheduled_at_utc)), tz);
    const bucket = byDayMap.get(date);
    if (!bucket) continue;
    if (event.status === "confirmed") {
      confirmed += 1;
      bucket.confirmed += 1;
    } else if (event.status === "missed") {
      notConfirmed += 1;
      bucket.notConfirmed += 1;
    } else if (event.status === "scheduled" || event.status === "calling") {
      bucket.pending += 1;
    }
  }

  const denominator = confirmed + notConfirmed;
  return {
    confirmationRate: denominator === 0 ? null : Math.round((confirmed / denominator) * 100),
    confirmed,
    notConfirmed,
    byDay: Array.from(byDayMap.entries()).map(([date, values]) => ({ date, ...values })),
  };
}
