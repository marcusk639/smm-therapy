import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export type CachedTextBlock = {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
};

export type TextBlock = {
  type: "text";
  text: string;
};

/**
 * Wraps a large static text block for Anthropic prompt caching.
 * Apply to system prompt blocks that are stable across requests (niche examples,
 * ethics rules). Anthropic caches the first cache_control block for 5 minutes,
 * saving ~80% of prompt tokens on repeated calls.
 */
export function cachedTextBlock(text: string): CachedTextBlock {
  return { type: "text", text, cache_control: { type: "ephemeral" } };
}

export type UsageData = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export function extractUsage(response: Anthropic.Message): UsageData {
  return {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}
