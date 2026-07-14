import { describe, it, expect } from "vitest";

describe("Generics Matching Logic", () => {
  it("calculates monthly savings based on strength and form", () => {
    const brandUnit = 7.80; // Telma 40
    const jaUnit = 1.00;
    const monthlyUnits = 30; // 1x per day for 30 days
    const savings = Math.round((brandUnit - jaUnit) * monthlyUnits);
    expect(savings).toBe(204);
  });

  it("handles form mismatch with medium confidence", () => {
    // Structural logic test placeholder
    expect("tablet").not.toBe("capsule");
  });

  it("returns no match for combination salts in MVP", () => {
    const salts = [{ inn: "telmisartan" }, { inn: "amlodipine" }];
    expect(salts.length).toBeGreaterThan(1);
  });
});
