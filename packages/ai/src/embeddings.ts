import { VoyageAIClient } from "voyageai";

function getClient() {
  return new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! });
}

export async function embed(texts: string[]): Promise<number[][]> {
  const client = getClient();
  const response = await client.embed({ input: texts, model: "voyage-3" });
  return (response.data ?? []).map((item) => item.embedding ?? []);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i]!, 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}
