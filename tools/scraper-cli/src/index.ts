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
    process.stdout.write(`Scraping: ${opts.url}\n`);

    const pages = await scrapePages({
      baseUrl: opts.url,
      email: opts.email,
      password: opts.password,
      maxPages: parseInt(opts.maxPages, 10),
      outputDir: opts.output,
      statePath: opts.statePath,
    });

    process.stdout.write(`\nScraped ${pages.length} pages. Parsing…\n`);
    const blocks = parsePages(pages);
    process.stdout.write(
      `\nParsed ${blocks.length} total blocks. Exporting…\n`,
    );

    if (opts.combined) {
      await exportCombined(blocks, `${opts.output}/combined.txt`);
    } else {
      const files = await exportBlocks(blocks, {
        outputDir: opts.output,
        format: "ig-posts",
      });
      process.stdout.write(
        `\nExported ${files.length} files to ${opts.output}/\n`,
      );
    }

    process.stdout.write(
      "\nDone. Upload the .txt files to your knowledge base.\n",
    );
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
    process.stdout.write("Logging in…\n");
    await scrapePages({
      baseUrl: opts.url,
      email: opts.email,
      password: opts.password,
      maxPages: 0,
      statePath: opts.statePath,
    });
    process.stdout.write(`Auth state saved to ${opts.statePath}\n`);
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
    process.stdout.write(`Cleared auth state: ${opts.statePath}\n`);
  });

program.parse();
