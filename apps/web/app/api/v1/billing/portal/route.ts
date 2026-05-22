import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { stripe } from "@/lib/stripe";
import { db } from "@smm/db/client";
import { stripeSubscriptions } from "@smm/db/schema";
import { eq } from "drizzle-orm";

export async function POST(_req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const [sub] = await db
    .select({ stripeCustomerId: stripeSubscriptions.stripeCustomerId })
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.workspaceId, workspaceId));

  if (!sub) {
    return NextResponse.json(
      { error: "No active subscription found" },
      { status: 404 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${baseUrl}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
