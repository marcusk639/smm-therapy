import type { NewComplianceRule } from "@smm/db";

export const TX_RULES: Omit<NewComplianceRule, "id">[] = [
  {
    ruleText:
      "Texas State Board of Examiners of Professional Counselors: licensees must not make materially false statements in advertising. Content implying specific outcome guarantees is prohibited.",
    ruleType: "prohibition",
    credentialTypes: ["LCSW", "LMFT", "LPC"],
    states: ["TX"],
    sourceCitation: "22 TAC §681.42 — Prohibited Practices",
    version: "1.0",
    active: true,
  },
];
