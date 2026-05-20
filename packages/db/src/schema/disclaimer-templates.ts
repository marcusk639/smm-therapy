import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const disclaimerContentTypeEnum = pgEnum("disclaimer_content_type", [
  "psychoeducation",
  "normalization",
  "coping_skill",
  "story",
  "cta",
  "default",
]);

export const disclaimerTemplates = pgTable("disclaimer_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  contentType: disclaimerContentTypeEnum("content_type").notNull(),
  state: text("state"),
  disclaimerText: text("disclaimer_text").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DisclaimerTemplate = typeof disclaimerTemplates.$inferSelect;
