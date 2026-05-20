import { cachedTextBlock } from "../client";
import type { CachedTextBlock } from "../client";

export function buildBrandVoiceSystemPrompt(): Array<CachedTextBlock> {
  return [
    cachedTextBlock(
      `You are an expert brand voice analyst specializing in mental health content.
Analyze sample Instagram posts and extract a structured voice profile.

The profile captures: tone (1=very casual, 10=very clinical), vocabulary complexity, disclosure level,
structural preferences, phrases to avoid, and characteristic phrases that define the voice.`,
    ),
  ];
}

export function buildBrandVoiceUserPrompt(samplePosts: string[]): string {
  const numbered = samplePosts
    .map((p, i) => `Post ${i + 1}:\n${p}`)
    .join("\n\n---\n\n");

  return `Analyze these sample Instagram posts and extract a brand voice profile.

${numbered}

Return JSON only:
{
  "tone": number (1-10, 1=very casual, 10=very clinical),
  "vocabularyLevel": "plain" | "mixed" | "clinical",
  "disclosureLevel": "minimal" | "moderate" | "personal",
  "preferredStructures": string[] (e.g., ["question hook", "numbered list", "story arc"]),
  "avoidPhrases": string[] (phrases that conflict with this voice),
  "examplePhrases": string[] (3-5 phrases that exemplify this voice)
}`;
}
