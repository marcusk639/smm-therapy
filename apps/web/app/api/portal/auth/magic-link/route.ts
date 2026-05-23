import { NextResponse } from "next/server";
import { db } from "@smm/db/client";
import { clients, magicLinkTokens } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import { generateMagicToken } from "@/lib/portal-auth";
import { sendMagicLinkEmail } from "@/lib/email";
import { MagicLinkSchema } from "@smm/types/portal";
import { checkRateLimit } from "@/lib/rate-limit";

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

  const { allowed } = await checkRateLimit(
    `magic-link:${email}`,
    5,
    60 * 60 * 1000,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.slug, clientSlug));
  if (!client) {
    return NextResponse.json({ ok: true });
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
