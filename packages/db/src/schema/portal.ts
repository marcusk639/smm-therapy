import { pgTable, pgEnum, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { clients } from "./clients";
import { drafts } from "./drafts";

export const authorTypeEnum = pgEnum("portal_author_type", [
  "workspace",
  "client",
]);

export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const draftComments = pgTable("draft_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  authorType: authorTypeEnum("author_type").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  parentId: uuid("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type DraftComment = typeof draftComments.$inferSelect;
