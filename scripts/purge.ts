import { PrismaClient } from "@prisma/client";
import * as fs from "fs/promises";
import * as path from "path";

const prisma = new PrismaClient();

async function purgeDir(dir: string) {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) return;
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (file === ".gitkeep") continue;
      const fullPath = path.join(dir, file);
      const fileStat = await fs.stat(fullPath);
      if (fileStat.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
    }
    console.log(`Purged directory: ${dir}`);
  } catch (e: any) {
    if (e.code !== "ENOENT") {
      console.error(`Failed to purge ${dir}: ${e.message}`);
    }
  }
}

async function main() {
  console.log("Purging database...");
  
  // Truncate tables (sqlite requires manual deletion in order or just deleting all)
  await prisma.caregiverAlert.deleteMany();
  await prisma.genericMatch.deleteMany();
  await prisma.interactionFinding.deleteMany();
  await prisma.reminderCall.deleteMany();
  await prisma.doseEvent.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.scanPhoto.deleteMany();
  await prisma.scanBatch.deleteMany();
  await prisma.medication.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.household.deleteMany();
  // Keep ApiCache and AudioAsset if desired? The PRD says "truncate all tables + delete storage/**"
  // so we'll delete them too.
  await prisma.apiCache.deleteMany();
  await prisma.audioAsset.deleteMany();
  
  console.log("Database purged.");

  console.log("Purging storage directories...");
  await purgeDir(path.join(__dirname, "../storage/photos"));
  await purgeDir(path.join(__dirname, "../storage/audio"));
  
  console.log("Purge complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
