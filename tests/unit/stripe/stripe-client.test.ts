import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
});

describe("stripe client", () => {
  it("exports a stripe instance", async () => {
    const { stripe } = await import("../../../apps/web/lib/stripe");
    expect(stripe).toBeDefined();
    expect(typeof stripe.customers.create).toBe("function");
  });

  it("planFromPriceId returns starter for unknown price", async () => {
    const { planFromPriceId } = await import("../../../apps/web/lib/stripe");
    expect(planFromPriceId("price_unknown")).toBe("starter");
  });

  it("planFromPriceId recognises configured price IDs", async () => {
    const { planFromPriceId, PRICE_IDS } =
      await import("../../../apps/web/lib/stripe");
    expect(planFromPriceId(PRICE_IDS.growth!)).toBe("growth");
    expect(planFromPriceId(PRICE_IDS.agency!)).toBe("agency");
  });
});
