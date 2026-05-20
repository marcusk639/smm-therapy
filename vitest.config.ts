import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@smm/types": path.resolve(__dirname, "packages/types/src/index.ts"),
      "@smm/db": path.resolve(__dirname, "packages/db/src/index.ts"),
      "@smm/ai": path.resolve(__dirname, "packages/ai/src/index.ts"),
      "@smm/ai/client": path.resolve(__dirname, "packages/ai/src/client.ts"),
      "@smm/ai/embeddings": path.resolve(
        __dirname,
        "packages/ai/src/embeddings.ts",
      ),
      "@smm/ai/prompts/compliance-critic": path.resolve(
        __dirname,
        "packages/ai/src/prompts/compliance-critic.ts",
      ),
      "@smm/compliance/engine": path.resolve(
        __dirname,
        "packages/compliance/src/engine.ts",
      ),
      "@smm/compliance/critic": path.resolve(
        __dirname,
        "packages/compliance/src/critic.ts",
      ),
      "@smm/db/client": path.resolve(__dirname, "packages/db/src/client.ts"),
      "@smm/db/schema": path.resolve(
        __dirname,
        "packages/db/src/schema/index.ts",
      ),
      "@smm/db/rls": path.resolve(__dirname, "packages/db/src/rls.ts"),
      "@smm/types/generation": path.resolve(
        __dirname,
        "packages/types/src/generation.ts",
      ),
    },
  },
});
