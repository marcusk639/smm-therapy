import Anthropic from "@anthropic-ai/sdk";
import { anthropic, extractUsage } from "../client";

export type VoiceCriticResult = {
  score: number;
  passed: boolean;
  feedback: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
};

const tool: Anthropic.Tool = {
  name: "record_voice_assessment",
  description:
    "Record a voice consistency assessment for a social media caption.",
  input_schema: {
    type: "object" as const,
    properties: {
      score: {
        type: "number",
        description:
          "Voice consistency score 1–10 (1 = totally off-brand, 10 = perfect match).",
      },
      passed: {
        type: "boolean",
        description: "True when score >= 7.",
      },
      feedback: {
        type: "string",
        description:
          "One sentence of actionable feedback when score < 7, or an affirmation when >= 7.",
      },
    },
    required: ["score", "passed", "feedback"],
  },
};

export function buildVoiceCriticPrompt(
  caption: string,
  brandVoiceProfile: string,
): string {
  return `Brand voice profile:\n${brandVoiceProfile}\n\nCaption to evaluate:\n${caption}\n\nScore this caption's alignment with the brand voice using the record_voice_assessment tool.`;
}

export async function runVoiceCritic(
  caption: string,
  brandVoiceProfile: string,
): Promise<VoiceCriticResult> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    tools: [tool],
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: buildVoiceCriticPrompt(caption, brandVoiceProfile),
      },
    ],
  });

  const usage = extractUsage(response);
  const toolUse = response.content.find((b) => b.type === "tool_use");

  if (!toolUse || toolUse.type !== "tool_use") {
    return {
      score: 5,
      passed: false,
      feedback: "Assessment unavailable.",
      usage,
    };
  }

  const input = toolUse.input as {
    score: number;
    passed: boolean;
    feedback: string;
  };
  return {
    score: input.score,
    passed: input.passed,
    feedback: input.feedback,
    usage,
  };
}
