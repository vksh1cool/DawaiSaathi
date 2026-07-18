import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { createSupabaseMedications, listSupabaseMedications } from "@/lib/supabase/medications";
import { getPatientOrThrow } from "@/lib/household";
import { prisma } from "@/lib/db";
import { draftToCreateData, serializeMedication } from "@/lib/medications";
import { AppError } from "@/lib/errors";
import type { DraftMedication } from "@/types/domain";

export const MedicationsRepository = {
  async getActiveMedications() {
    if (usesSupabaseAuth()) {
      return await listSupabaseMedications();
    }
    const patient = await getPatientOrThrow();
    const meds = await prisma.medication.findMany({
      where: { patientId: patient.id, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    return meds.map(serializeMedication);
  },

  async createMedications(medications: DraftMedication[], scanBatchId?: string) {
    if (usesSupabaseAuth()) {
      return await createSupabaseMedications(medications, scanBatchId);
    }
    const patient = await getPatientOrThrow();
    const created = await prisma.$transaction(async (tx) => {
      if (scanBatchId) {
        const claimed = await tx.scanBatch.updateMany({
          where: { id: scanBatchId, patientId: patient.id, status: "extracted" },
          data: { status: "confirming" },
        });
        if (claimed.count === 0) {
          throw new AppError("VALIDATION", "This scan is no longer available to confirm.");
        }
      }
      const medicines = await Promise.all(
        medications.map((draft) =>
          tx.medication.create({
            data: draftToCreateData(draft, patient.id, scanBatchId),
          }),
        ),
      );
      if (scanBatchId) {
        await tx.scanBatch.update({
          where: { id: scanBatchId },
          data: { status: "confirmed" },
        });
      }
      return medicines;
    });
    return created.map(serializeMedication);
  },
};
