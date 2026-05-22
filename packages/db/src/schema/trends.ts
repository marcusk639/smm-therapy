import {
  pgTable,
  uuid,
  text,
  real,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const trendTopics = pgTable("trend_topics", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  weekOf: date("week_of").notNull(),
  topic: text("topic").notNull(),
  summary: text("summary").notNull(),
  subredditSources: text("subreddit_sources").array().notNull().default([]),
  rssSources: text("rss_sources").array().notNull().default([]),
  relevanceScore: real("relevance_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TrendTopic = typeof trendTopics.$inferSelect;
export type NewTrendTopic = typeof trendTopics.$inferInsert;
