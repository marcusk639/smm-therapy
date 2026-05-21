import { NextResponse } from "next/server";
import { db } from "@smm/db/client";
import { magicLinkTokens } from "@smm/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { hashToken, encryptCookie } from "@/lib/portal-auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawToken = searchParams.get("token");
  const slug = searchParams.get("slug");

  if (!rawToken || !slug) {
    return NextResponse.redirect(
      new URL(`/portal/${slug ?? ""}?error=invalid`, req.url),
    );
  }

  const tokenHash = hashToken(rawToken);

  const [tokenRow] = await db
    .select()
    .from(magicLinkTokens)
    .where(
      and(
        eq(magicLinkTokens.tokenHash, tokenHash),
        isNull(magicLinkTokens.consumedAt),
      ),
    );

  if (!tokenRow || tokenRow.expiresAt < new Date()) {
    return NextResponse.redirect(
      new URL(`/portal/${slug}?error=expired`, req.url),
    );
  }

  await db
    .update(magicLinkTokens)
    .set({ consumedAt: new Date() })
    .where(eq(magicLinkTokens.id, tokenRow.id));

  const cookieValue = encryptCookie({
    clientId: tokenRow.clientId,
    issuedAt: Date.now(),
  });

  const response = NextResponse.redirect(new URL(`/portal/${slug}`, req.url));
  response.cookies.set("portal_session", cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 86400,
    path: "/portal",
  });
  return response;
}
