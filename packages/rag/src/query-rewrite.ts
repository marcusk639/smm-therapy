import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function rewriteQuery(query: string): Promise<string> {
  if (query.length > 40) return query;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 120,
    messages: [
      {
        role: "user",
        content: `Rewrite this search query to be more specific for a mental health content knowledge base. Return only the rewritten query, nothing else.\n\nQuery: "${query}"`,
      },
    ],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  return text || query;
}
