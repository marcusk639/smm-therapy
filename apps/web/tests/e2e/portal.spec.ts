import { test, expect } from "@playwright/test";
import { checkA11y } from "@axe-core/playwright";

/**
 * E2E: Client approval portal — WCAG 2.1 AA accessibility
 * Requires:
 * - Dev server running (pnpm dev)
 * - Optional env vars for authenticated tests:
 *   TEST_CLIENT_SLUG  — a real client slug in the DB
 *   TEST_PORTAL_TOKEN — a valid portal_session token for that client
 *
 * Unauthenticated tests run against /portal/test-client and validate
 * the magic-link gate that the portal renders before auth.
 */

test.describe("Client approval portal accessibility", () => {
  test("portal draft list page is accessible", async ({ page }) => {
    await page.goto("/portal/test-client");

    // Without a session cookie the portal renders the magic-link gate —
    // either way the page must not be blank.
    const heading = page.getByRole("heading");
    const form = page.locator("form");
    const hasHeading = (await heading.count()) > 0;
    const hasForm = (await form.count()) > 0;
    expect(hasHeading || hasForm).toBe(true);

    // Throws on any WCAG 2.1 AA critical violation.
    await checkA11y(page);
  });

  test("portal magic link form has accessible labels", async ({ page }) => {
    await page.goto("/portal/test-client");

    // role="textbox" with an accessible name proves the label is associated.
    const emailInput = page.getByRole("textbox", { name: /email/i });
    await expect(emailInput).toBeVisible();

    await checkA11y(page, undefined, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
  });

  test("portal page keyboard navigation works", async ({ page }) => {
    await page.goto("/portal/test-client");

    // Tab once — focus must land on an interactive element.
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  });

  test("portal draft review page is accessible", async ({ page, context }) => {
    const clientSlug = process.env.TEST_CLIENT_SLUG;
    const portalToken = process.env.TEST_PORTAL_TOKEN;

    test.skip(
      !clientSlug || !portalToken,
      "TEST_CLIENT_SLUG and TEST_PORTAL_TOKEN env vars required",
    );

    await context.addCookies([
      {
        name: "portal_session",
        value: portalToken!,
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto(`/portal/${clientSlug}`);

    await checkA11y(page);
  });
});
