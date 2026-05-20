import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const llmUsageLog = pgTable("llm_usage_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  callType: text("call_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type LlmUsageLog = typeof llmUsageLog.$inferSelect;
export type NewLlmUsageLog = typeof llmUsageLog.$inferInsert;
