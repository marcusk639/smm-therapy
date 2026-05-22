import { describe, it, expect } from "vitest";
import { recallAtK, mrr } from "../../../packages/eval/src/metrics";

describe("recallAtK", () => {
  it("returns 1.0 when all relevant items are in top-K", () => {
    const retrieved = ["a", "b", "c", "d", "e"];
    const relevant = ["b", "d"];
    expect(recallAtK(retrieved, relevant, 5)).toBe(1.0);
  });

  it("returns 0.5 when half of relevant items are in top-K", () => {
    const retrieved = ["a", "b", "c", "d", "e"];
    const relevant = ["b", "z"];
    expect(recallAtK(retrieved, relevant, 5)).toBe(0.5);
  });

  it("returns 0.0 when no relevant items are retrieved", () => {
    expect(recallAtK(["a", "b"], ["z"], 5)).toBe(0.0);
  });

  it("returns 1.0 for empty relevant set", () => {
    expect(recallAtK(["a", "b"], [], 5)).toBe(1.0);
  });
});

describe("mrr", () => {
  it("returns 1.0 when the first result is relevant", () => {
    expect(mrr(["a", "b", "c"], ["a"])).toBe(1.0);
  });

  it("returns 0.5 when the second result is the first relevant", () => {
    expect(mrr(["a", "b", "c"], ["b"])).toBeCloseTo(0.5);
  });

  it("returns 0 when nothing is relevant", () => {
    expect(mrr(["a", "b"], ["z"])).toBe(0);
  });
});
