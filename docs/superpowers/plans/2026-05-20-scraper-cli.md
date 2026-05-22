# Scraper CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Playwright-based CLI tool that scrapes course content from carolineflett.com, converts it to plain text formatted for the `ig_posts` ingestion source type, and outputs one file per course module ready to ingest.

**Architecture:** A `commander`-based CLI with three commands: `scrape` (Playwright headless browser → HTML), `parse` (HTML → structured text), `export` (write output files). All three can be chained with `scrape-and-export`. Output format matches `ig_posts` source: one post per block, separated by `\n---\n`, so it can be fed directly to the knowledge base ingestion endpoint.

**Tech Stack:** Node.js · TypeScript · Playwright · `commander` · `@mozilla/readability` + `linkedom` · `tsx` (for running TS directly)

**Note:** If carolineflett.com requires login to access course content, the CLI will need to persist a Playwright browser state (auth cookies). See Task 2 for the login flow.

---

## File Structure

```
tools/scraper-cli/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts           CLI entry point (commander setup)
    ├── scraper.ts         Playwright scraper — login + page navigation
    ├── parser.ts          HTML → structured post blocks
    ├── output.ts          Write blocks to ig-posts format files
    └── types.ts           ScrapedPage, ParsedBlock, ExportOptions types
```

---

### Task 1: Scaffold CLI Project

**Files:**

- Create: `tools/scraper-cli/package.json`
- Create: `tools/scraper-cli/tsconfig.json`
- Create: `tools/scraper-cli/src/types.ts`

- [ ] **Step 1: Write failing test (type exports)**

```typescript
// tools/scraper-cli/src/__tests__/types.test.ts
import { describe, it, expect } from "vitest";
import type { ScrapedPage, ParsedBlock } from "../types";

describe("types", () => {
  it("ScrapedPage has required fields", () => {
    const page: ScrapedPage = {
      url: "https://example.com",
      title: "Test",
      html: "<p>hello</p>",
      scrapedAt: new Date(),
    };
    expect(page.url).toBe("https://example.com");
  });

  it("ParsedBlock has content and source", () => {
    const block: ParsedBlock = {
      content: "Some text",
      title: "Module 1",
      sourceUrl: "https://example.com/module-1",
    };
    expect(block.content).toBe("Some text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/scraper-cli
pnpm test
```

Expected: FAIL — "types" module not found

- [ ] **Step 3: Create package.json**

```json
// tools/scraper-cli/package.json
{
  "name": "@smm/scraper-cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "smm-scrape": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "scrape": "tsx src/index.ts scrape",
    "parse": "tsx src/index.ts parse",
    "export": "tsx src/index.ts export"
  },
  "dependencies": {
    "@mozilla/readability": "^0.5.0",
    "commander": "^12.0.0",
    "linkedom": "^0.18.0",
    "playwright": "^1.48.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "tsx": "^4",
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

- [ ] **Step 4: Create tsconfig.json**

```json
// tools/scraper-cli/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create types.ts**

```typescript
// tools/scraper-cli/src/types.ts
export type ScrapedPage = {
  url: string;
  title: string;
  html: string;
  scrapedAt: Date;
};

export type ParsedBlock = {
  content: string;
  title: string;
  sourceUrl: string;
};

export type ScrapeOptions = {
  baseUrl: string;
  email?: string;
  password?: string;
  maxPages?: number;
  outputDir?: string;
  statePath?: string;
};

export type ExportOptions = {
  outputDir: string;
  format: "ig-posts" | "json";
};
```

- [ ] **Step 6: Install dependencies**

```bash
cd tools/scraper-cli
pnpm install
pnpm playwright install chromium
```

- [ ] **Step 7: Run test to verify it passes**

```bash
cd tools/scraper-cli
pnpm test
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add tools/scraper-cli/
git commit -m "feat: scaffold scraper CLI project"
```

---

### Task 2: Playwright Scraper

**Files:**

- Create: `tools/scraper-cli/src/scraper.ts`

The scraper needs to:

1. Launch Chromium (headless)
2. Optionally restore saved auth state (cookies) from `statePath`
3. If login credentials provided and no saved state, navigate to login page and authenticate
4. Save auth state after login
5. Navigate to course index page at `baseUrl`
6. Discover all course module URLs (links to `/course/*` or lesson pages)
7. Visit each URL, capture `{ url, title, html }`
8. Return array of `ScrapedPage`

- [ ] **Step 1: Write the failing test**

```typescript
// tools/scraper-cli/src/__tests__/scraper.test.ts
import { describe, it, expect } from "vitest";
import { discoverLinks } from "../scraper";

describe("discoverLinks", () => {
  it("extracts absolute links matching pattern", () => {
    const html = `
      <html><body>
        <a href="/courses/module-1">Module 1</a>
        <a href="/courses/module-2">Module 2</a>
        <a href="https://external.com/page">External</a>
        <a href="/about">About</a>
      </body></html>
    `;
    const links = discoverLinks(
      html,
      "https://carolineflett.com",
      /\/courses\//,
    );
    expect(links).toHaveLength(2);
    expect(links[0]).toBe("https://carolineflett.com/courses/module-1");
    expect(links[1]).toBe("https://carolineflett.com/courses/module-2");
  });

  it("deduplicates links", () => {
    const html = `
      <a href="/courses/m1">A</a>
      <a href="/courses/m1">B</a>
    `;
    const links = discoverLinks(html, "https://example.com", /\/courses\//);
    expect(links).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/scraper-cli && pnpm test
```

Expected: FAIL — "discoverLinks" not found

- [ ] **Step 3: Implement scraper.ts**

```typescript
// tools/scraper-cli/src/scraper.ts
import { chromium, type Browser, type BrowserContext } from "playwright";
import { parseHTML } from "linkedom";
import type { ScrapedPage, ScrapeOptions } from "./types.js";
import fs from "node:fs/promises";
import path from "node:path";

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
    const href = (a as HTMLAnchorElement).href;
    if (!href) continue;

    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    // Only include links from the same origin matching the pattern
    if (!absolute.startsWith(baseUrl)) continue;
    const pathname = new URL(absolute).pathname;
    if (!pattern.test(pathname)) continue;
    if (seen.has(absolute)) continue;

    seen.add(absolute);
    links.push(absolute);
  }

  return links;
}

async function loginIfNeeded(
  context: BrowserContext,
  baseUrl: string,
  email: string,
  password: string,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });

  const emailField = page.locator('input[type="email"], input[name="email"]');
  const passwordField = page.locator(
    'input[type="password"], input[name="password"]',
  );

  if ((await emailField.count()) === 0) {
    await page.close();
    return; // Already logged in or no login form
  }

  await emailField.fill(email);
  await passwordField.fill(password);
  await page.locator('button[type="submit"], input[type="submit"]').click();
  await page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => null);
  await page.close();
}

export async function scrapePages(
  options: ScrapeOptions,
): Promise<ScrapedPage[]> {
  const {
    baseUrl,
    email,
    password,
    maxPages = 50,
    statePath = ".scraper-state.json",
  } = options;

  const browser: Browser = await chromium.launch({ headless: true });

  let context: BrowserContext;

  try {
    const stateExists = await fs
      .access(statePath)
      .then(() => true)
      .catch(() => false);

    if (stateExists) {
      context = await browser.newContext({ storageState: statePath });
    } else {
      context = await browser.newContext();
    }

    if (!stateExists && email && password) {
      await loginIfNeeded(context, baseUrl, email, password);
      await context.storageState({ path: statePath });
      console.log(`Auth state saved to ${statePath}`);
    }

    // Discover course links from the course index
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
      console.warn(
        "No course links found. Check baseUrl and ensure you are logged in.",
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
        console.error(`  failed: ${url} — ${(err as Error).message}`);
      }
    }

    return pages;
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/scraper-cli && pnpm test
```

Expected: PASS — discoverLinks tests pass

- [ ] **Step 5: Commit**

```bash
git add tools/scraper-cli/src/scraper.ts
git commit -m "feat: add Playwright scraper with login support and link discovery"
```

---

### Task 3: Content Parser

**Files:**

- Create: `tools/scraper-cli/src/parser.ts`

Parser converts raw HTML pages to `ParsedBlock[]` using `@mozilla/readability` to extract the main text content, then splits by heading boundaries into one block per lesson section.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/scraper-cli/src/__tests__/parser.test.ts
import { describe, it, expect } from "vitest";
import { parsePageToBlocks, cleanText } from "../parser";

describe("cleanText", () => {
  it("collapses whitespace", () => {
    expect(cleanText("  hello   world  ")).toBe("hello world");
  });

  it("removes zero-width characters", () => {
    expect(cleanText("hello​world")).toBe("helloworld");
  });
});

describe("parsePageToBlocks", () => {
  it("returns at least one block for readable HTML", () => {
    const html = `
      <html><head><title>Module 1: Anxiety</title></head>
      <body>
        <article>
          <h1>Module 1: Understanding Anxiety</h1>
          <p>Anxiety is a normal response to stress. It becomes problematic when it interferes with daily life.</p>
          <h2>Key concepts</h2>
          <p>The fight-or-flight response activates the sympathetic nervous system.</p>
        </article>
      </body></html>
    `;
    const blocks = parsePageToBlocks(
      html,
      "https://example.com/module-1",
      "Module 1",
    );
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]!.content.length).toBeGreaterThan(10);
    expect(blocks[0]!.sourceUrl).toBe("https://example.com/module-1");
  });

  it("falls back gracefully on unreadable HTML", () => {
    const blocks = parsePageToBlocks(
      "<html><body></body></html>",
      "https://x.com",
      "empty",
    );
    expect(blocks).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/scraper-cli && pnpm test
```

Expected: FAIL — "parser" module not found

- [ ] **Step 3: Implement parser.ts**

```typescript
// tools/scraper-cli/src/parser.ts
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { ScrapedPage, ParsedBlock } from "./types.js";

export function cleanText(text: string): string {
  return text
    .replace(/[​‌‍﻿]/g, "") // zero-width chars
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePageToBlocks(
  html: string,
  sourceUrl: string,
  pageTitle: string,
): ParsedBlock[] {
  const { document } = parseHTML(html);
  const reader = new Readability(document as unknown as Document);
  const article = reader.parse();

  if (!article?.textContent || article.textContent.trim().length < 50) {
    return [];
  }

  const title = cleanText(article.title || pageTitle);
  const fullText = cleanText(article.textContent);

  // Split on double newlines or heading-like patterns to get sub-blocks
  const sections = fullText
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30);

  if (sections.length === 0) {
    return [{ content: fullText, title, sourceUrl }];
  }

  // Group sections into blocks of ~300 chars to match IG post length
  const blocks: ParsedBlock[] = [];
  let current = "";

  for (const section of sections) {
    if (current.length + section.length + 2 > 350 && current.length > 0) {
      blocks.push({
        content: current.trim(),
        title,
        sourceUrl,
      });
      current = section;
    } else {
      current = current ? `${current}\n\n${section}` : section;
    }
  }

  if (current.trim().length >= 30) {
    blocks.push({ content: current.trim(), title, sourceUrl });
  }

  return blocks;
}

export function parsePages(pages: ScrapedPage[]): ParsedBlock[] {
  const allBlocks: ParsedBlock[] = [];

  for (const page of pages) {
    const blocks = parsePageToBlocks(page.html, page.url, page.title);
    allBlocks.push(...blocks);
    console.log(`  parsed ${blocks.length} blocks from: ${page.title}`);
  }

  return allBlocks;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/scraper-cli && pnpm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/scraper-cli/src/parser.ts
git commit -m "feat: add content parser with Readability extraction and block splitting"
```

---

### Task 4: Output Formatter + CLI Entry Point

**Files:**

- Create: `tools/scraper-cli/src/output.ts`
- Create: `tools/scraper-cli/src/index.ts`

Output format: a `.txt` file per source page (or one combined file) where each `ParsedBlock.content` is separated by `\n---\n`. This matches the `ig_posts` ingestion source which uses `\n---\n` as a post delimiter.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/scraper-cli/src/__tests__/output.test.ts
import { describe, it, expect } from "vitest";
import { formatAsIgPosts, sanitizeFilename } from "../output";

describe("formatAsIgPosts", () => {
  it("joins blocks with ---", () => {
    const blocks = [
      { content: "Block one", title: "M1", sourceUrl: "https://x.com/1" },
      { content: "Block two", title: "M1", sourceUrl: "https://x.com/1" },
    ];
    const result = formatAsIgPosts(blocks);
    expect(result).toContain("Block one");
    expect(result).toContain("Block two");
    expect(result).toContain("---");
  });

  it("single block has no separator", () => {
    const result = formatAsIgPosts([
      { content: "Solo", title: "T", sourceUrl: "https://x.com" },
    ]);
    expect(result).toBe("Solo");
  });
});

describe("sanitizeFilename", () => {
  it("replaces spaces and special chars", () => {
    expect(sanitizeFilename("Module 1: Anxiety & Stress")).toBe(
      "module-1-anxiety-stress",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/scraper-cli && pnpm test
```

Expected: FAIL — "output" module not found

- [ ] **Step 3: Implement output.ts**

```typescript
// tools/scraper-cli/src/output.ts
import fs from "node:fs/promises";
import path from "node:path";
import type { ParsedBlock, ExportOptions } from "./types.js";

export function formatAsIgPosts(blocks: ParsedBlock[]): string {
  return blocks.map((b) => b.content).join("\n---\n");
}

export function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function exportBlocks(
  blocks: ParsedBlock[],
  options: ExportOptions,
): Promise<string[]> {
  await fs.mkdir(options.outputDir, { recursive: true });

  // Group blocks by title (each page becomes one file)
  const groupedByTitle = blocks.reduce<Record<string, ParsedBlock[]>>(
    (acc, block) => {
      const key = block.title;
      acc[key] = [...(acc[key] ?? []), block];
      return acc;
    },
    {},
  );

  const writtenFiles: string[] = [];

  for (const [title, titleBlocks] of Object.entries(groupedByTitle)) {
    const filename = `${sanitizeFilename(title)}.txt`;
    const filepath = path.join(options.outputDir, filename);
    const content = formatAsIgPosts(titleBlocks);

    await fs.writeFile(filepath, content, "utf-8");
    writtenFiles.push(filepath);
    console.log(`  wrote: ${filepath} (${titleBlocks.length} blocks)`);
  }

  return writtenFiles;
}

export async function exportCombined(
  blocks: ParsedBlock[],
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const content = formatAsIgPosts(blocks);
  await fs.writeFile(outputPath, content, "utf-8");
  console.log(
    `  wrote combined: ${outputPath} (${blocks.length} total blocks)`,
  );
}
```

- [ ] **Step 4: Implement CLI entry point**

```typescript
// tools/scraper-cli/src/index.ts
import { Command } from "commander";
import { scrapePages } from "./scraper.js";
import { parsePages } from "./parser.js";
import { exportBlocks, exportCombined } from "./output.js";
import fs from "node:fs/promises";

const program = new Command();

program
  .name("smm-scrape")
  .description("Scrape carolineflett.com course content for RAG ingestion")
  .version("0.1.0");

program
  .command("scrape-and-export")
  .description("Scrape pages, parse content, and export ig-posts format files")
  .requiredOption("--url <url>", "Base URL to scrape")
  .option("--email <email>", "Login email (if auth required)")
  .option("--password <password>", "Login password (if auth required)")
  .option("--max-pages <n>", "Max pages to scrape", "50")
  .option("--output <dir>", "Output directory", "./scraper-output")
  .option(
    "--combined",
    "Write a single combined file instead of per-page files",
  )
  .option(
    "--state-path <path>",
    "Browser state file path",
    ".scraper-state.json",
  )
  .action(async (opts) => {
    console.log(`Scraping: ${opts.url}`);

    const pages = await scrapePages({
      baseUrl: opts.url,
      email: opts.email,
      password: opts.password,
      maxPages: parseInt(opts.maxPages, 10),
      outputDir: opts.output,
      statePath: opts.statePath,
    });

    console.log(`\nScraped ${pages.length} pages. Parsing…`);
    const blocks = parsePages(pages);
    console.log(`\nParsed ${blocks.length} total blocks. Exporting…`);

    if (opts.combined) {
      await exportCombined(blocks, `${opts.output}/combined.txt`);
    } else {
      const files = await exportBlocks(blocks, {
        outputDir: opts.output,
        format: "ig-posts",
      });
      console.log(`\nExported ${files.length} files to ${opts.output}/`);
    }

    console.log("\nDone. Upload the .txt files to your knowledge base.");
  });

program
  .command("login")
  .description("Authenticate and save browser state for future scrapes")
  .requiredOption("--url <url>", "Base URL")
  .requiredOption("--email <email>", "Login email")
  .requiredOption("--password <password>", "Login password")
  .option(
    "--state-path <path>",
    "Browser state file path",
    ".scraper-state.json",
  )
  .action(async (opts) => {
    console.log("Logging in…");
    await scrapePages({
      baseUrl: opts.url,
      email: opts.email,
      password: opts.password,
      maxPages: 0,
      statePath: opts.statePath,
    });
    console.log(`Auth state saved to ${opts.statePath}`);
  });

program
  .command("clear-auth")
  .description("Delete saved browser auth state")
  .option(
    "--state-path <path>",
    "Browser state file path",
    ".scraper-state.json",
  )
  .action(async (opts) => {
    await fs.unlink(opts.statePath).catch(() => null);
    console.log(`Cleared auth state: ${opts.statePath}`);
  });

program.parse();
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd tools/scraper-cli && pnpm test
```

Expected: PASS — all tests in parser, scraper, output, types pass

- [ ] **Step 6: Smoke test the CLI**

```bash
cd tools/scraper-cli
pnpm dev scrape-and-export --url "https://carolineflett.com" --output ./test-output --max-pages 3
```

Expected: CLI starts Playwright, attempts to scrape up to 3 pages, writes `.txt` files to `./test-output/`.
If authentication is required: first run `pnpm dev login --url "https://carolineflett.com" --email YOUR_EMAIL --password YOUR_PASS`

- [ ] **Step 7: Commit**

```bash
git add tools/scraper-cli/src/output.ts tools/scraper-cli/src/index.ts
git commit -m "feat: add ig-posts output formatter and CLI entry point"
```

---

### Usage After Implementation

**First-time setup (if site requires login):**

```bash
cd tools/scraper-cli
pnpm dev login \
  --url "https://carolineflett.com" \
  --email "your@email.com" \
  --password "yourpassword"
```

**Scrape and export:**

```bash
pnpm dev scrape-and-export \
  --url "https://carolineflett.com/courses" \
  --output ./course-content \
  --max-pages 100
```

**Ingest the output files:**
For each `.txt` file in `./course-content/`, upload via the knowledge base API:

```bash
# Example using curl — replace with actual auth token and client/KB IDs
for f in ./course-content/*.txt; do
  curl -X POST https://yourapp.com/api/v1/clients/CLIENT_ID/knowledge-bases/KB_ID/documents \
    -H "Authorization: Bearer TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"sourceType\":\"ig_posts\",\"title\":\"$(basename $f .txt)\",\"rawContent\":\"$(cat $f | jq -Rs .)\",\"rightsConfirmed\":true}"
done
```

**Adding new tools/ package to pnpm workspace:**
Ensure `tools/*` is included in `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tools/*"
```
