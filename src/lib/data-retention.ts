import { prisma } from "@/lib/db";
import { deletePrivatePrefix } from "@/lib/storage";

/**
 * Remove all locally held health data and runtime assets. Both the privacy UI
 * and the CLI use this one ordered implementation so their behavior cannot
 * drift. Reference CSVs are intentionally untouched.
 */
export async function purgeAllData(): Promise<void> {
  // File deletion comes first: a failed database operation must never leave
  // the most sensitive raw assets (strip photos and generated speech) behind
  // on disk after someone asks to erase their data.
  await Promise.all([deletePrivatePrefix("photos/"), deletePrivatePrefix("audio/")]);

  await prisma.$transaction(async (tx) => {
    await tx.caregiverAlert.deleteMany();
    await tx.genericMatch.deleteMany();
    await tx.interactionFinding.deleteMany();
    await tx.reminderCall.deleteMany();
    await tx.doseEvent.deleteMany();
    await tx.schedule.deleteMany();
    await tx.scanPhoto.deleteMany();
    await tx.scanBatch.deleteMany();
    await tx.medication.deleteMany();
    await tx.patient.deleteMany();
    await tx.household.deleteMany();
    await tx.apiCache.deleteMany();
    await tx.audioAsset.deleteMany();
    // OpenAiBudget intentionally remains: deleting a household must never be
    // an escape hatch around the strict local API spend cap.
  });
}

/** Remove only source photos; confirmed medication records remain available. */
export async function purgePhotos(): Promise<void> {
  await deletePrivatePrefix("photos/");
  await prisma.scanPhoto.deleteMany();
}
