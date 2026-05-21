import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: [
      // More specific paths must come before shorter prefixes
      {
        find: "@smm/ai/prompts/compliance-critic",
        replacement: path.resolve(
          __dirname,
          "packages/ai/src/prompts/compliance-critic.ts",
        ),
      },
      {
        find: "@smm/ai/prompts/hooks",
        replacement: path.resolve(
          __dirname,
          "packages/ai/src/prompts/hooks.ts",
        ),
      },
      {
        find: "@smm/ai/prompts/captions",
        replacement: path.resolve(
          __dirname,
          "packages/ai/src/prompts/captions.ts",
        ),
      },
      {
        find: "@smm/ai/prompts/brand-voice",
        replacement: path.resolve(
          __dirname,
          "packages/ai/src/prompts/brand-voice.ts",
        ),
      },
      {
        find: "@smm/ai/templates/niche-examples",
        replacement: path.resolve(
          __dirname,
          "packages/ai/src/templates/niche-examples.ts",
        ),
      },
      {
        find: "@smm/ai/client",
        replacement: path.resolve(__dirname, "packages/ai/src/client.ts"),
      },
      {
        find: "@smm/ai/embeddings",
        replacement: path.resolve(__dirname, "packages/ai/src/embeddings.ts"),
      },
      {
        find: "@smm/ai",
        replacement: path.resolve(__dirname, "packages/ai/src/index.ts"),
      },
      {
        find: "@smm/compliance/engine",
        replacement: path.resolve(
          __dirname,
          "packages/compliance/src/engine.ts",
        ),
      },
      {
        find: "@smm/compliance/critic",
        replacement: path.resolve(
          __dirname,
          "packages/compliance/src/critic.ts",
        ),
      },
      {
        find: "@smm/compliance/crisis",
        replacement: path.resolve(
          __dirname,
          "packages/compliance/src/crisis.ts",
        ),
      },
      {
        find: "@smm/compliance/disclaimer",
        replacement: path.resolve(
          __dirname,
          "packages/compliance/src/disclaimer.ts",
        ),
      },
      {
        find: "@smm/db/client",
        replacement: path.resolve(__dirname, "packages/db/src/client.ts"),
      },
      {
        find: "@smm/db/schema",
        replacement: path.resolve(__dirname, "packages/db/src/schema/index.ts"),
      },
      {
        find: "@smm/db/rls",
        replacement: path.resolve(__dirname, "packages/db/src/rls.ts"),
      },
      {
        find: "@smm/db",
        replacement: path.resolve(__dirname, "packages/db/src/index.ts"),
      },
      {
        find: "@smm/rag/embed",
        replacement: path.resolve(__dirname, "packages/rag/src/embed.ts"),
      },
      {
        find: "@smm/rag/hybrid",
        replacement: path.resolve(__dirname, "packages/rag/src/hybrid.ts"),
      },
      {
        find: "@smm/rag/rerank",
        replacement: path.resolve(__dirname, "packages/rag/src/rerank.ts"),
      },
      {
        find: "@smm/rag/retrieve",
        replacement: path.resolve(__dirname, "packages/rag/src/retrieve.ts"),
      },
      {
        find: "@smm/rag/citations",
        replacement: path.resolve(__dirname, "packages/rag/src/citations.ts"),
      },
      {
        find: "@smm/rag/query-rewrite",
        replacement: path.resolve(
          __dirname,
          "packages/rag/src/query-rewrite.ts",
        ),
      },
      {
        find: "@smm/rag",
        replacement: path.resolve(__dirname, "packages/rag/src/index.ts"),
      },
      {
        find: "@smm/types/generation",
        replacement: path.resolve(
          __dirname,
          "packages/types/src/generation.ts",
        ),
      },
      {
        find: "@smm/types",
        replacement: path.resolve(__dirname, "packages/types/src/index.ts"),
      },
    ],
  },
});
