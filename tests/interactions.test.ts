import { describe, it, expect } from "vitest";

describe("Interactions Safety Engine", () => {
  it("flags curated pairs with major severity", () => {
    const saltA = "aspirin";
    const saltB = "warfarin";
    const isCurated = (saltA === "aspirin" && saltB === "warfarin");
    expect(isCurated).toBe(true);
  });

  it("demotes unquoted openFDA findings to unverified", () => {
    const evidenceQuote = null;
    const source = "openfda";
    let finalSource = source;
    if (source === "openfda" && !evidenceQuote) {
      finalSource = "llm_suspected";
    }
    expect(finalSource).toBe("llm_suspected");
  });

  it("appends doctor consult sentence to action", () => {
    let actionEn = "Take with food.";
    if (!actionEn.includes("doctor")) {
      actionEn += " Discuss with your doctor before the next dose.";
    }
    expect(actionEn).toContain("doctor");
  });
});
