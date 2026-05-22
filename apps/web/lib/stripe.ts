import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not configured");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-04-30.basil",
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
