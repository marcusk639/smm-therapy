import Stripe from "stripe";

export interface StripeSetupResult {
  growthPriceId: string;
  agencyPriceId: string;
  webhookSecret?: string;
}

export interface StripeModuleOptions {
  secretKey: string;
  webhookUrl?: string;
}

export async function setupStripe(
  opts: StripeModuleOptions,
): Promise<StripeSetupResult> {
  const stripe = new Stripe(opts.secretKey, { apiVersion: "2024-06-20" });

  const growthProduct = await stripe.products.create({ name: "Growth" });
  const growthPrice = await stripe.prices.create({
    product: growthProduct.id,
    unit_amount: 9900,
    currency: "usd",
    recurring: { interval: "month" },
  });

  const agencyProduct = await stripe.products.create({ name: "Agency" });
  const agencyPrice = await stripe.prices.create({
    product: agencyProduct.id,
    unit_amount: 29900,
    currency: "usd",
    recurring: { interval: "month" },
  });

  const result: StripeSetupResult = {
    growthPriceId: growthPrice.id,
    agencyPriceId: agencyPrice.id,
  };

  if (opts.webhookUrl) {
    const webhook = await stripe.webhookEndpoints.create({
      url: opts.webhookUrl,
      enabled_events: [
        "checkout.session.completed",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ],
    });
    result.webhookSecret = webhook.secret ?? undefined;
  }

  return result;
}
