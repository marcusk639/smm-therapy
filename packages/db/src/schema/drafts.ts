import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { clients } from "./clients";
import { generationAudit } from "./generations";

export const draftStatusEnum = pgEnum("draft_status", [
  "draft",
  "ready_for_client",
  "client_reviewing",
  "approved",
  "changes_requested",
  "scheduled",
  "published",
]);

export const draftFormatEnum = pgEnum("draft_format", [
  "psychoeducation",
  "normalization",
  "coping_skill",
  "story",
  "cta",
]);

export const drafts = pgTable("drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  hook: text("hook").notNull(),
  caption: text("caption").notNull(),
  hashtags: text("hashtags").array().notNull().default([]),
  format: draftFormatEnum("format"),
  status: draftStatusEnum("status").notNull().default("draft"),
  complianceApproved: boolean("compliance_approved").notNull().default(false),
  requiresCrisisResources: boolean("requires_crisis_resources")
    .notNull()
    .default(false),
  generationAuditId: uuid("generation_audit_id").references(
    () => generationAudit.id,
  ),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Draft = typeof drafts.$inferSelect;
export type NewDraft = typeof drafts.$inferInsert;
