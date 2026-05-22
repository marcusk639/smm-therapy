import { NextResponse } from "next/server";
import { db } from "@smm/db/client";
import { instagramTokens } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import { encryptToken } from "@/lib/ig-crypto";
import { parseOAuthState } from "../connect/oauth-state";

async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; token_type: string }> {
  const params = new URLSearchParams({
    client_id: process.env.IG_APP_ID!,
    client_secret: process.env.IG_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`,
  );
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json() as Promise<{ access_token: string; token_type: string }>;
}

async function getLongLivedToken(
  shortToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.IG_APP_ID!,
    client_secret: process.env.IG_APP_SECRET!,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`,
  );
  if (!res.ok)
    throw new Error(`Long-lived token exchange failed: ${res.status}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function getIgUserId(
  accessToken: string,
): Promise<{ igUserId: string; igUsername: string }> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account{id,username}&access_token=${accessToken}`,
  );
  const data = (await res.json()) as {
    data: Array<{
      instagram_business_account?: { id: string; username: string };
    }>;
  };
  const account = data.data[0]?.instagram_business_account;
  if (!account)
    throw new Error(
      "No Instagram business account found on this Facebook page.",
    );
  return { igUserId: account.id, igUsername: account.username };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const { clientId } = await params;

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`/clients/${clientId}/instagram?error=denied`, req.url),
    );
  }

  const parsed = parseOAuthState(state);
  if (!parsed || parsed.clientId !== clientId) {
    return NextResponse.redirect(
      new URL(`/clients/${clientId}/instagram?error=state_mismatch`, req.url),
    );
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const redirectUri = `${baseUrl}/api/v1/clients/${clientId}/instagram/callback`;
    const shortToken = await exchangeCodeForToken(code, redirectUri);
    const longToken = await getLongLivedToken(shortToken.access_token);
    const { igUserId, igUsername } = await getIgUserId(longToken.access_token);

    const encryptedToken = encryptToken(longToken.access_token);
    const expiresAt = new Date(Date.now() + longToken.expires_in * 1000);

    await db
      .insert(instagramTokens)
      .values({
        clientId: parsed.clientId,
        workspaceId: parsed.workspaceId,
        igUserId,
        igUsername,
        encryptedToken,
        tokenType: "long_lived",
        expiresAt,
        scopes: [
          "instagram_basic",
          "instagram_content_publish",
          "instagram_manage_insights",
          "pages_show_list",
        ],
      })
      .onConflictDoUpdate({
        target: instagramTokens.clientId,
        set: {
          igUserId,
          igUsername,
          encryptedToken,
          expiresAt,
          updatedAt: new Date(),
        },
      });

    return NextResponse.redirect(
      new URL(`/clients/${clientId}/instagram?connected=1`, req.url),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(
      new URL(
        `/clients/${clientId}/instagram?error=${encodeURIComponent(msg)}`,
        req.url,
      ),
    );
  }
}
