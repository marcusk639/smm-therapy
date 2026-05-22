#!/usr/bin/env node
import { program } from "commander";

program
  .name("smm-setup")
  .description("Interactive setup CLI for SMM Therapy")
  .option("--ci", "Non-interactive CI mode (requires all env vars pre-set)")
  .option(
    "--skip-secrets",
    "Skip generating PORTAL_SECRET / INSTAGRAM_TOKEN_KEY",
  )
  .option("--skip-db", "Skip database migrations")
  .option("--skip-stripe", "Skip Stripe product/webhook setup")
  .option("--skip-clerk", "Skip Clerk webhook setup")
  .option("--skip-resend", "Skip Resend domain setup")
  .option("--skip-branding", "Skip branding text replacement")
  .option(
    "--brand-name <name>",
    "Brand name for CI mode (skips interactive prompt)",
  )
  .option("--app-url <url>", "App URL for CI mode (used for webhook endpoints)")
  .action(async (opts) => {
    console.log("SMM Therapy setup — scaffold running", opts);
  });

program.parseAsync(process.argv);
