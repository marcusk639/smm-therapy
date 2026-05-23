import { inngest } from "../client";
import { db } from "@smm/db/client";
import { instagramTokens } from "@smm/db/schema";
import { eq, isNull, lt, or, sql } from "drizzle-orm";
import { decrypt, encrypt } from "@smm/crypto";

interface RefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export const igTokenRefresh = inngest.createFunction(
  { id: "ig-token-refresh", retries: 2 },
  { cron: "0 0 * * *" },
  async ({ step }) => {
    const expiringTokens = await step.run("find-expiring-tokens", () =>
      db
        .select()
        .from(instagramTokens)
        .where(
          or(
            isNull(instagramTokens.expiresAt),
            lt(instagramTokens.expiresAt, sql`now() + interval '10 days'`),
          ),
        ),
    );

    if (expiringTokens.length === 0) return { refreshed: 0, skipped: 0 };

    let refreshed = 0;
    let skipped = 0;

    for (const row of expiringTokens) {
      const result = await step.run(`refresh-token-${row.id}`, async () => {
        const decryptedToken = decrypt(
          row.encryptedToken,
          process.env.INSTAGRAM_TOKEN_KEY!,
        );

        const res = await fetch(
          `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=ig_refresh_token&access_token=${decryptedToken}`,
        );

        if (!res.ok) {
          throw new Error(
            `Token refresh failed for ${row.id}: ${res.status} ${res.statusText}`,
          );
        }

        const data = (await res.json()) as RefreshResponse;
        const encryptedToken = encrypt(
          data.access_token,
          process.env.INSTAGRAM_TOKEN_KEY!,
        );
        const expiresAt = new Date(Date.now() + data.expires_in * 1000);

        await db
          .update(instagramTokens)
          .set({ encryptedToken, expiresAt })
          .where(eq(instagramTokens.id, row.id));

        return { ok: true };
      });

      if (result.ok) {
        refreshed += 1;
      } else {
        skipped += 1;
      }
    }

    return { refreshed, skipped };
  },
);
