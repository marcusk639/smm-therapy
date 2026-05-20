import Anthropic from "@anthropic-ai/sdk";
import type { ComplianceRule, Violation } from "./schema";
import { COMPLIANCE_CRITIC_SYSTEM } from "@smm/ai/prompts/compliance-critic";
import { cachedTextBlock, extractUsage } from "@smm/ai/client";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type FlagViolationInput = {
  rule_id: string;
  offending_excerpt: string;
  explanation: string;
  severity: "critical" | "warning";
};

const CRITIC_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "flag_violation",
    description: "Flag a compliance violation found in the content",
    input_schema: {
      type: "object" as const,
      properties: {
        rule_id: {
          type: "string",
          description: "The ID of the rule being violated",
        },
        offending_excerpt: {
          type: "string",
          description: "The exact text from the content that violates the rule",
        },
        explanation: {
          type: "string",
          description: "Brief explanation of why this violates the rule",
        },
        severity: {
          type: "string",
          enum: ["critical", "warning"],
          description:
            "critical = must fix before publishing; warning = advisory",
        },
      },
      required: ["rule_id", "offending_excerpt", "explanation", "severity"],
    },
  },
  {
    name: "approve_content",
    description:
      "Call this after reviewing all rules to signal review is complete",
    input_schema: {
      type: "object" as const,
      properties: {
        reasoning: {
          type: "string",
          description: "Brief summary of why content is compliant",
        },
      },
      required: ["reasoning"],
    },
  },
];

export type CriticResult = {
  violations: Violation[];
  approved: boolean;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
};

export async function runComplianceCritic(
  content: string,
  rules: ComplianceRule[],
): Promise<CriticResult> {
  if (rules.length === 0) {
    return {
      violations: [],
      approved: true,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    };
  }

  const rulesText = rules
    .map(
      (r) =>
        `ID: ${r.id}\nType: ${r.ruleType}\nRule: ${r.ruleText}\nSource: ${r.sourceCitation}`,
    )
    .join("\n\n---\n\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: [cachedTextBlock(COMPLIANCE_CRITIC_SYSTEM)],
    tools: CRITIC_TOOLS,
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: `Review the following content for compliance violations.

APPLICABLE RULES:
${rulesText}

CONTENT TO REVIEW:
${content}

Call flag_violation for each violation, then call approve_content when done.`,
      },
    ],
  });

  const violations: Violation[] = [];

  for (const block of response.content) {
    if (block.type !== "tool_use") continue;

    if (block.name === "flag_violation") {
      const input = block.input as FlagViolationInput;
      const rule = rules.find((r) => r.id === input.rule_id);
      if (rule) {
        violations.push({
          ruleId: input.rule_id,
          offendingExcerpt: input.offending_excerpt,
          explanation: input.explanation,
          severity: input.severity,
          ruleType: rule.ruleType,
          sourceCitation: rule.sourceCitation,
        });
      }
    }
  }

  const usage = extractUsage(response);

  return {
    violations,
    approved: violations.length === 0,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
    },
  };
}
