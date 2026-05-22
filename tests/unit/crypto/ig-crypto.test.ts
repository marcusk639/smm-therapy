import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.INSTAGRAM_TOKEN_KEY = "b".repeat(64);
});

describe("ig-crypto", () => {
  it("encryptToken/decryptToken roundtrip", async () => {
    const { encryptToken, decryptToken } =
      await import("../../../apps/web/lib/ig-crypto");
    const token = "EAABsbCS1iHgBOZD";
    const encrypted = encryptToken(token);
    expect(encrypted).not.toBe(token);
    expect(decryptToken(encrypted)).toBe(token);
  });

  it("different encryptions of same value differ (random IV)", async () => {
    const { encryptToken } = await import("../../../apps/web/lib/ig-crypto");
    expect(encryptToken("token")).not.toBe(encryptToken("token"));
  });
});
