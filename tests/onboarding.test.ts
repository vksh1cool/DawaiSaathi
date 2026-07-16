import { describe, expect, it } from "vitest";
import {
  indianMobileFromInput,
  indianMobileToE164,
  isValidIndianMobile,
  isValidPhoneInput,
  phoneInputFromValue,
  phonePartsFromE164,
  phoneToE164,
} from "@/lib/onboarding";

describe("India-first onboarding phone input", () => {
  it("accepts a familiar ten-digit mobile number and submits E.164", () => {
    expect(indianMobileFromInput("98765 43210")).toBe("9876543210");
    expect(isValidIndianMobile("9876543210")).toBe(true);
    expect(indianMobileToE164("98765 43210")).toBe("+919876543210");
  });

  it("accepts an E.164 number pasted into the field", () => {
    expect(indianMobileFromInput("+91 98765-43210")).toBe("9876543210");
  });

  it("keeps an incomplete or invalid number invalid", () => {
    expect(isValidIndianMobile(indianMobileFromInput("12345"))).toBe(false);
    expect(isValidIndianMobile(indianMobileFromInput("5123456789"))).toBe(false);
  });
});

describe("global onboarding phone input", () => {
  it("converts a local East African number to E.164 without retaining its trunk zero", () => {
    expect(phoneToE164("0712 345 678", "KE")).toBe("+254712345678");
    expect(isValidPhoneInput("0712 345 678", "KE")).toBe(true);
  });

  it("keeps pasted E.164 numbers intact and restores a local display value", () => {
    expect(phoneToE164("+234 801 234 5678", "NG")).toBe("+2348012345678");
    expect(phoneInputFromValue("+2348012345678", "NG")).toBe("8012345678");
    expect(phonePartsFromE164("+2348012345678")).toEqual({
      regionCode: "NG",
      localNumber: "8012345678",
    });
  });

  it("requires an explicit country prefix when Other country is selected", () => {
    expect(isValidPhoneInput("2025550123", "OTHER")).toBe(false);
    expect(isValidPhoneInput("+1 202 555 0123", "OTHER")).toBe(true);
  });
});
