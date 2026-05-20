import type { NewComplianceRule } from "@smm/db";

export const NY_RULES: Omit<NewComplianceRule, "id">[] = [
  {
    ruleText:
      "New York licensed mental health counselors and psychotherapists must not make false, deceptive, or misleading representations regarding the nature of their professional services or their effectiveness.",
    ruleType: "prohibition",
    credentialTypes: ["LCSW", "LMFT", "LPC"],
    states: ["NY"],
    sourceCitation:
      "NY Education Law §7606 + 8 NYCRR §52.27 — Professional Conduct",
    version: "1.0",
    active: true,
  },
];
