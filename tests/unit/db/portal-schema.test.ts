import { describe, it, expect } from "vitest";

describe("portal schema", () => {
  it("exports magicLinkTokens and draftComments", async () => {
    const mod = await import("../../../packages/db/src/schema/portal");
    expect(mod.magicLinkTokens).toBeDefined();
    expect(mod.draftComments).toBeDefined();
    expect(mod.authorTypeEnum).toBeDefined();
  });
});
