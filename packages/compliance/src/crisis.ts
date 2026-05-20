import { embed, cosineSimilarity } from "@smm/ai/embeddings";
import { db } from "@smm/db/client";
import { crisisResources } from "@smm/db/schema";
import { eq } from "drizzle-orm";

const CRISIS_SEED_PHRASES = [
  "suicide",
  "suicidal thoughts",
  "want to die",
  "self-harm",
  "self-injury",
  "cutting",
  "eating disorder",
  "anorexia",
  "bulimia",
  "domestic abuse",
  "sexual assault",
  "overdose",
];

const CRISIS_THRESHOLD = 0.75;

let crisisCentroid: number[] | null = null;

async function getCrisisCentroid(): Promise<number[]> {
  if (crisisCentroid) return crisisCentroid;
  const embeddings = await embed(CRISIS_SEED_PHRASES);
  const dims = embeddings[0]!.length;
  const centroid = new Array<number>(dims).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dims; i++) centroid[i]! += emb[i]!;
  }
  for (let i = 0; i < dims; i++) centroid[i]! /= embeddings.length;
  crisisCentroid = centroid;
  return centroid;
}

export type CrisisResource = {
  topicKey: string;
  resourceText: string;
  hotline: string | null;
};

export type CrisisResult = {
  triggered: boolean;
  score: number;
  resources: CrisisResource[];
};

export async function detectCrisis(content: string): Promise<CrisisResult> {
  const centroid = await getCrisisCentroid();
  const [contentEmbedding] = await embed([content]);
  const score = cosineSimilarity(contentEmbedding!, centroid);

  if (score < CRISIS_THRESHOLD) {
    return { triggered: false, score, resources: [] };
  }

  const resources = await db
    .select({
      topicKey: crisisResources.topicKey,
      resourceText: crisisResources.resourceText,
      hotline: crisisResources.hotline,
    })
    .from(crisisResources)
    .where(eq(crisisResources.active, true));

  return { triggered: true, score, resources };
}

export function resetCrisisCentroidCache(): void {
  crisisCentroid = null;
}
