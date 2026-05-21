import { anthropic, extractUsage } from "../client";

export type RepurposeResult = {
  hook: string;
  caption: string;
  hashtags: string[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
};

const FORMAT_DESCRIPTIONS: Record<string, string> = {
  psychoeducation:
    "educational post explaining a mental health concept in plain language",
  normalization:
    "post that normalizes a common emotional experience and reduces shame",
  coping_skill:
    "post sharing one specific, actionable coping skill with clear numbered steps",
  story:
    "brief relatable scenario (not a real client story) that illustrates a therapeutic insight",
  cta: "post inviting followers to take one small, low-stakes positive action",
};

export function buildRepurposePrompt(
  hook: string,
  caption: string,
  targetFormat: string,
): string {
  const description = FORMAT_DESCRIPTIONS[targetFormat] ?? targetFormat;
  return `Original hook: ${hook}\nOriginal caption: ${caption}\n\nRewrite this as a ${description}. Preserve the core topic but change the angle and structure to match the format. Output JSON only:\n{"hook":"...","caption":"...","hashtags":["..."]}`;
}

export async function repurposeDraft(
  hook: string,
  caption: string,
  targetFormat: string,
): Promise<RepurposeResult> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: buildRepurposePrompt(hook, caption, targetFormat),
      },
    ],
  });

  const usage = extractUsage(response);
  const rawText =
    response.content[0]?.type === "text" ? response.content[0].text : "{}";

  try {
    const parsed = JSON.parse(rawText) as {
      hook?: string;
      caption?: string;
      hashtags?: string[];
    };
    return {
      hook: parsed.hook ?? hook,
      caption: parsed.caption ?? caption,
      hashtags: parsed.hashtags ?? [],
      usage,
    };
  } catch {
    return { hook, caption, hashtags: [], usage };
  }
}
