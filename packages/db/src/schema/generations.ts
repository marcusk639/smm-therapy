import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { clients } from "./clients";

export const generationTypeEnum = pgEnum("generation_type", [
  "hooks",
  "captions",
  "calendar",
  "repurpose",
]);

export const generationAudit = pgTable("generation_audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  generationType: generationTypeEnum("generation_type").notNull(),
  contentHash: text("content_hash").notNull(),
  rulesVersion: text("rules_version").notNull(),
  violationsFlagged: jsonb("violations_flagged")
    .notNull()
    .$default(() => []),
  approved: boolean("approved").notNull(),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type GenerationAudit = typeof generationAudit.$inferSelect;
export type NewGenerationAudit = typeof generationAudit.$inferInsert;
