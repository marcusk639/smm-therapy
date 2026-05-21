import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  customType,
  vector,
} from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { knowledgeBases } from "./knowledge-bases";
import { clients } from "./clients";
import { workspaces } from "./workspaces";

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

export const chunks = pgTable("chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  knowledgeBaseId: uuid("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  // NULL for shared-niche chunks; set for client-specific chunks
  clientId: uuid("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  // NULL for shared-niche chunks; set for client-specific chunks
  workspaceId: uuid("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1024 }).notNull(),
  // Computed at insert time: sql`to_tsvector('english', ${content})`
  tsv: tsvector("tsv").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  tokenCount: integer("token_count").notNull(),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
