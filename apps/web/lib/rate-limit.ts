import { db } from "@smm/db/client";
import { rateLimitHits } from "@smm/db/schema";
import { eq, lt, and, count, gte } from "drizzle-orm";

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date(Date.now() - windowMs);

  await db
    .delete(rateLimitHits)
    .where(
      and(eq(rateLimitHits.key, key), lt(rateLimitHits.hitAt, windowStart)),
    );

  const [{ value: recentCount }] = await db
    .select({ value: count() })
    .from(rateLimitHits)
    .where(
      and(eq(rateLimitHits.key, key), gte(rateLimitHits.hitAt, windowStart)),
    );

  if (recentCount >= limit) {
    return { allowed: false, remaining: 0 };
  }

  await db.insert(rateLimitHits).values({ key });

  return { allowed: true, remaining: limit - recentCount - 1 };
}
