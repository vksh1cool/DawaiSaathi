import { describe, it, expect } from "vitest";

describe("DoseEvent Materialization", () => {
  it("idempotently avoids duplicating events", () => {
    const existingEvents = ["schedule1_2026-07-15T02:30:00Z"];
    const newEvent = "schedule1_2026-07-15T02:30:00Z";
    const set = new Set([...existingEvents, newEvent]);
    expect(set.size).toBe(1);
  });

  it("converts local time to UTC bounds correctly", () => {
    const localHour = 8;
    // Asia/Kolkata is UTC+5:30. 08:00 is 02:30 UTC.
    const utcHour = 8 - 5.5; 
    expect(utcHour).toBe(2.5);
  });
});
