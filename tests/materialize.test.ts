import { describe, it, expect } from "vitest";
import { resolveGroupFoodRelation } from "@/lib/dose-events";
import { expiryStatus, slotKeyForTime, zonedToUtc } from "@/lib/util/dates";
import { postSchedulesSchema, simulateDigitsSchema } from "@/lib/validation";

describe("DoseEvent Materialization", () => {
  it("converts a patient-local Asia/Kolkata morning slot to UTC", () => {
    expect(zonedToUtc("2026-07-15", "08:00", "Asia/Kolkata").toISOString()).toBe(
      "2026-07-15T02:30:00.000Z",
    );
  });

  it("uses an any-food instruction when medicines in one call have mixed directions", () => {
    expect(resolveGroupFoodRelation(["after_food", "any"])).toBe("any");
    expect(resolveGroupFoodRelation(["with_food", "with_food"])).toBe("with_food");
  });

  it("enforces calendar and 15-minute schedule invariants at the API boundary", () => {
    expect(() =>
      postSchedulesSchema.parse({
        schedules: [
          {
            medicationId: "med_1",
            times: ["08:10", "08:10"],
            foodRelation: "any",
            startDate: "2026-07-16",
            endDate: "2026-07-15",
          },
        ],
      }),
    ).toThrow();

    expect(
      postSchedulesSchema.parse({
        schedules: [
          {
            medicationId: "med_1",
            times: ["08:00", "20:00"],
            foodRelation: "after_food",
            startDate: "2026-07-15",
          },
        ],
      }).schedules[0].times,
    ).toEqual(["08:00", "20:00"]);
    expect(
      postSchedulesSchema.parse({
        schedules: [
          {
            medicationId: "med_1",
            times: [],
            foodRelation: "any",
            startDate: "2026-07-15",
          },
        ],
      }).schedules[0].times,
    ).toEqual([]);
    expect(() => simulateDigitsSchema.parse({ reminderCallId: "call", digits: "9" })).toThrow();
    expect(slotKeyForTime("20:00")).toBe("evening");
    expect(expiryStatus("2000-01")).toBe("expired");
  });
});
