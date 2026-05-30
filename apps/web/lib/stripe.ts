import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not configured");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-04-22.dahlia",
  typescript: true,
});

export const PRICE_IDS: Record<string, string> = {
  growth: process.env.STRIPE_PRICE_GROWTH ?? "price_growth_monthly",
  agency: process.env.STRIPE_PRICE_AGENCY ?? "price_agency_monthly",
};

export function planFromPriceId(
  priceId: string,
): "growth" | "agency" | "starter" {
  if (priceId === PRICE_IDS.growth) return "growth";
  if (priceId === PRICE_IDS.agency) return "agency";
  return "starter";
}

/**
 * In the 2026-04-22.dahlia API version `current_period_end` moved from the
 * Subscription top level onto each subscription item. Read it off the first
 * item; returns null when no items are present.
 */
export function subscriptionCurrentPeriodEnd(
  sub: Stripe.Subscription,
): Date | null {
  const ts = sub.items.data[0]?.current_period_end;
  return typeof ts === "number" ? new Date(ts * 1000) : null;
}
