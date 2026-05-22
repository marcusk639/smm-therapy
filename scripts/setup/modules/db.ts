import { execSync } from "child_process";

export interface DbResult {
  success: boolean;
  error?: string;
}

export function runMigrations(cwd: string = process.cwd()): DbResult {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return {
      success: false,
      error:
        "DATABASE_URL is not set. Add it to apps/web/.env.local or export it in your shell.",
    };
  }

  try {
    execSync("pnpm --filter @smm/db migrate", {
      cwd,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
