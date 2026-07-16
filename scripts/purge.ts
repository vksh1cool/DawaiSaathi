import { prisma } from "../src/lib/db";
import { purgeAllData } from "../src/lib/data-retention";

async function main() {
  console.log("Purging local health data and runtime storage...");
  await purgeAllData();
  console.log("Purge complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
