import { prisma } from "@/lib/db";
import { readWebhook } from "@/lib/integrations/twilio";
import { finalizeUnconfirmed } from "@/lib/calls";
import { usesSupabaseAuth, legacyTenantDataBlocked } from "@/lib/cloudflare-runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finalizeSupabaseUnconfirmed } from "@/lib/supabase/calls-admin";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/** POST /api/twilio/status — call finished; retry-or-miss if unconfirmed (Arch §10.5). */
export async function POST(req: Request) {
  const { params, valid } = await readWebhook(req);
  if (!valid) return new Response("invalid signature", { status: 403 });

  const callId = new URL(req.url).searchParams.get("callId")!;
  const callStatus = params.CallStatus ?? "";

  if (usesSupabaseAuth()) {
    const admin = createSupabaseAdminClient();
    const { data: call, error } = await admin
      .from("reminder_calls")
      .select("outcome")
      .eq("id", callId)
      .maybeSingle();
    if (error || !call) return new Response(null, { status: 204 });

    await admin.from("reminder_calls").update({ twilio_status: callStatus }).eq("id", callId);
    logger.info({ callId, callStatus }, "twilio status (supabase)");

    if (call.outcome !== "confirmed") {
      const notAnswered = ["busy", "no-answer", "failed", "canceled"].includes(callStatus);
      await finalizeSupabaseUnconfirmed(callId, notAnswered ? "not_answered" : "no_input");
    }
    return new Response(null, { status: 204 });
  }

  if (legacyTenantDataBlocked()) return new Response(null, { status: 204 });

  const call = await prisma.reminderCall.findUnique({ where: { id: callId } });
  if (!call) return new Response(null, { status: 204 });

  await prisma.reminderCall.update({ where: { id: callId }, data: { twilioStatus: callStatus } });
  logger.info({ callId, callStatus }, "twilio status");

  if (call.outcome !== "confirmed") {
    const notAnswered = ["busy", "no-answer", "failed", "canceled"].includes(callStatus);
    await finalizeUnconfirmed(callId, notAnswered ? "not_answered" : "no_input");
  }
  return new Response(null, { status: 204 });
}
