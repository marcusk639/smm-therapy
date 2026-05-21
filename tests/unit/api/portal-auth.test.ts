import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.PORTAL_SECRET = "a".repeat(64);
});

describe("portal auth utilities", () => {
  it("generateMagicToken returns 64 hex chars", async () => {
    const { generateMagicToken } =
      await import("../../../apps/web/lib/portal-crypto");
    const { rawToken } = generateMagicToken();
    expect(rawToken).toHaveLength(64);
    expect(rawToken).toMatch(/^[0-9a-f]+$/);
  });

  it("hashToken is deterministic", async () => {
    const { hashToken } = await import("../../../apps/web/lib/portal-crypto");
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("def"));
  });

  it("encryptCookie/decryptCookie roundtrip", async () => {
    const { encryptCookie, decryptCookie } =
      await import("../../../apps/web/lib/portal-crypto");
    const payload = { clientId: "test-id", issuedAt: Date.now() };
    const encrypted = encryptCookie(payload);
    const decrypted = decryptCookie(encrypted);
    expect(decrypted).toMatchObject(payload);
  });
});
