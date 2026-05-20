import type { NewComplianceRule } from "@smm/db";

export const FL_RULES: Omit<NewComplianceRule, "id">[] = [
  {
    ruleText:
      "Florida licensed clinical social workers, marriage and family therapists, and mental health counselors may not advertise in a manner that is false, deceptive, or misleading to the public.",
    ruleType: "prohibition",
    credentialTypes: ["LCSW", "LMFT", "LPC"],
    states: ["FL"],
    sourceCitation: "Florida Statutes §491.009(1)(l) — Grounds for Discipline",
    version: "1.0",
    active: true,
  },
];
