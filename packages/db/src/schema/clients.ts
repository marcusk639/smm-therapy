import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  practiceState: text("practice_state"),
  primaryCredential: text("primary_credential", {
    enum: ["LCSW", "LMFT", "LPC", "PsyD", "PhD", "MD", "Other"],
  }),
  instagramHandle: text("instagram_handle"),
  metadata: jsonb("metadata").default("{}"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
