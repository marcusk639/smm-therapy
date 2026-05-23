import { cachedTextBlock } from "../client";
import {
  AWARENESS_CALENDAR,
  type AwarenessEvent,
} from "../templates/awareness-calendar";

export { type AwarenessEvent } from "../templates/awareness-calendar";

export function getAwarenessEventsForPeriod(
  startDate: string,
  endDate: string,
): AwarenessEvent[] {
  const start = new Date(startDate);
  const end = new Date(endDate);

  return AWARENESS_CALENDAR.filter((event) => {
    if (event.day === undefined) {
      const eventMonthStart = new Date(start.getFullYear(), event.month - 1, 1);
      const eventMonthEnd = new Date(start.getFullYear(), event.month, 0);
      return eventMonthStart <= end && eventMonthEnd >= start;
    }

    const eventStart = new Date(
      start.getFullYear(),
      event.month - 1,
      event.day,
    );
    const eventEnd = new Date(
      start.getFullYear(),
      event.month - 1,
      event.endDay ?? event.day,
    );
    return eventStart <= end && eventEnd >= start;
  });
}

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
  awarenessEvents?: AwarenessEvent[],
): string {
  const formatDesc = FORMAT_INSTRUCTIONS[format] ?? format;
  const contextSection = ragContext
    ? `\n\nRelevant background from this therapist's knowledge base:\n${ragContext}`
    : "";
  const awarenessSection =
    awarenessEvents && awarenessEvents.length > 0
      ? `\n\nMental health awareness events active during this content period:\n${awarenessEvents
          .map(
            (e) =>
              `- ${e.name}: suggested angles: ${e.contentAngles.slice(0, 2).join("; ")}`,
          )
          .join(
            "\n",
          )}\n\nIf the topic aligns with any of these events, weave in the awareness context naturally.`
      : "";
  return `Topic: ${topic}\nFormat type: ${formatDesc}\nBrand voice: ${brandVoice}\nPractice state: ${practiceState ?? "not specified"}${contextSection}${awarenessSection}\n\nGenerate one hook-caption pair as JSON.`;
}
