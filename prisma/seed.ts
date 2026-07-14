/**
 * Seed = validate the reference CSVs load and print a summary.
 * Reference tables (interactions, Jan Aushadhi, brand prices, high-risk) are
 * read from /data at runtime — not stored in the DB — so there is nothing to
 * insert here. The demo household is created via POST /api/demo/seed instead.
 */
import {
  getCuratedInteractions,
  getJanAushadhiProducts,
  getBrandPrices,
  getHighRiskMeds,
} from "../src/lib/reference-data";

function main() {
  const curated = getCuratedInteractions();
  const ja = getJanAushadhiProducts();
  const brands = getBrandPrices();
  const highRisk = getHighRiskMeds();

  // Basic integrity checks.
  const problems: string[] = [];
  for (const c of curated) {
    if (!["major", "moderate", "minor", "unverified"].includes(c.severity)) {
      problems.push(`curated: bad severity "${c.severity}" for ${c.saltA}+${c.saltB}`);
    }
  }
  for (const p of ja) {
    if (p.mrpInr === null || p.packSize === null) {
      problems.push(`jan aushadhi: missing price/pack for ${p.productCode}`);
    }
  }

  console.log("── DawaiSaathi reference data ──");
  console.log(`  curated interactions : ${curated.length}`);
  console.log(`  jan aushadhi products: ${ja.length}`);
  console.log(`  brand prices         : ${brands.length}`);
  console.log(`  high-risk salts      : ${highRisk.size}`);

  if (problems.length) {
    console.error("\n⚠ Data problems:");
    problems.forEach((p) => console.error("  - " + p));
    process.exit(1);
  }
  console.log("\n✓ Reference data OK. Run POST /api/demo/seed (DEMO_MODE) for the demo household.");
}

main();
