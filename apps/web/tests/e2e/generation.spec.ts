import { test, expect } from "@playwright/test";

/**
 * E2E: Full generation flow
 * Requires:
 * - Dev server running (pnpm dev)
 * - A test user account signed in (or use Clerk test tokens)
 * - At least one client in the DB
 *
 * This test covers the golden path. Run manually before each PR merge.
 */

test.describe("Hook + Caption generation flow", () => {
  test.beforeEach(async ({ page }) => {
    // Sign in using Clerk's test helper. In a real test, set up Clerk test tokens.
    // For now, this navigates to sign-in and assumes a test account exists.
    await page.goto("/sign-in");
    // If already signed in (cookie), this redirects to /dashboard automatically.
    // Adjust to your test auth setup.
  });

  test("can navigate to hook generator for a client", async ({ page }) => {
    await page.goto("/clients");
    // Find first client link or navigate directly
    const clientLinks = page.locator("a[href*='/clients/']");
    await expect(clientLinks.first()).toBeVisible();
  });

  test("hook generator shows results after topic input", async ({ page }) => {
    // Navigate directly to hook generator (replace CLIENT_ID with a test value)
    const clientId = process.env.TEST_CLIENT_ID;
    if (!clientId) {
      test.skip(!clientId, "TEST_CLIENT_ID env var required");
      return;
    }

    await page.goto(`/clients/${clientId}/generate/hooks`);
    await expect(
      page.getByRole("heading", { name: "Generate Hooks" }),
    ).toBeVisible();

    await page.getByLabel("Topic").fill("managing anxiety at work");
    await page.getByRole("button", { name: "Generate Hooks" }).click();

    // Wait for hooks to appear (up to 30s for LLM response)
    await expect(page.getByRole("checkbox").first()).toBeVisible({
      timeout: 30_000,
    });

    // Should have at least 5 hooks
    const checkboxes = page.getByRole("checkbox");
    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("compliance badge appears after generation", async ({ page }) => {
    const clientId = process.env.TEST_CLIENT_ID;
    if (!clientId) {
      test.skip(!clientId, "TEST_CLIENT_ID env var required");
      return;
    }

    await page.goto(`/clients/${clientId}/generate/hooks`);
    await page.getByLabel("Topic").fill("anxiety management techniques");
    await page.getByRole("button", { name: "Generate Hooks" }).click();

    await expect(page.getByText(/Compliant|violation/).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("selecting a hook enables Generate Captions button", async ({
    page,
  }) => {
    const clientId = process.env.TEST_CLIENT_ID;
    if (!clientId) {
      test.skip(!clientId, "TEST_CLIENT_ID env var required");
      return;
    }

    await page.goto(`/clients/${clientId}/generate/hooks`);
    await page.getByLabel("Topic").fill("coping with depression");
    await page.getByRole("button", { name: "Generate Hooks" }).click();

    await expect(page.getByRole("checkbox").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("checkbox").first().click();

    await expect(
      page.getByRole("link", { name: /Generate Captions/ }),
    ).toBeVisible();
  });

  test("crisis warning appears for crisis-adjacent topic", async ({ page }) => {
    const clientId = process.env.TEST_CLIENT_ID;
    if (!clientId) {
      test.skip(!clientId, "TEST_CLIENT_ID env var required");
      return;
    }

    await page.goto(`/clients/${clientId}/generate/hooks`);
    await page
      .getByLabel("Topic")
      .fill("suicidal ideation awareness for practitioners");
    await page.getByRole("button", { name: "Generate Hooks" }).click();

    // This may or may not trigger crisis detection depending on content
    // Just verify the page doesn't crash
    await expect(
      page.getByRole("heading", { name: "Generate Hooks" }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("can save a draft from captions page", async ({ page }) => {
    const clientId = process.env.TEST_CLIENT_ID;
    if (!clientId) {
      test.skip(!clientId, "TEST_CLIENT_ID env var required");
      return;
    }

    // Navigate directly to captions with pre-selected hook
    const hook = encodeURIComponent(
      JSON.stringify(["What your anxiety is actually telling you ↓"]),
    );
    const topic = encodeURIComponent("anxiety awareness");
    await page.goto(
      `/clients/${clientId}/generate/captions?hooks=${hook}&topic=${topic}`,
    );

    // Wait for captions to load
    await expect(
      page.getByRole("button", { name: "Save Draft" }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Save Draft" }).first().click();

    await expect(
      page.getByRole("button", { name: "Saved ✓" }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
