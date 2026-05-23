import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimitHits = pgTable("rate_limit_hits", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull(),
  hitAt: timestamp("hit_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RateLimitHit = typeof rateLimitHits.$inferSelect;
export type NewRateLimitHit = typeof rateLimitHits.$inferInsert;
