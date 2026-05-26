import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { encrypt } from "../../../packages/crypto/src/index";

const TEST_KEY_HEX = crypto.randomBytes(32).toString("hex");
process.env.GOOGLE_DRIVE_TOKEN_KEY = TEST_KEY_HEX;
process.env.GOOGLE_DRIVE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_DRIVE_CLIENT_SECRET = "test-client-secret";

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

vi.mock("@smm/db/client", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

import { getDriveAccessToken } from "../../../packages/ingestion/src/sources/google-drive-token";

function mockSelectReturning(rows: Record<string, unknown>[]) {
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValueOnce(rows),
    }),
  });
}

function mockUpdateChain() {
  const where = vi.fn().mockResolvedValueOnce(undefined);
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValueOnce({ set });
  return { set, where };
}

describe("getDriveAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns the decrypted access token when not yet expired", async () => {
    const accessToken = "valid-access-token";
    mockSelectReturning([
      {
        id: "row-1",
        encryptedAccessToken: encrypt(accessToken, TEST_KEY_HEX),
        encryptedRefreshToken: encrypt("refresh-token", TEST_KEY_HEX),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    ]);

    const result = await getDriveAccessToken("ws-1");
    expect(result).toBe(accessToken);
  });

  it("refreshes the token via Google when expired and re-stores", async () => {
    const oldAccess = "expired-access";
    const refreshToken = "stored-refresh";
    mockSelectReturning([
      {
        id: "row-1",
        encryptedAccessToken: encrypt(oldAccess, TEST_KEY_HEX),
        encryptedRefreshToken: encrypt(refreshToken, TEST_KEY_HEX),
        expiresAt: new Date(Date.now() - 1000),
      },
    ]);
    const { set } = mockUpdateChain();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "new-access",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    } as Response);

    const result = await getDriveAccessToken("ws-1");

    expect(result).toBe("new-access");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(set).toHaveBeenCalled();
  });

  it("throws when no integration row exists", async () => {
    mockSelectReturning([]);
    await expect(getDriveAccessToken("ws-x")).rejects.toThrow(
      "not connected for this workspace",
    );
  });

  it("throws when token is expired and no refresh token is stored", async () => {
    mockSelectReturning([
      {
        id: "row-1",
        encryptedAccessToken: encrypt("expired", TEST_KEY_HEX),
        encryptedRefreshToken: null,
        expiresAt: new Date(Date.now() - 1000),
      },
    ]);

    await expect(getDriveAccessToken("ws-1")).rejects.toThrow(
      "no refresh token is stored",
    );
  });
});
