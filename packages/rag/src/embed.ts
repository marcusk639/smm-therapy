import { embed as voyageEmbed } from "@smm/ai/embeddings";

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  model: string;
  dimensions: number;
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly model = "voyage-3";
  readonly dimensions = 1024;

  async embed(texts: string[]): Promise<number[][]> {
    return voyageEmbed(texts);
  }
}

export const defaultProvider: EmbeddingProvider = new VoyageEmbeddingProvider();
