import { NextResponse } from "next/server";
import {
  stripe,
  planFromPriceId,
  subscriptionCurrentPeriodEnd,
} from "@/lib/stripe";
import { db } from "@smm/db/client";
import { stripeSubscriptions, workspaces } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId;
      if (!workspaceId || !session.customer || !session.subscription) break;

      const sub = await stripe.subscriptions.retrieve(
        session.subscription as string,
      );
      const priceId = sub.items.data[0]?.price.id ?? "";
      const plan = planFromPriceId(priceId);

      const periodEnd = subscriptionCurrentPeriodEnd(sub);

      await db
        .insert(stripeSubscriptions)
        .values({
          workspaceId,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          status: "active",
          currentPeriodEnd: periodEnd,
        })
        .onConflictDoUpdate({
          target: stripeSubscriptions.workspaceId,
          set: {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: sub.id,
            stripePriceId: priceId,
            status: "active",
            currentPeriodEnd: periodEnd,
            updatedAt: new Date(),
          },
        });

      await db
        .update(workspaces)
        .set({ plan })
        .where(eq(workspaces.id, workspaceId));
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price.id ?? "";
      const plan = planFromPriceId(priceId);

      await db
        .update(stripeSubscriptions)
        .set({
          stripePriceId: priceId,
          status: sub.status as
            | "active"
            | "trialing"
            | "past_due"
            | "canceled"
            | "unpaid"
            | "incomplete",
          currentPeriodEnd: subscriptionCurrentPeriodEnd(sub),
          updatedAt: new Date(),
        })
        .where(eq(stripeSubscriptions.stripeSubscriptionId, sub.id));

      const [row] = await db
        .select({ workspaceId: stripeSubscriptions.workspaceId })
        .from(stripeSubscriptions)
        .where(eq(stripeSubscriptions.stripeSubscriptionId, sub.id));

      if (row) {
        await db
          .update(workspaces)
          .set({
            plan:
              sub.status === "active" || sub.status === "trialing"
                ? plan
                : "starter",
          })
          .where(eq(workspaces.id, row.workspaceId));
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const [row] = await db
        .select({ workspaceId: stripeSubscriptions.workspaceId })
        .from(stripeSubscriptions)
        .where(eq(stripeSubscriptions.stripeSubscriptionId, sub.id));

      if (row) {
        await db
          .update(stripeSubscriptions)
          .set({ status: "canceled", updatedAt: new Date() })
          .where(eq(stripeSubscriptions.stripeSubscriptionId, sub.id));
        await db
          .update(workspaces)
          .set({ plan: "starter" })
          .where(eq(workspaces.id, row.workspaceId));
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
