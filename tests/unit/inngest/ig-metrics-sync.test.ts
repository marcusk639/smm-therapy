import { describe, it, expect } from "vitest";
import { parseMetricsResponse } from "../../../packages/inngest/src/functions/ig-metrics-utils";

describe("parseMetricsResponse", () => {
  it("extracts metric values by name", () => {
    const raw = {
      data: [
        { name: "reach", values: [{ value: 150 }] },
        { name: "impressions", values: [{ value: 320 }] },
        { name: "likes", values: [{ value: 42 }] },
        { name: "comments", values: [{ value: 5 }] },
        { name: "saved", values: [{ value: 18 }] },
        { name: "shares", values: [{ value: 3 }] },
      ],
    };
    const result = parseMetricsResponse(raw);
    expect(result.reach).toBe(150);
    expect(result.impressions).toBe(320);
    expect(result.likes).toBe(42);
    expect(result.saves).toBe(18);
    expect(result.shares).toBe(3);
  });

  it("defaults missing metrics to 0", () => {
    const result = parseMetricsResponse({ data: [] });
    expect(result.reach).toBe(0);
    expect(result.saves).toBe(0);
  });
});
