import type { NewComplianceRule } from "@smm/db";

export const APA_RULES: Omit<NewComplianceRule, "id">[] = [
  {
    ruleText:
      "Psychologists do not make false, deceptive, or fraudulent statements concerning the results or degree of success of their services. Content that guarantees specific outcomes (e.g., 'I can cure your anxiety', 'eliminate your depression', '100% success rate', 'guaranteed results') violates this standard.",
    ruleType: "prohibition",
    credentialTypes: ["LCSW", "LMFT", "LPC", "PsyD", "PhD", "MD", "Other"],
    states: [],
    sourceCitation:
      "APA Ethics Code 5.01(b) — Avoidance of False or Deceptive Statements",
    version: "1.0",
    active: true,
  },
  {
    ruleText:
      "Psychologists do not make public statements that are false, deceptive, or fraudulent. This includes misleading implications about the nature, scope, or expected results of psychological services.",
    ruleType: "prohibition",
    credentialTypes: ["LCSW", "LMFT", "LPC", "PsyD", "PhD", "MD", "Other"],
    states: [],
    sourceCitation:
      "APA Ethics Code 5.01(a) — Avoidance of False or Deceptive Statements",
    version: "1.0",
    active: true,
  },
  {
    ruleText:
      "Psychologists do not solicit testimonials from current therapy clients or patients or other persons who because of their particular circumstances are vulnerable to undue influence.",
    ruleType: "prohibition",
    credentialTypes: ["LCSW", "LMFT", "LPC", "PsyD", "PhD", "MD", "Other"],
    states: [],
    sourceCitation: "APA Ethics Code 5.05 — Testimonials",
    version: "1.0",
    active: true,
  },
  {
    ruleText:
      "Psychologists do not engage in uninvited in-person solicitation of business from actual or potential therapy clients or patients or other persons who because of their particular circumstances are vulnerable to undue influence.",
    ruleType: "prohibition",
    credentialTypes: ["LCSW", "LMFT", "LPC", "PsyD", "PhD", "MD", "Other"],
    states: [],
    sourceCitation: "APA Ethics Code 5.06 — In-Person Solicitation",
    version: "1.0",
    active: true,
  },
  {
    ruleText:
      "When advertising services, psychologists must accurately represent their professional credentials, training, and competencies. Claiming expertise in areas outside one's training constitutes a false statement.",
    ruleType: "requirement",
    credentialTypes: ["LCSW", "LMFT", "LPC", "PsyD", "PhD", "MD", "Other"],
    states: [],
    sourceCitation: "APA Ethics Code 5.01 + 2.01 — Competence",
    version: "1.0",
    active: true,
  },
];
