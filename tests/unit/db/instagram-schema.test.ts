import { describe, it, expect } from "vitest";

describe("instagram schema", () => {
  it("exports instagramTokens and postMetrics", async () => {
    const mod = await import("../../../packages/db/src/schema/instagram");
    expect(mod.instagramTokens).toBeDefined();
    expect(mod.postMetrics).toBeDefined();
  });
});
