import { test, expect } from "@playwright/test";

/**
 * E2E: Authentication flow
 * Requires:
 * - Dev server running (pnpm dev)
 * - Clerk configured in the environment
 *
 * Public routes are tested without credentials.
 * Protected route redirect is verified against Clerk middleware behavior.
 */

test.describe("Auth flow", () => {
  test("sign-in page loads", async ({ page }) => {
    await page.goto("/sign-in");
    // Clerk renders its own form — use a broad selector
    const heading = page.getByRole("heading");
    const form = page.locator("form");
    await expect(heading.or(form).first()).toBeVisible({ timeout: 10_000 });
  });

  test("unauthenticated user redirected from /dashboard to /sign-in", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // Clerk middleware redirects unauthenticated users
    await page.waitForURL(/\/sign-in/, { timeout: 10_000 });
    expect(page.url()).toContain("/sign-in");
  });

  test("marketing page is accessible without auth", async ({ page }) => {
    const response = await page.goto("/");
    // Should not redirect away from the root
    expect(page.url()).toMatch(/^http:\/\/localhost:3000\//);
    expect(response?.status()).toBe(200);
  });
});
