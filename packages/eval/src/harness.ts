import { retrieve } from "@smm/rag/retrieve";
import { recallAtK, mrr } from "./metrics";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

type EvalPair = {
  query: string;
  expectedContentSubstring: string;
  documentTitle: string;
};

type EvalSet = {
  version: string;
  description: string;
  pairs: EvalPair[];
};

type EvalResults = {
  timestamp: string;
  evalSetVersion: string;
  recallAt5: number;
  mrr: number;
  pairResults: Array<{ query: string; hit: boolean; rank: number | null }>;
  passed: boolean;
};

const RECALL_THRESHOLD = 0.75;

export async function runEval(options: {
  clientId: string;
  workspaceId: string;
  evalSetPath?: string;
  resultsPath?: string;
}): Promise<EvalResults> {
  const evalSetPath =
    options.evalSetPath ?? join(__dirname, "eval-set/niche-mental-health.json");
  const resultsPath =
    options.resultsPath ?? join(__dirname, "results/latest.json");

  const evalSet: EvalSet = JSON.parse(readFileSync(evalSetPath, "utf-8"));

  const pairResults: EvalResults["pairResults"] = [];
  const retrievedIdsList: string[][] = [];
  const relevantIdsList: string[][] = [];

  for (const pair of evalSet.pairs) {
    const result = await retrieve(pair.query, {
      clientId: options.clientId,
      workspaceId: options.workspaceId,
      limit: 10,
    });

    const chunkIds = result.chunks.map((c) => c.chunkId);

    const hitIndex = result.chunks
      .slice(0, 5)
      .findIndex((c) =>
        c.content
          .toLowerCase()
          .includes(pair.expectedContentSubstring.toLowerCase()),
      );

    const relevantIds = result.chunks
      .filter((c) =>
        c.content
          .toLowerCase()
          .includes(pair.expectedContentSubstring.toLowerCase()),
      )
      .map((c) => c.chunkId);

    pairResults.push({
      query: pair.query,
      hit: hitIndex !== -1,
      rank: hitIndex === -1 ? null : hitIndex + 1,
    });

    retrievedIdsList.push(chunkIds);
    relevantIdsList.push(relevantIds);
  }

  const recall5 =
    pairResults.length > 0
      ? pairResults.reduce((sum, r) => sum + (r.hit ? 1 : 0), 0) /
        pairResults.length
      : 1.0;

  const mrrScore =
    pairResults.length > 0
      ? retrievedIdsList.reduce(
          (sum, ids, i) => sum + mrr(ids, relevantIdsList[i]!),
          0,
        ) / pairResults.length
      : 1.0;

  const results: EvalResults = {
    timestamp: new Date().toISOString(),
    evalSetVersion: evalSet.version,
    recallAt5: Math.round(recall5 * 1000) / 1000,
    mrr: Math.round(mrrScore * 1000) / 1000,
    pairResults,
    passed: recall5 >= RECALL_THRESHOLD,
  };

  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  return results;
}
