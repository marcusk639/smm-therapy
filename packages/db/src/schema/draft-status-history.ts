import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { drafts } from "./drafts";
import { workspaces } from "./workspaces";

export const draftStatusHistory = pgTable("draft_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  changedBy: text("changed_by").notNull(),
  note: text("note"),
});

export type DraftStatusHistory = typeof draftStatusHistory.$inferSelect;
export type NewDraftStatusHistory = typeof draftStatusHistory.$inferInsert;
