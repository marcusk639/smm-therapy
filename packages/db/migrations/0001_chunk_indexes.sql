-- HNSW index for cosine distance (voyage-3 produces normalized vectors)
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN index for fast tsvector full-text search
CREATE INDEX IF NOT EXISTS chunks_tsv_gin_idx
  ON chunks USING gin (tsv);
