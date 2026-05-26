import { and, eq } from "drizzle-orm";
import { db } from "@smm/db/client";
import { workspaceIntegrations } from "@smm/db/schema";
import { decrypt, encrypt } from "@smm/crypto";

const REFRESH_LEEWAY_MS = 60_000;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function getKeyHex(): string {
  const hex = process.env.GOOGLE_DRIVE_TOKEN_KEY;
  if (!hex || hex.length < 64) {
    throw new Error(
      "GOOGLE_DRIVE_TOKEN_KEY must be at least 32 bytes (64 hex chars)",
    );
  }
  return hex;
}

type RefreshResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshResponse> {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(
      "Google Drive token refresh failed. Re-connect Drive in workspace settings.",
    );
  }
  return res.json() as Promise<RefreshResponse>;
}

/**
 * Returns a valid Google Drive access token for the workspace.
 * Refreshes via the stored refresh token if the access token is expired or
 * within REFRESH_LEEWAY_MS of expiry.
 */
export async function getDriveAccessToken(
  workspaceId: string,
): Promise<string> {
  const [row] = await db
    .select()
    .from(workspaceIntegrations)
    .where(
      and(
        eq(workspaceIntegrations.workspaceId, workspaceId),
        eq(workspaceIntegrations.provider, "google_drive"),
      ),
    );

  if (!row) {
    throw new Error(
      "Google Drive is not connected for this workspace. Connect Drive in workspace settings.",
    );
  }

  const keyHex = getKeyHex();
  const needsRefresh =
    !row.expiresAt || row.expiresAt.getTime() <= Date.now() + REFRESH_LEEWAY_MS;

  if (!needsRefresh) {
    return decrypt(row.encryptedAccessToken, keyHex);
  }

  if (!row.encryptedRefreshToken) {
    throw new Error(
      "Google Drive access token expired and no refresh token is stored. Re-connect Drive.",
    );
  }

  const refreshToken = decrypt(row.encryptedRefreshToken, keyHex);
  const refreshed = await refreshAccessToken(refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  await db
    .update(workspaceIntegrations)
    .set({
      encryptedAccessToken: encrypt(refreshed.access_token, keyHex),
      expiresAt,
    })
    .where(eq(workspaceIntegrations.id, row.id));

  return refreshed.access_token;
}
