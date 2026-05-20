import { describe, it, expect } from "vitest";
import { APA_RULES } from "../../../packages/compliance/src/rules/apa";
import { CA_RULES } from "../../../packages/compliance/src/rules/states/ca";

describe("APA compliance rules", () => {
  it("has at least one rule", () => {
    expect(APA_RULES.length).toBeGreaterThan(0);
  });

  it("treatment guarantee rule exists", () => {
    const rule = APA_RULES.find((r) =>
      r.ruleText.toLowerCase().includes("guarantee"),
    );
    expect(rule).toBeDefined();
    expect(rule?.ruleType).toBe("prohibition");
  });

  it("all rules have required fields", () => {
    for (const rule of APA_RULES) {
      expect(rule.ruleText).toBeTruthy();
      expect(rule.ruleType).toMatch(/^(prohibition|requirement|warning)$/);
      expect(rule.sourceCitation).toBeTruthy();
      expect(typeof rule.version).toBe("string");
    }
  });
});

describe("CA state rules", () => {
  it("has at least one rule", () => {
    expect(CA_RULES.length).toBeGreaterThan(0);
  });

  it("all CA rules reference California", () => {
    for (const rule of CA_RULES) {
      expect(rule.states).toContain("CA");
    }
  });
});
