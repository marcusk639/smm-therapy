import type { NewComplianceRule } from "@smm/db";

export const IL_RULES: Omit<NewComplianceRule, "id">[] = [
  {
    ruleText:
      "Illinois licensed clinical social workers and licensed social workers must not make materially false statements or mislead the public in advertising their services.",
    ruleType: "prohibition",
    credentialTypes: ["LCSW", "LMFT", "LPC"],
    states: ["IL"],
    sourceCitation: "225 ILCS 20/20 — Social Work Practice Act",
    version: "1.0",
    active: true,
  },
];
