import { Webhook } from "svix";
import { headers } from "next/headers";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { db } from "@smm/db/client";
import { workspaces } from "@smm/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;
  try {
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (evt.type === "organization.created") {
    const { id, name, slug } = evt.data;
    await db
      .insert(workspaces)
      .values({
        clerkOrgId: id,
        name,
        slug: slug ?? id,
      })
      .onConflictDoNothing({ target: workspaces.clerkOrgId });
  }

  if (evt.type === "organization.updated") {
    const { id, name, slug } = evt.data;
    await db
      .update(workspaces)
      .set({ name, slug: slug ?? id })
      .where(eq(workspaces.clerkOrgId, id));
  }

  return new Response("OK", { status: 200 });
}
