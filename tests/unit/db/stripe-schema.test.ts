import { describe, it, expect } from "vitest";

describe("stripe schema", () => {
  it("exports stripeSubscriptions", async () => {
    const mod = await import("../../../packages/db/src/schema/stripe");
    expect(mod.stripeSubscriptions).toBeDefined();
  });
});
