import { runEval } from "../packages/eval/src/harness";

const clientId = process.env.EVAL_CLIENT_ID;
const workspaceId = process.env.EVAL_WORKSPACE_ID;

if (!clientId || !workspaceId) {
  console.error("EVAL_CLIENT_ID and EVAL_WORKSPACE_ID must be set");
  process.exit(1);
}

const results = await runEval({ clientId, workspaceId });

console.log(
  `recall@5: ${results.recallAt5} | MRR: ${results.mrr} | passed: ${results.passed}`,
);
results.pairResults.forEach((r) => {
  console.log(
    `  ${r.hit ? "✓" : "✗"} "${r.query}" (rank: ${r.rank ?? "not found"})`,
  );
});

if (!results.passed) {
  console.error(`\nFAIL: recall@5 ${results.recallAt5} < 0.75 threshold`);
  process.exit(1);
}
