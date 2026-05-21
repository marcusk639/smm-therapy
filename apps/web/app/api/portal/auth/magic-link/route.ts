import { NextResponse } from "next/server";
import { db } from "@smm/db/client";
import { clients, magicLinkTokens } from "@smm/db/schema";
import { eq, and, gt, count } from "drizzle-orm";
import { generateMagicToken } from "@/lib/portal-auth";
import { sendMagicLinkEmail } from "@/lib/email";
import { MagicLinkSchema } from "@smm/types/portal";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = MagicLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { email, clientSlug } = parsed.data;

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.slug, clientSlug));
  if (!client) {
    // Silent success to prevent slug enumeration
    return NextResponse.json({ ok: true });
  }

  // Rate limit: max 5 tokens issued in last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [{ value: recentCount }] = await db
    .select({ value: count() })
    .from(magicLinkTokens)
    .where(
      and(
        eq(magicLinkTokens.email, email),
        eq(magicLinkTokens.clientId, client.id),
        gt(magicLinkTokens.createdAt, oneHourAgo),
      ),
    );

  if (recentCount >= 5) {
    return NextResponse.json(
      { error: "Too many requests. Try again in an hour." },
      { status: 429 },
    );
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const { rawToken, tokenHash } = generateMagicToken();

  await db.insert(magicLinkTokens).values({
    clientId: client.id,
    workspaceId: client.workspaceId,
    email,
    tokenHash,
    expiresAt,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const magicUrl = `${baseUrl}/api/portal/auth/verify?token=${rawToken}&slug=${clientSlug}`;

  await sendMagicLinkEmail(email, magicUrl, client.name);

  return NextResponse.json({ ok: true });
}
