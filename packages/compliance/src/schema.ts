import { z } from "zod";

export const RuleTypeSchema = z.enum(["prohibition", "requirement", "warning"]);

export const CredentialTypeSchema = z.enum([
  "LCSW",
  "LMFT",
  "LPC",
  "PsyD",
  "PhD",
  "MD",
  "Other",
]);

export const ComplianceRuleSchema = z.object({
  id: z.string().uuid(),
  ruleText: z.string(),
  ruleType: RuleTypeSchema,
  credentialTypes: z.array(CredentialTypeSchema),
  states: z.array(z.string().length(2)),
  sourceCitation: z.string(),
  version: z.string(),
});

export const ViolationSchema = z.object({
  ruleId: z.string().uuid(),
  offendingExcerpt: z.string(),
  explanation: z.string(),
  severity: z.enum(["critical", "warning"]),
  ruleType: RuleTypeSchema,
  sourceCitation: z.string(),
});

export type ComplianceRule = z.infer<typeof ComplianceRuleSchema>;
export type Violation = z.infer<typeof ViolationSchema>;
