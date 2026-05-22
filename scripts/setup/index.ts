#!/usr/bin/env node
import { program } from "commander";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import * as clack from "@clack/prompts";
import { parseEnvFile, mergeEnv, serializeEnv } from "./utils/env.js";
import { generateHexSecret } from "./utils/secrets.js";
import { replaceBranding, findBrandingOccurrences } from "./utils/branding.js";
import { runMigrations } from "./modules/db.js";

const ENV_PATH = resolve(process.cwd(), "apps/web/.env.local");

const BRANDING_FILES = [
  "apps/web/app/(marketing)/layout.tsx",
  "apps/web/app/(marketing)/page.tsx",
];

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  return parseEnvFile(readFileSync(ENV_PATH, "utf-8"));
}

function writeEnv(env: Record<string, string>): void {
  writeFileSync(ENV_PATH, serializeEnv(env), "utf-8");
}

function log(ci: boolean, msg: string): void {
  if (ci) console.log("[setup]", msg);
  else clack.log.info(msg);
}

function warn(ci: boolean, msg: string): void {
  if (ci) console.warn("[setup] WARN:", msg);
  else clack.log.warn(msg);
}

function logError(ci: boolean, msg: string): void {
  if (ci) console.error("[setup] ERROR:", msg);
  else clack.log.error(msg);
}

program
  .name("smm-setup")
  .description("Interactive setup CLI for SMM Therapy")
  .option("--ci", "Non-interactive CI mode (requires env vars pre-set)")
  .option(
    "--skip-secrets",
    "Skip generating PORTAL_SECRET / INSTAGRAM_TOKEN_KEY",
  )
  .option("--skip-db", "Skip database migrations")
  .option("--skip-stripe", "Skip Stripe product/webhook setup")
  .option("--skip-clerk", "Skip Clerk webhook setup")
  .option("--skip-resend", "Skip Resend domain setup")
  .option("--skip-branding", "Skip branding text replacement")
  .option("--brand-name <name>", "Brand name for CI mode (skips prompt)")
  .option("--app-url <url>", "App URL for CI mode (used for webhook endpoints)")
  .action(async (opts) => {
    const ci = Boolean(opts.ci);

    if (!ci) clack.intro("SMM Therapy — Post-Implementation Setup");

    let env = readEnv();

    // ── Secrets ────────────────────────────────────────────────────────────
    if (!opts.skipSecrets) {
      const needsPortal = !env.PORTAL_SECRET;
      const needsIgKey = !env.INSTAGRAM_TOKEN_KEY;

      if (needsPortal || needsIgKey) {
        const spin = ci ? null : clack.spinner();
        spin?.start("Generating secrets");

        if (needsPortal) env.PORTAL_SECRET = generateHexSecret();
        if (needsIgKey) env.INSTAGRAM_TOKEN_KEY = generateHexSecret();
        writeEnv(env);

        spin?.stop("Secrets written to apps/web/.env.local");
        if (ci) console.log("[setup] Generated secrets → apps/web/.env.local");
      } else {
        log(ci, "Secrets already set — skipping generation");
      }
    }

    // ── Database ───────────────────────────────────────────────────────────
    if (!opts.skipDb) {
      const databaseUrl = env.DATABASE_URL ?? process.env.DATABASE_URL;
      if (!databaseUrl) {
        warn(
          ci,
          "DATABASE_URL not found — skipping migrations. Add it to apps/web/.env.local and re-run with --skip-secrets.",
        );
      } else {
        process.env.DATABASE_URL = databaseUrl;
        const spin = ci ? null : clack.spinner();
        spin?.start("Running database migrations");

        const result = runMigrations();
        if (result.success) {
          spin?.stop("Migrations applied");
          if (ci) console.log("[setup] Migrations applied");
        } else {
          spin?.stop("Migration failed");
          logError(ci, result.error ?? "Unknown migration error");
          if (ci) process.exit(1);
        }
      }
    }

    // ── Stripe ─────────────────────────────────────────────────────────────
    if (!opts.skipStripe) {
      const stripeKey = env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        warn(
          ci,
          "STRIPE_SECRET_KEY not set — skipping Stripe setup. Add it and re-run with --skip-db --skip-secrets.",
        );
      } else if (env.STRIPE_PRICE_GROWTH && env.STRIPE_PRICE_AGENCY) {
        log(
          ci,
          `Stripe prices already configured (Growth: ${env.STRIPE_PRICE_GROWTH}, Agency: ${env.STRIPE_PRICE_AGENCY}) — skipping. Use --skip-stripe to suppress this message.`,
        );
      } else {
        let webhookUrl: string | undefined;

        if (!ci) {
          const input = await clack.text({
            message:
              "App URL for Stripe webhook (leave blank for local dev — use Stripe CLI instead):",
            placeholder: "https://yourdomain.com",
          });
          if (!clack.isCancel(input) && input) {
            webhookUrl = `${input}/api/webhooks/stripe`;
          }
        } else if (opts.appUrl) {
          webhookUrl = `${opts.appUrl}/api/webhooks/stripe`;
        }

        const { setupStripe } = await import("./modules/stripe.js");
        const spin = ci ? null : clack.spinner();
        spin?.start("Creating Stripe products and prices");

        try {
          const result = await setupStripe({
            secretKey: stripeKey,
            webhookUrl,
          });
          env = mergeEnv(env, {
            STRIPE_PRICE_GROWTH: result.growthPriceId,
            STRIPE_PRICE_AGENCY: result.agencyPriceId,
            ...(result.webhookSecret
              ? { STRIPE_WEBHOOK_SECRET: result.webhookSecret }
              : {}),
          });
          writeEnv(env);

          spin?.stop(
            `Stripe configured — Growth: ${result.growthPriceId}  Agency: ${result.agencyPriceId}`,
          );
          if (ci) {
            console.log(
              `[setup] Stripe → Growth: ${result.growthPriceId}, Agency: ${result.agencyPriceId}`,
            );
          }

          if (!webhookUrl) {
            log(
              ci,
              "No webhook URL provided. For local dev run: stripe listen --forward-to localhost:3000/api/webhooks/stripe",
            );
          }
        } catch (err) {
          spin?.stop("Stripe setup failed");
          logError(ci, err instanceof Error ? err.message : String(err));
        }
      }
    }

    // ── Clerk webhook ──────────────────────────────────────────────────────
    if (!opts.skipClerk) {
      const clerkKey = env.CLERK_SECRET_KEY ?? process.env.CLERK_SECRET_KEY;
      if (!clerkKey) {
        warn(ci, "CLERK_SECRET_KEY not set — skipping Clerk webhook setup.");
      } else {
        let appUrl: string | undefined;

        if (!ci) {
          const input = await clack.text({
            message: "App URL for Clerk webhook:",
            placeholder: "https://yourdomain.com",
          });
          if (!clack.isCancel(input)) appUrl = input as string;
        } else {
          appUrl = opts.appUrl;
        }

        if (!appUrl) {
          warn(ci, "No app URL — skipping Clerk webhook setup.");
        } else {
          const { setupClerkWebhook } = await import("./modules/clerk.js");
          const spin = ci ? null : clack.spinner();
          spin?.start("Registering Clerk webhook");

          try {
            const result = await setupClerkWebhook({
              secretKey: clerkKey,
              endpointUrl: `${appUrl}/api/webhooks/clerk`,
            });
            env = mergeEnv(env, {
              CLERK_WEBHOOK_SECRET: result.signingSecret,
            });
            writeEnv(env);
            spin?.stop("Clerk webhook registered");
            if (ci) console.log("[setup] Clerk webhook registered");
          } catch (err) {
            spin?.stop("Clerk webhook setup failed");
            logError(ci, err instanceof Error ? err.message : String(err));
          }
        }
      }
    }

    // ── Resend domain ──────────────────────────────────────────────────────
    if (!opts.skipResend) {
      const resendKey = env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
      if (!resendKey) {
        warn(ci, "RESEND_API_KEY not set — skipping Resend domain setup.");
      } else {
        let domain: string | undefined;

        if (!ci) {
          const input = await clack.text({
            message: "Your sending domain for Resend (e.g. yourdomain.com):",
            placeholder: "yourdomain.com",
          });
          if (!clack.isCancel(input) && input) domain = input as string;
        }

        if (!domain) {
          log(
            ci,
            "No domain provided — skipping Resend. Emails will use onboarding@resend.dev until you set up a domain.",
          );
        } else {
          const { setupResendDomain, formatDnsRecords } =
            await import("./modules/resend.js");
          const spin = ci ? null : clack.spinner();
          spin?.start(`Registering ${domain} with Resend`);

          try {
            const result = await setupResendDomain({
              apiKey: resendKey,
              domain,
            });
            spin?.stop(`Domain registered (id: ${result.domainId})`);
            log(
              ci,
              `Add these DNS records to verify ${domain}:\n${formatDnsRecords(result.dnsRecords)}`,
            );
          } catch (err) {
            spin?.stop("Resend domain setup failed");
            logError(ci, err instanceof Error ? err.message : String(err));
          }
        }
      }
    }

    // ── Branding ───────────────────────────────────────────────────────────
    if (!opts.skipBranding) {
      let brandName: string | undefined = opts.brandName as string | undefined;

      if (!brandName && !ci) {
        const input = await clack.text({
          message:
            "Product brand name (replaces 'TherapyContent' in marketing pages):",
          placeholder: "MyProduct",
        });
        if (!clack.isCancel(input) && input) brandName = input as string;
      }

      if (!brandName) {
        log(ci, "No brand name — skipping branding replacement.");
      } else {
        let replaced = 0;
        for (const relPath of BRANDING_FILES) {
          const filePath = resolve(process.cwd(), relPath);
          if (!existsSync(filePath)) continue;
          const original = readFileSync(filePath, "utf-8");
          const count = findBrandingOccurrences(original);
          if (count > 0) {
            writeFileSync(
              filePath,
              replaceBranding(original, brandName),
              "utf-8",
            );
            replaced += count;
          }
        }
        const msg = `Replaced ${replaced} occurrence(s) of 'TherapyContent' with '${brandName}'`;
        if (ci) console.log("[setup]", msg);
        else clack.log.success(msg);
      }
    }

    // ── Done ───────────────────────────────────────────────────────────────
    if (!ci) {
      clack.outro(
        "Setup complete. Review apps/web/.env.local and fill in any remaining placeholders.",
      );
    } else {
      console.log("[setup] Done.");
    }
  });

program.parseAsync(process.argv);
