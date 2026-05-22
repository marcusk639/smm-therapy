import { describe, it, expect } from "vitest";
import {
  filterByRelevance,
  buildWeekOf,
} from "../../../packages/inngest/src/functions/trend-sync-utils";

describe("filterByRelevance", () => {
  it("keeps posts above threshold", () => {
    const posts = [
      { text: "anxiety therapy techniques", score: 0.8 },
      { text: "random gaming post", score: 0.2 },
      { text: "DBT skills for clients", score: 0.75 },
    ];
    const result = filterByRelevance(posts, 0.6);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("anxiety therapy techniques");
    expect(result[1].text).toBe("DBT skills for clients");
  });

  it("returns empty array when nothing meets threshold", () => {
    const posts = [
      { text: "sports news", score: 0.1 },
      { text: "cooking recipe", score: 0.3 },
    ];
    expect(filterByRelevance(posts, 0.6)).toHaveLength(0);
  });

  it("keeps posts exactly at threshold", () => {
    const posts = [{ text: "mental health post", score: 0.6 }];
    expect(filterByRelevance(posts, 0.6)).toHaveLength(1);
  });
});

describe("buildWeekOf", () => {
  it("returns Monday of the current week as YYYY-MM-DD", () => {
    const wednesday = new Date("2026-05-20"); // Wednesday
    const result = buildWeekOf(wednesday);
    expect(result).toBe("2026-05-18"); // Monday of that week
  });

  it("returns same date when input is already Monday", () => {
    const monday = new Date("2026-05-18");
    const result = buildWeekOf(monday);
    expect(result).toBe("2026-05-18");
  });
});
