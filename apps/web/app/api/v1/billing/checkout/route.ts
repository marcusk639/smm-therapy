import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { stripe, PRICE_IDS } from "@/lib/stripe";
import { db } from "@smm/db/client";
import { stripeSubscriptions } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const CheckoutSchema = z.object({ plan: z.enum(["growth", "agency"]) });

export async function POST(req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const body = await req.json();
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const priceId = PRICE_IDS[parsed.data.plan]!;

  const [existing] = await db
    .select({ stripeCustomerId: stripeSubscriptions.stripeCustomerId })
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.workspaceId, workspaceId));

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    ...(existing?.stripeCustomerId
      ? { customer: existing.stripeCustomerId }
      : {}),
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { workspaceId },
    success_url: `${baseUrl}/settings/billing?success=1`,
    cancel_url: `${baseUrl}/settings/billing?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
