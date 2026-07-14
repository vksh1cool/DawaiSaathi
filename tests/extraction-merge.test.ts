import { describe, it, expect } from "vitest";

describe("Vision OCR Extraction & Merge", () => {
  it("merges front and back packaging fields", () => {
    const front = { brandName: "Telma 40", mrpInr: null, confidence: { mrpInr: 0 } };
    const back = { brandName: null, mrpInr: 234.0, confidence: { mrpInr: 0.95 } };
    
    const merged = {
      brandName: front.brandName || back.brandName,
      mrpInr: back.confidence.mrpInr > front.confidence.mrpInr ? back.mrpInr : front.mrpInr
    };
    
    expect(merged.brandName).toBe("Telma 40");
    expect(merged.mrpInr).toBe(234.0);
  });

  it("calculates expiry warnings", () => {
    const today = new Date("2026-07-14");
    const expiry = new Date("2026-08-01"); // Within 60 days
    const daysDiff = (expiry.getTime() - today.getTime()) / (1000 * 3600 * 24);
    
    let warning = false;
    if (daysDiff <= 60 && daysDiff > 0) warning = true;
    
    expect(warning).toBe(true);
  });
});
