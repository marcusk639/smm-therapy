import { describe, it, expect } from "vitest";
import {
  distributeTopics,
  getScheduledDates,
} from "../../../packages/inngest/src/functions/calendar-utils";

describe("distributeTopics", () => {
  it("distributes topics evenly", () => {
    const result = distributeTopics(["anxiety", "burnout"], 4);
    expect(result).toEqual(["anxiety", "burnout", "anxiety", "burnout"]);
  });

  it("cycles when more posts than topics", () => {
    const result = distributeTopics(["anxiety"], 3);
    expect(result).toEqual(["anxiety", "anxiety", "anxiety"]);
  });
});

describe("getScheduledDates", () => {
  it("returns the right count of dates within the month", () => {
    const dates = getScheduledDates("2026-06", 8, 2);
    expect(dates.length).toBe(8);
    expect(dates[0]!.getMonth()).toBe(5); // June is 5
    dates.forEach((d) => {
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(5);
    });
  });

  it("does not exceed days in month", () => {
    const dates = getScheduledDates("2026-02", 100, 7);
    const daysInFeb = new Date(2026, 2, 0).getDate();
    dates.forEach((d) => expect(d.getDate()).toBeLessThanOrEqual(daysInFeb));
  });
});
