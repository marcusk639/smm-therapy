import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@smm/db/client";
import { workspaceIntegrations } from "@smm/db/schema";
import { requireWorkspace } from "@/lib/workspace";
import { encryptDriveToken } from "@/lib/drive-crypto";
import { parseOAuthState, safeReturnTo } from "../connect/oauth-state";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

type UserInfoResponse = { email?: string };

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json() as Promise<TokenResponse>;
}

async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as UserInfoResponse;
    return data.email ?? null;
  } catch {
    return null;
  }
}

function failureRedirect(req: Request, returnTo: string, reason: string) {
  const url = new URL(safeReturnTo(returnTo), req.url);
  url.searchParams.set("drive_error", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const parsed = state ? parseOAuthState(state) : null;
  const returnTo = safeReturnTo(parsed?.returnTo);

  if (oauthError) return failureRedirect(req, returnTo, "oauth_denied");
  if (!code || !parsed) return failureRedirect(req, returnTo, "invalid_state");

  const auth = await requireWorkspace();
  if (auth instanceof NextResponse)
    return failureRedirect(req, returnTo, "unauthorized");
  if (auth.workspaceId !== parsed.workspaceId)
    return failureRedirect(req, returnTo, "workspace_mismatch");

  const { workspaceId, userId } = auth;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const redirectUri = `${baseUrl}/api/v1/workspace/google-drive/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const email = await fetchAccountEmail(tokens.access_token);

    const encryptedAccessToken = encryptDriveToken(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token
      ? encryptDriveToken(tokens.refresh_token)
      : null;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const scopes = tokens.scope.split(" ").filter(Boolean);

    const [existing] = await db
      .select({ id: workspaceIntegrations.id })
      .from(workspaceIntegrations)
      .where(
        and(
          eq(workspaceIntegrations.workspaceId, workspaceId),
          eq(workspaceIntegrations.provider, "google_drive"),
        ),
      );

    if (existing) {
      await db
        .update(workspaceIntegrations)
        .set({
          encryptedAccessToken,
          // Google only returns refresh_token on the first consent; preserve
          // the stored one when re-authorizing without prompt=consent.
          ...(encryptedRefreshToken ? { encryptedRefreshToken } : {}),
          expiresAt,
          scopes,
          accountEmail: email,
          connectedBy: userId,
        })
        .where(eq(workspaceIntegrations.id, existing.id));
    } else {
      await db.insert(workspaceIntegrations).values({
        workspaceId,
        provider: "google_drive",
        encryptedAccessToken,
        encryptedRefreshToken,
        expiresAt,
        scopes,
        accountEmail: email,
        connectedBy: userId,
      });
    }

    const url = new URL(returnTo, req.url);
    url.searchParams.set("drive_connected", "1");
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[drive-callback] token exchange or DB write failed:", err);
    return failureRedirect(req, returnTo, "internal_error");
  }
}
