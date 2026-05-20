import { cachedTextBlock } from "../client";
import type { NicheExamples } from "../templates/niche-examples";
import type { CachedTextBlock, TextBlock } from "../client";

const HOOK_SYSTEM_BASE = `You are an expert social media content strategist specializing in mental health practices. You create Instagram hook lines for licensed practitioners that:
- Stop the scroll while remaining authentic and educational
- Never sensationalize mental health conditions
- Use evidence-based framing appropriate for a licensed professional's brand
- Avoid treatment guarantees or misleading clinical claims
- Are written from the practitioner's professional voice

A "hook" is the first 1-2 lines of an Instagram caption that compels the reader to tap "more."`;

export function buildHookSystemPrompt(
  examples: NicheExamples,
): Array<CachedTextBlock | TextBlock> {
  return [
    cachedTextBlock(
      HOOK_SYSTEM_BASE +
        "\n\n## Proven Hook Patterns for Mental Health Content\n\n" +
        examples.hookPatterns.map((p, i) => `${i + 1}. ${p}`).join("\n") +
        "\n\n## High-Performing Example Hooks\n\n" +
        examples.exampleHooks.map((h) => `- "${h}"`).join("\n"),
    ),
  ];
}

export function buildHookUserPrompt(
  topic: string,
  brandVoiceContext: string,
): string {
  return `Generate 15 Instagram hook lines for a mental health practitioner on the topic: "${topic}"

Brand voice context:
${brandVoiceContext}

Requirements:
- Mix hook types: question, statistic, bold statement, relatable scenario, list preview
- Each hook must be under 25 words
- Avoid overused phrases: "you're not alone", "it's okay to not be okay", "mental health matters"
- Do not include treatment guarantees or unverifiable medical claims
- Return JSON only: { "hooks": string[] }`;
}

export function buildCaptionUserPrompt(
  topic: string,
  selectedHook: string,
  format:
    | "psychoeducation"
    | "normalization"
    | "coping_skill"
    | "story"
    | "cta",
  brandVoiceContext: string,
  clientState: string | null,
): string {
  const FORMAT_DESCRIPTIONS: Record<typeof format, string> = {
    psychoeducation:
      "Educational. Structure: hook → concept explanation → why it matters → actionable insight → CTA",
    normalization:
      "Validates experience. Structure: hook → 'many people feel...' → normalizing frame → reassurance → gentle CTA",
    coping_skill:
      "Teaches technique. Structure: hook → skill name → 3-5 steps → when to use it → CTA",
    story:
      "Brief narrative. Structure: hook → story setup → pivot/insight → takeaway → CTA",
    cta: "Direct action. Structure: hook → context → specific call to action → value proposition",
  };

  return `Write an Instagram caption for topic: "${topic}"
Opening hook (use this verbatim as the first line): "${selectedHook}"
Format: ${format} — ${FORMAT_DESCRIPTIONS[format]}
Brand voice: ${brandVoiceContext}
Practitioner state: ${clientState ?? "not specified"}

Keep caption 150–300 words. Write from the practitioner's professional voice.
Return JSON only: { "caption": string, "hashtags": string[] }`;
}
