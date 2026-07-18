import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { postMedicationsSchema } from "@/lib/validation";
import { MedicationsRepository } from "@/lib/repositories/medications";

export const runtime = "nodejs";

/** GET /api/medications — active medications (Arch §7.2). */
export const GET = withErrorBoundary(async () => {
  const medications = await MedicationsRepository.getActiveMedications();
  return NextResponse.json({ medications });
});

/** POST /api/medications — persist caregiver-confirmed medicines (Arch §7.2). */
export const POST = withErrorBoundary(async (req: Request) => {
  const body = postMedicationsSchema.parse(await req.json());
  const medications = await MedicationsRepository.createMedications(body.medications, body.scanBatchId);
  return NextResponse.json({ medications }, { status: 201 });
});
