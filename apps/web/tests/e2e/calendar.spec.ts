import { test, expect } from "@playwright/test";

/**
 * E2E: Content calendar
 * Requires:
 * - Dev server running (pnpm dev)
 * - A signed-in test user (Clerk test tokens or pre-seeded session)
 * - TEST_CLIENT_ID env var set to a valid client UUID
 *
 * All tests skip when TEST_CLIENT_ID is absent to avoid CI failures
 * in environments without a seeded database.
 */

test.describe("Content calendar", () => {
  test.beforeEach(async ({ page }) => {
    if (!process.env.TEST_CLIENT_ID) {
      return;
    }
    await page.goto("/sign-in");
    // If a valid session cookie is present, Clerk redirects to /dashboard automatically.
  });

  test("calendar page renders month view", async ({ page }) => {
    const clientId = process.env.TEST_CLIENT_ID;
    if (!clientId) {
      test.skip(!clientId, "TEST_CLIENT_ID env var required");
      return;
    }

    await page.goto(`/clients/${clientId}/calendar`);
    // Use a broad selector — month name, "Calendar" heading, or the grid itself
    const calendarView = page
      .getByRole("heading", { name: /calendar/i })
      .or(page.getByRole("grid").first())
      .or(
        page.getByText(
          /January|February|March|April|May|June|July|August|September|October|November|December/,
        ),
      )
      .first();
    await expect(calendarView).toBeVisible({ timeout: 10_000 });
  });

  test("calendar generate button is present", async ({ page }) => {
    const clientId = process.env.TEST_CLIENT_ID;
    if (!clientId) {
      test.skip(!clientId, "TEST_CLIENT_ID env var required");
      return;
    }

    await page.goto(`/clients/${clientId}/calendar`);
    // Verify the generate/schedule action is surfaced on the calendar page
    const generateButton = page
      .getByRole("button", { name: /generate/i })
      .or(page.getByRole("button", { name: /schedule/i }))
      .first();
    await expect(generateButton).toBeVisible({ timeout: 10_000 });
  });
});
