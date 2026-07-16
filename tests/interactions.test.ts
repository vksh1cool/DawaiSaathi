import { describe, it, expect } from "vitest";
import { ensureConsult, findDistinctMedicationPair } from "@/lib/interactions";

describe("Interactions Safety Engine", () => {
  it("selects an interaction pair across different medicines", () => {
    const pair = findDistinctMedicationPair(
      [
        { medId: "combo", brand: "Combo", inn: "aspirin", fdaSearchName: "aspirin" },
        { medId: "combo", brand: "Combo", inn: "warfarin", fdaSearchName: "warfarin" },
        { medId: "warfarin", brand: "Warf", inn: "warfarin", fdaSearchName: "warfarin" },
      ],
      "aspirin",
      "warfarin",
    );
    expect(pair?.a.medId).toBe("combo");
    expect(pair?.b.medId).toBe("warfarin");
  });

  it("does not accept a pair confined to one combination medicine", () => {
    expect(
      findDistinctMedicationPair(
        [
          { medId: "combo", brand: "Combo", inn: "aspirin", fdaSearchName: "aspirin" },
          { medId: "combo", brand: "Combo", inn: "warfarin", fdaSearchName: "warfarin" },
        ],
        "aspirin",
        "warfarin",
      ),
    ).toBeNull();
  });

  it("appends a consultation instruction when the action omits one", () => {
    expect(ensureConsult("Do not make a change on your own.", "en")).toContain("doctor or pharmacist");
    expect(ensureConsult("अपने आप बदलाव न करें।", "hi")).toContain("डॉक्टर या फार्मासिस्ट");
  });
});
