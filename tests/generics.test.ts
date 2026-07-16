import { describe, it, expect } from "vitest";
import { findBestCandidate } from "@/lib/generics";
import { roundRupees } from "@/lib/util/money";

describe("Generics Matching Logic", () => {
  it("selects the exact salt, strength, and form as a high-confidence match", () => {
    const match = findBestCandidate(
      { inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: 40, strengthUnit: "mg" },
      "tablet",
    );
    expect(match?.ja.productCode).toBe("JA001");
    expect(match?.confidence).toBe("high");
  });

  it("demotes a strength match with a different form to medium confidence", () => {
    const match = findBestCandidate(
      { inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: 40, strengthUnit: "mg" },
      "capsule",
    );
    expect(match?.confidence).toBe("medium");
  });

  it("does not suggest a different known strength as a low-confidence alternative", () => {
    const match = findBestCandidate(
      { inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: 20, strengthUnit: "mg" },
      "tablet",
    );
    expect(match).toBeNull();
  });

  it("keeps salt-only extraction visibly low confidence", () => {
    const match = findBestCandidate(
      { inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: null, strengthUnit: null },
      "tablet",
    );
    expect(match?.confidence).toBe("low");
  });

  it("rounds savings and never claims a negative saving", () => {
    expect(roundRupees((7.8 - 1) * 30)).toBe(204);
    expect(roundRupees(-24.2)).toBe(0);
  });
});
