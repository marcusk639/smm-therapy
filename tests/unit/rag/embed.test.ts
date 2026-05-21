import { describe, it, expect, vi } from "vitest";

const mockEmbed = vi.hoisted(() => vi.fn());

vi.mock("@smm/ai/embeddings", () => ({
  embed: mockEmbed,
  cosineSimilarity: vi.fn(),
}));

import {
  VoyageEmbeddingProvider,
  defaultProvider,
} from "../../../packages/rag/src/embed";

describe("VoyageEmbeddingProvider", () => {
  it("returns embeddings from the underlying embed() call", async () => {
    mockEmbed.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);

    const result = await defaultProvider.embed(["hello"]);

    expect(mockEmbed).toHaveBeenCalledWith(["hello"]);
    expect(result).toEqual([[0.1, 0.2, 0.3]]);
  });

  it("exposes model and dimensions", () => {
    expect(defaultProvider.model).toBe("voyage-3");
    expect(defaultProvider.dimensions).toBe(1024);
  });
});
