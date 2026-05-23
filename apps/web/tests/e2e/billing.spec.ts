import { test, expect } from "@playwright/test";

/**
 * E2E: Billing page
 * Requires:
 * - Dev server running (pnpm dev)
 * - A signed-in test user (Clerk test tokens or pre-seeded session)
 * - TEST_CLIENT_ID env var set
 *
 * All tests skip when TEST_CLIENT_ID is absent to avoid CI failures
 * in environments without a seeded database.
 */

test.describe("Billing page", () => {
  test.beforeEach(async ({ page }) => {
    if (!process.env.TEST_CLIENT_ID) {
      return;
    }
    await page.goto("/sign-in");
    // If a valid session cookie is present, Clerk redirects to /dashboard automatically.
  });

  test("billing page renders plan cards", async ({ page }) => {
    if (!process.env.TEST_CLIENT_ID) {
      test.skip(
        !process.env.TEST_CLIENT_ID,
        "TEST_CLIENT_ID required for auth tests",
      );
      return;
    }

    await page.goto("/settings/billing");
    // At least one of the expected plan tier names must be visible
    const planText = page.getByText(/Starter|Growth|Agency/i).first();
    await expect(planText).toBeVisible({ timeout: 10_000 });
  });

  test("billing page shows current plan", async ({ page }) => {
    if (!process.env.TEST_CLIENT_ID) {
      test.skip(
        !process.env.TEST_CLIENT_ID,
        "TEST_CLIENT_ID required for auth tests",
      );
      return;
    }

    await page.goto("/settings/billing");
    // A badge or label indicating the active plan
    const currentPlanIndicator = page
      .getByText(/starter|current plan/i)
      .first();
    await expect(currentPlanIndicator).toBeVisible({ timeout: 10_000 });
  });

  test("data export link is present", async ({ page }) => {
    if (!process.env.TEST_CLIENT_ID) {
      test.skip(
        !process.env.TEST_CLIENT_ID,
        "TEST_CLIENT_ID required for auth tests",
      );
      return;
    }

    await page.goto("/settings/billing");
    // Verify the data export feature is wired up on the billing page
    const exportElement = page
      .getByRole("link", { name: /export/i })
      .or(page.getByRole("button", { name: /export/i }))
      .first();
    await expect(exportElement).toBeVisible({ timeout: 10_000 });
  });
});
