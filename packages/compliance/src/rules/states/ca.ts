import type { NewComplianceRule } from "@smm/db";

export const CA_RULES: Omit<NewComplianceRule, "id">[] = [
  {
    ruleText:
      "California BBS licensees must not make any false, fraudulent, deceptive, or misleading statement in advertising professional services. This includes claims about the effectiveness of specific therapeutic modalities that lack scientific consensus.",
    ruleType: "prohibition",
    credentialTypes: ["LCSW", "LMFT", "LPC"],
    states: ["CA"],
    sourceCitation:
      "California Business and Professions Code §4982(h) — Advertising Standards",
    version: "1.0",
    active: true,
  },
  {
    ruleText:
      "California BBS licensees may not use a title, description of services, or statement that is likely to mislead the public about their qualifications or the nature of services offered.",
    ruleType: "prohibition",
    credentialTypes: ["LCSW", "LMFT", "LPC"],
    states: ["CA"],
    sourceCitation: "California Business and Professions Code §4982(k)",
    version: "1.0",
    active: true,
  },
];
