import { anthropic, extractUsage } from "../client";

export type TrendItem = {
  topic: string;
  summary: string;
  relevanceScore: number;
};

export type TrendSynthesizerResult = {
  trends: TrendItem[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
};

export function buildTrendSynthesizerPrompt(posts: string[]): string {
  const postList = posts
    .slice(0, 50)
    .map((p, i) => `${i + 1}. ${p}`)
    .join("\n");

  return `You are a mental health content strategist. Analyze these recent posts from mental health communities and identify the 5 most relevant trending topics for a therapist's Instagram account.

Posts:
${postList}

Return JSON only — an array of exactly 5 objects:
[{"topic":"...","summary":"one sentence about why this is trending and why therapists should address it","relevanceScore":0.0}]

relevanceScore: float 0.0–1.0 representing how relevant this topic is specifically to therapist social media content.`;
}

export async function synthesizeTrends(
  posts: string[],
): Promise<TrendSynthesizerResult> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: buildTrendSynthesizerPrompt(posts),
      },
    ],
  });

  const usage = extractUsage(response);
  const rawText =
    response.content[0]?.type === "text" ? response.content[0].text : "[]";

  try {
    const parsed = JSON.parse(rawText) as TrendItem[];
    const trends = parsed
      .filter(
        (t): t is TrendItem =>
          typeof t.topic === "string" &&
          typeof t.summary === "string" &&
          typeof t.relevanceScore === "number",
      )
      .slice(0, 5);
    return { trends, usage };
  } catch {
    return { trends: [], usage };
  }
}
