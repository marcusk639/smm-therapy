import { describe, it, expect } from "vitest";
import {
  buildOAuthState,
  parseOAuthState,
} from "../../../apps/web/app/api/v1/clients/[clientId]/instagram/connect/oauth-state";

describe("OAuth state", () => {
  it("roundtrips clientId and workspaceId", () => {
    const state = buildOAuthState("cid-123", "wid-456");
    const parsed = parseOAuthState(state);
    expect(parsed).toMatchObject({
      clientId: "cid-123",
      workspaceId: "wid-456",
    });
  });

  it("returns null for invalid state", () => {
    expect(parseOAuthState("not-valid-base64url!!!")).toBeNull();
  });

  it("produces a non-empty base64url string", () => {
    const state = buildOAuthState("cid", "wid");
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
