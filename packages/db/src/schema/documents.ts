import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { knowledgeBases } from "./knowledge-bases";

export const sourceTypeEnum = pgEnum("source_type", [
  "file_upload",
  "youtube_url",
  "podcast_rss",
  "google_drive",
  "web_url",
  "ig_posts",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "fetching",
  "parsing",
  "chunking",
  "embedding",
  "storing",
  "complete",
  "failed",
]);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  knowledgeBaseId: uuid("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  sourceType: sourceTypeEnum("source_type").notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
  r2Key: text("r2_key"),
  rawText: text("raw_text"),
  status: documentStatusEnum("status").notNull().default("pending"),
  failedStage: text("failed_stage"),
  failedReason: text("failed_reason"),
  rightsConfirmed: boolean("rights_confirmed").notNull().default(false),
  rightsConfirmedAt: timestamp("rights_confirmed_at", { withTimezone: true }),
  rightsConfirmedBy: text("rights_confirmed_by"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
