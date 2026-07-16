import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { parseStringArray } from "@/lib/db";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { handleGatherResult, finalizeUnconfirmed } from "@/lib/calls";
import { simulateDigitsSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** POST /api/simulate/digits — same code path as the Twilio gather webhook (AC-10.1). */
export const POST = withErrorBoundary(async (req: Request) => {
  if (!config.demoMode) throw new AppError("NOT_FOUND", "Not available.");
  const { reminderCallId, digits } = simulateDigitsSchema.parse(await req.json());

  // This endpoint is intentionally unauthenticated for the local demo, so it
  // must never become an alternate way to confirm a live Twilio call. Live
  // calls are accepted only through the signature-validated webhook route.
  const requestedCall = await prisma.reminderCall.findUnique({
    where: { id: reminderCallId },
    select: { mode: true },
  });
  if (!requestedCall || requestedCall.mode !== "simulated") {
    throw new AppError("NOT_FOUND", "Call not found.");
  }

  const result = await handleGatherResult(reminderCallId, digits);
  if (!result) throw new AppError("NOT_FOUND", "Call not found.");

  let outcome: string = result.action;
  if (result.action === "noinput") {
    await finalizeUnconfirmed(reminderCallId, "no_input");
    outcome = "no_input";
  }

  // Report the resulting dose status for the modal.
  const doseEventIds = parseStringArray(result.call.doseEventIdsJson);
  const events = await prisma.doseEvent.findMany({
    where: { id: { in: doseEventIds } },
    select: { status: true },
  });
  const doseStatus = events[0]?.status ?? "scheduled";

  return NextResponse.json({ action: result.action, outcome, doseStatus });
});
