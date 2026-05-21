import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { clients } from "./clients";

export const calendarJobStatusEnum = pgEnum("calendar_job_status", [
  "pending",
  "running",
  "complete",
  "failed",
]);

export const calendarJobs = pgTable("calendar_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  topicAreas: text("topic_areas").array().notNull().default([]),
  postsPerWeek: integer("posts_per_week").notNull().default(5),
  status: calendarJobStatusEnum("status").notNull().default("pending"),
  draftCount: integer("draft_count").notNull().default(0),
  failedReason: text("failed_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type CalendarJob = typeof calendarJobs.$inferSelect;
export type NewCalendarJob = typeof calendarJobs.$inferInsert;
