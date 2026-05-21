import { pgTable, pgEnum, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { clients } from "./clients";

export const kbTypeEnum = pgEnum("kb_type", ["client", "shared_niche"]);

export const knowledgeBases = pgTable("knowledge_bases", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  clientId: uuid("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  kbType: kbTypeEnum("kb_type").notNull().default("client"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBases.$inferInsert;
