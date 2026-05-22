import { parseHTML } from "linkedom";
import type { ScrapedPage, ScrapeOptions } from "./types.js";

export function discoverLinks(
  html: string,
  baseUrl: string,
  pattern: RegExp,
): string[] {
  const { document } = parseHTML(html);
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  const seen = new Set<string>();
  const links: string[] = [];

  for (const a of anchors) {
    const href = (a as HTMLAnchorElement).getAttribute("href");
    if (!href) continue;

    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    if (!absolute.startsWith(baseUrl)) continue;
    const pathname = new URL(absolute).pathname;
    if (!pattern.test(pathname)) continue;
    if (seen.has(absolute)) continue;

    seen.add(absolute);
    links.push(absolute);
  }

  return links;
}

export async function scrapePages(
  options: ScrapeOptions,
): Promise<ScrapedPage[]> {
  // Dynamic import keeps playwright out of the module graph for unit tests
  const { chromium } = await import("playwright");
  const fs = await import("node:fs/promises");

  const {
    baseUrl,
    email,
    password,
    maxPages = 50,
    statePath = ".scraper-state.json",
  } = options;

  const browser = await chromium.launch({ headless: true });

  try {
    const stateExists = await fs
      .access(statePath)
      .then(() => true)
      .catch(() => false);

    const context = stateExists
      ? await browser.newContext({ storageState: statePath })
      : await browser.newContext();

    if (!stateExists && email && password) {
      const loginPage = await context.newPage();
      await loginPage.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });

      const emailField = loginPage.locator(
        'input[type="email"], input[name="email"]',
      );
      if ((await emailField.count()) > 0) {
        await emailField.fill(email);
        await loginPage
          .locator('input[type="password"], input[name="password"]')
          .fill(password);
        await loginPage
          .locator('button[type="submit"], input[type="submit"]')
          .click();
        await loginPage
          .waitForNavigation({ waitUntil: "networkidle" })
          .catch(() => null);
      }
      await loginPage.close();
      await context.storageState({ path: statePath });
      process.stdout.write(`Auth state saved to ${statePath}\n`);
    }

    const indexPage = await context.newPage();
    await indexPage.goto(baseUrl, { waitUntil: "networkidle" });
    const indexHtml = await indexPage.content();
    await indexPage.close();

    const coursePattern = /\/(course|lesson|module|learn)\//i;
    const links = discoverLinks(indexHtml, baseUrl, coursePattern).slice(
      0,
      maxPages,
    );

    if (links.length === 0) {
      process.stdout.write(
        "No course links found. Check baseUrl and ensure you are logged in.\n",
      );
    }

    const pages: ScrapedPage[] = [];

    for (const url of links) {
      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        const title = await page.title();
        const html = await page.content();
        await page.close();

        pages.push({ url, title, html, scrapedAt: new Date() });
        process.stdout.write(`  scraped: ${url}\n`);
      } catch (err) {
        process.stderr.write(`  failed: ${url} — ${(err as Error).message}\n`);
      }
    }

    return pages;
  } finally {
    await browser.close();
  }
}
