export type Chunk = {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  metadata: Record<string, unknown>;
};
