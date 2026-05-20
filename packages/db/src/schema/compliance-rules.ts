import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const ruleTypeEnum = pgEnum("rule_type", [
  "prohibition",
  "requirement",
  "warning",
]);

export const complianceRules = pgTable("compliance_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  ruleText: text("rule_text").notNull(),
  ruleType: ruleTypeEnum("rule_type").notNull(),
  credentialTypes: jsonb("credential_types")
    .notNull()
    .default(sql`'[]'::jsonb`),
  states: jsonb("states")
    .notNull()
    .default(sql`'[]'::jsonb`),
  sourceCitation: text("source_citation").notNull(),
  effectiveDate: timestamp("effective_date", { withTimezone: true }),
  version: text("version").notNull().default("1.0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const crisisResources = pgTable("crisis_resources", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicKey: text("topic_key").notNull().unique(),
  resourceText: text("resource_text").notNull(),
  hotline: text("hotline"),
  url: text("url"),
  active: boolean("active").notNull().default(true),
});

export type ComplianceRule = typeof complianceRules.$inferSelect;
export type CrisisResource = typeof crisisResources.$inferSelect;
