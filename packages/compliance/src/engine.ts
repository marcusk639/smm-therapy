import type { ComplianceRule, Violation } from "./schema";

export type ClientContext = {
  state: string;
  credential: string;
};

/**
 * Returns the compliance rules applicable to a given client context.
 * Phase 1 will populate this with real rules from the DB.
 */
export async function getRulesForClient(
  _ctx: ClientContext,
): Promise<ComplianceRule[]> {
  return [];
}

/**
 * Runs the compliance critic against generated content.
 * Phase 1 will implement this with the Claude Agent SDK tool-use loop.
 */
export async function runComplianceCritic(
  _content: string,
  _rules: ComplianceRule[],
): Promise<{ violations: Violation[]; approved: boolean }> {
  return { violations: [], approved: true };
}
