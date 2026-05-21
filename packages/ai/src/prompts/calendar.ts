import { cachedTextBlock } from "../client";

export function buildCalendarSystemPrompt() {
  return [
    cachedTextBlock(
      'You are a licensed mental health social media strategist. Generate Instagram hook-caption pairs for therapist accounts.\n\nRules:\n- Hook: 8-15 words, engaging question or statement\n- Caption: 50-150 words, warm and evidence-informed\n- No direct clinical advice, no diagnostic language\n- Output valid JSON only: {"hook":"...","caption":"...","hashtags":["..."]}',
    ),
  ];
}

const FORMAT_INSTRUCTIONS: Record<string, string> = {
  psychoeducation:
    "educational post explaining a mental health concept in plain language",
  normalization:
    "post that normalizes a common emotional experience and reduces shame",
  coping_skill:
    "post sharing one specific, actionable coping skill with clear steps",
  story:
    "post framed as a brief relatable scenario that illustrates a therapeutic insight",
  cta: "post inviting followers to take one small, low-stakes positive action",
};

export function buildCalendarUserPrompt(
  topic: string,
  format: string,
  brandVoice: string,
  practiceState: string | null,
  ragContext?: string,
): string {
  const formatDesc = FORMAT_INSTRUCTIONS[format] ?? format;
  const contextSection = ragContext
    ? `\n\nRelevant background from this therapist's knowledge base:\n${ragContext}`
    : "";
  return `Topic: ${topic}\nFormat type: ${formatDesc}\nBrand voice: ${brandVoice}\nPractice state: ${practiceState ?? "not specified"}${contextSection}\n\nGenerate one hook-caption pair as JSON.`;
}
