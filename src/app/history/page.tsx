import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";
import { getPatientOrThrow } from "@/lib/household";
import { getAdherence } from "@/lib/dose-events";
import { getSupabaseAdherence } from "@/lib/supabase/dose-events";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { prisma, parseStringArray } from "@/lib/db";
import { utcToLocalTime, slotKeyForTime } from "@/lib/util/dates";
import { getAudioSet } from "@/lib/calls";
import { HistoryClient } from "./HistoryClient";
import { T } from "@/components/T";
import { listSupabaseReminderCalls } from "@/lib/supabase/calls";

async function getAdherenceData() {
  if (usesSupabaseAuth()) {
    return getSupabaseAdherence(7);
  }
  const patient = await getPatientOrThrow();
  return getAdherence(patient, 7);
}

async function getCallsData() {
  if (usesSupabaseAuth()) {
    return listSupabaseReminderCalls();
  }
  const patient = await getPatientOrThrow();
  const tz = patient.timezone;
  const calls = await prisma.reminderCall.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return calls.map((c) => {
    const medlist = getAudioSet(c).medlist;
    const medlistUrl = medlist ? `/api/audio/${medlist}` : null;
    return {
      id: c.id,
      time: utcToLocalTime(c.scheduledAtUtc, tz),
      slotKey: slotKeyForTime(utcToLocalTime(c.scheduledAtUtc, tz)),
      mode: c.mode,
      attempt: c.attempt,
      twilioStatus: c.twilioStatus,
      outcome: c.outcome,
      digitsPressed: c.digitsPressed,
      doseCount: parseStringArray(c.doseEventIdsJson).length,
      medlistUrl,
      createdAt: c.createdAt.toISOString(),
    };
  });
}

async function HistoryDataFetcher() {
  const [adherence, calls] = await Promise.all([
    getAdherenceData(),
    getCallsData()
  ]);
  return <HistoryClient adherence={adherence} calls={calls} />;
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<AppShell><Spinner label={<T k="common.loading" />} /></AppShell>}>
      <HistoryDataFetcher />
    </Suspense>
  )
}
