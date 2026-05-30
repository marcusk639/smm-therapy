import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.OAUTH_STATE_SECRET = "a".repeat(64);
});

describe("IG OAuth state", () => {
  it("roundtrips clientId and workspaceId", async () => {
    const { buildOAuthState, parseOAuthState } =
      await import("../../../apps/web/app/api/v1/clients/[clientId]/instagram/connect/oauth-state");
    const state = buildOAuthState("cid-123", "wid-456");
    const parsed = parseOAuthState(state);
    expect(parsed).toMatchObject({
      clientId: "cid-123",
      workspaceId: "wid-456",
    });
    expect(parsed?.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(typeof parsed?.issuedAt).toBe("number");
  });

  it("returns null for invalid state", async () => {
    const { parseOAuthState } =
      await import("../../../apps/web/app/api/v1/clients/[clientId]/instagram/connect/oauth-state");
    expect(parseOAuthState("not-valid-base64url!!!")).toBeNull();
  });

  it("produces a dot-separated signed string", async () => {
    const { buildOAuthState } =
      await import("../../../apps/web/app/api/v1/clients/[clientId]/instagram/connect/oauth-state");
    const state = buildOAuthState("cid", "wid");
    expect(state).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("rejects state with a tampered payload", async () => {
    const { buildOAuthState, parseOAuthState } =
      await import("../../../apps/web/app/api/v1/clients/[clientId]/instagram/connect/oauth-state");
    const state = buildOAuthState("cid-123", "wid-456");
    // Flip the first character of the payload — signature won't match
    const tampered = state.replace(/^./, (c) => (c === "a" ? "b" : "a"));
    expect(parseOAuthState(tampered)).toBeNull();
  });

  it("rejects state with no signature dot", async () => {
    const { parseOAuthState } =
      await import("../../../apps/web/app/api/v1/clients/[clientId]/instagram/connect/oauth-state");
    // Plain base64url with no `.sig` suffix
    const unsigned = Buffer.from(
      JSON.stringify({ clientId: "x", workspaceId: "y", issuedAt: Date.now() }),
    ).toString("base64url");
    expect(parseOAuthState(unsigned)).toBeNull();
  });
});
