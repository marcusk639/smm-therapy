import { describe, it, expect, vi } from "vitest";

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { runComplianceCritic } from "../../../packages/compliance/src/critic";
import type { ComplianceRule } from "../../../packages/compliance/src/schema";

const MOCK_RULE: ComplianceRule = {
  id: "00000000-0000-0000-0000-000000000001",
  ruleText: "Content that guarantees specific outcomes violates this standard.",
  ruleType: "prohibition",
  credentialTypes: ["LCSW"],
  states: [],
  sourceCitation: "APA Ethics Code 5.01(b)",
  version: "1.0",
};

describe("runComplianceCritic", () => {
  it("returns no violations when approve_content is called", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          name: "approve_content",
          input: { reasoning: "Content is compliant" },
        },
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 80,
        cache_creation_input_tokens: 0,
      },
    });

    const result = await runComplianceCritic(
      "Therapy can help you manage anxiety.",
      [MOCK_RULE],
    );
    expect(result.violations).toHaveLength(0);
    expect(result.approved).toBe(true);
  });

  it("returns violations when flag_violation is called", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          name: "flag_violation",
          input: {
            rule_id: MOCK_RULE.id,
            offending_excerpt: "I can cure your anxiety",
            explanation: "Treatment guarantee violates APA 5.01(b)",
            severity: "critical",
          },
        },
        {
          type: "tool_use",
          name: "approve_content",
          input: { reasoning: "All violations flagged" },
        },
      ],
      usage: {
        input_tokens: 150,
        output_tokens: 50,
        cache_read_input_tokens: 120,
        cache_creation_input_tokens: 0,
      },
    });

    const result = await runComplianceCritic(
      "I can cure your anxiety in 5 sessions.",
      [MOCK_RULE],
    );
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.ruleId).toBe(MOCK_RULE.id);
    expect(result.violations[0]!.severity).toBe("critical");
    expect(result.approved).toBe(false);
  });

  it("returns approved=true with no rules", async () => {
    const result = await runComplianceCritic("Any content", []);
    expect(result.violations).toHaveLength(0);
    expect(result.approved).toBe(true);
  });
});
