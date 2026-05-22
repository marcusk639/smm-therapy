import { describe, it, expect } from "vitest";

describe("trendTopics schema", () => {
  it("exports trendTopics", async () => {
    const mod = await import("../../../packages/db/src/schema/trends");
    expect(mod.trendTopics).toBeDefined();
  });
});
