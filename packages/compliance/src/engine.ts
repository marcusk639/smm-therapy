import { db } from "@smm/db/client";
import { complianceRules } from "@smm/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { ComplianceRule } from "./schema";
import { runComplianceCritic as runCritic } from "./critic";
import type { CriticResult } from "./critic";

export type ClientContext = {
  state: string;
  credential: string;
};

export async function getRulesForClient(
  ctx: ClientContext,
): Promise<ComplianceRule[]> {
  const rows = await db
    .select()
    .from(complianceRules)
    .where(
      and(
        eq(complianceRules.active, true),
        sql`(
          ${complianceRules.states} = '[]'::jsonb
          OR ${complianceRules.states} @> ${JSON.stringify([ctx.state])}::jsonb
        )`,
        sql`(
          ${complianceRules.credentialTypes} = '[]'::jsonb
          OR ${complianceRules.credentialTypes} @> ${JSON.stringify([ctx.credential])}::jsonb
        )`,
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    ruleText: r.ruleText,
    ruleType: r.ruleType as ComplianceRule["ruleType"],
    credentialTypes: r.credentialTypes as ComplianceRule["credentialTypes"],
    states: r.states as string[],
    sourceCitation: r.sourceCitation,
    version: r.version,
  }));
}

export async function runComplianceCritic(
  content: string,
  rules: ComplianceRule[],
): Promise<CriticResult> {
  return runCritic(content, rules);
}
