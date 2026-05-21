import { describe, it, expect } from "vitest";
import {
  GenerateCalendarSchema,
  RepurposeSchema,
} from "../../../packages/types/src/calendar";

describe("GenerateCalendarSchema", () => {
  it("validates correct input", () => {
    const result = GenerateCalendarSchema.safeParse({
      month: "2026-06",
      topicAreas: ["anxiety", "burnout"],
      postsPerWeek: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid month format", () => {
    const result = GenerateCalendarSchema.safeParse({
      month: "June 2026",
      topicAreas: ["anxiety"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty topicAreas", () => {
    const result = GenerateCalendarSchema.safeParse({
      month: "2026-06",
      topicAreas: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects month > 12", () => {
    expect(
      GenerateCalendarSchema.safeParse({
        month: "2026-13",
        topicAreas: ["anxiety"],
      }).success,
    ).toBe(false);
  });
});

describe("RepurposeSchema", () => {
  it("accepts valid formats", () => {
    expect(RepurposeSchema.safeParse({ targetFormat: "story" }).success).toBe(
      true,
    );
  });

  it("rejects unknown formats", () => {
    expect(RepurposeSchema.safeParse({ targetFormat: "tweet" }).success).toBe(
      false,
    );
  });
});
