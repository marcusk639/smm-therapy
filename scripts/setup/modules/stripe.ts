import Stripe from "stripe";

const STRIPE_API_VERSION = "2026-04-22.dahlia" as const;

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
  try {
    const stripe = new Stripe(opts.secretKey, {
      apiVersion: STRIPE_API_VERSION,
    });

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Stripe setup failed: ${message}`);
  }
}
