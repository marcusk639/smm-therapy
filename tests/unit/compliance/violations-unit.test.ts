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
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  ruleText: "Content that guarantees specific outcomes is prohibited.",
  ruleType: "prohibition",
  credentialTypes: ["LCSW", "LMFT", "LPC"],
  states: [],
  sourceCitation: "APA Ethics Code 5.01(b)",
  version: "1.0",
};

type MockBlock =
  | { type: "tool_use"; name: string; input: Record<string, unknown> }
  | { type: "text"; text: string };

function mockResponse(blocks: MockBlock[]) {
  return {
    content: blocks,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 80,
      cache_creation_input_tokens: 0,
    },
  };
}

const VIOLATION_CASES: Array<{
  label: string;
  content: string;
  mockSeverity?: "critical" | "warning";
}> = [
  // Treatment guarantee violations (critical)
  {
    label: "direct cure claim",
    content: "I can cure your anxiety.",
    mockSeverity: "critical",
  },
  {
    label: "100% success rate",
    content: "My therapy has a 100% success rate.",
    mockSeverity: "critical",
  },
  {
    label: "eliminate depression",
    content: "We will eliminate your depression for good.",
    mockSeverity: "critical",
  },
  {
    label: "guaranteed results",
    content: "Guaranteed results within 6 sessions.",
    mockSeverity: "critical",
  },
  {
    label: "permanent anxiety removal",
    content: "Remove anxiety permanently with my program.",
    mockSeverity: "critical",
  },
  {
    label: "fix your trauma",
    content: "I can fix your trauma completely.",
    mockSeverity: "critical",
  },
  {
    label: "fast depression cure",
    content: "Depression? I can have you feeling 100% in a month.",
    mockSeverity: "critical",
  },
  // Warning-level violations
  {
    label: "comparing to other practitioners",
    content: "Unlike other therapists, I actually get results.",
    mockSeverity: "warning",
  },
  {
    label: "implying failure elsewhere",
    content: "Other treatments failed? Mine won't.",
    mockSeverity: "warning",
  },
];

const CLEAN_CASES: Array<{ label: string; content: string }> = [
  {
    label: "therapy can help",
    content: "Therapy can help you manage anxiety.",
  },
  {
    label: "evidence-based CBT",
    content: "Evidence-based CBT techniques for depression.",
  },
  {
    label: "many people find therapy helpful",
    content: "Many people find therapy helpful for managing stress.",
  },
  {
    label: "anxiety education",
    content: "Anxiety affects 40 million adults in the US.",
  },
  {
    label: "coping skills post",
    content: "Here are 5 grounding techniques for moments of overwhelm.",
  },
  {
    label: "normalizing struggles",
    content: "Feeling burned out is more common than you might think.",
  },
  {
    label: "seeking help is brave",
    content: "Reaching out for support takes real courage.",
  },
  {
    label: "therapy description",
    content:
      "In therapy, we work together to understand patterns and build new ones.",
  },
  {
    label: "general wellness",
    content:
      "Taking care of your mental health is just as important as physical health.",
  },
  {
    label: "resources available",
    content: "There are resources available if you're struggling.",
  },
  {
    label: "professional confidence",
    content: "I'm passionate about helping people navigate anxiety.",
  },
];

describe("Compliance critic — violation cases (mocked)", () => {
  for (const tc of VIOLATION_CASES) {
    it(`flags: ${tc.label}`, async () => {
      mockCreate.mockResolvedValueOnce(
        mockResponse([
          {
            type: "tool_use",
            name: "flag_violation",
            input: {
              rule_id: MOCK_RULE.id,
              offending_excerpt: tc.content.slice(0, 50),
              explanation: "Treatment guarantee",
              severity: tc.mockSeverity ?? "critical",
            },
          },
          {
            type: "tool_use",
            name: "approve_content",
            input: { reasoning: "All violations flagged" },
          },
        ]),
      );

      const result = await runComplianceCritic(tc.content, [MOCK_RULE]);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.approved).toBe(false);
    });
  }
});

describe("Compliance critic — clean cases (mocked)", () => {
  for (const tc of CLEAN_CASES) {
    it(`does NOT flag: ${tc.label}`, async () => {
      mockCreate.mockResolvedValueOnce(
        mockResponse([
          {
            type: "tool_use",
            name: "approve_content",
            input: { reasoning: "Content is compliant" },
          },
        ]),
      );

      const result = await runComplianceCritic(tc.content, [MOCK_RULE]);
      expect(result.violations).toHaveLength(0);
      expect(result.approved).toBe(true);
    });
  }
});
