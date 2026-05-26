/**
 * Integration test: cross-client chunk isolation.
 * Run with: DATABASE_URL=... ANTHROPIC_API_KEY=... VOYAGE_API_KEY=... pnpm test:integration
 *
 * Seeds chunks for two clients, verifies retrieve() cannot surface client-B
 * chunks from a client-A query context.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, eq } from "drizzle-orm";
import { db } from "../../../packages/db/src/client";
import {
  chunks,
  documents,
  knowledgeBases,
  clients,
  workspaces,
} from "../../../packages/db/src/schema/index";
import { embed } from "../../../packages/ai/src/embeddings";
import { retrieve } from "../../../packages/rag/src/retrieve";
import crypto from "node:crypto";

const TEST_WS_ID = "00000000-0000-0000-0000-000000000001";
const TEST_CLIENT_A = "00000000-0000-0000-0000-000000000002";
const TEST_CLIENT_B = "00000000-0000-0000-0000-000000000003";

const UNIQUE_MARKER_A = "ISOLATION_TEST_CLIENT_A_" + crypto.randomUUID();
const UNIQUE_MARKER_B = "ISOLATION_TEST_CLIENT_B_" + crypto.randomUUID();

async function seedChunk(
  text: string,
  kbId: string,
  clientId: string | null,
  workspaceId: string | null,
): Promise<string> {
  const [docRow] = await db
    .insert(documents)
    .values({
      knowledgeBaseId: kbId,
      sourceType: "web_url",
      title: "Test Doc",
      status: "complete",
      rightsConfirmed: true,
    })
    .returning({ id: documents.id });

  const [embedding] = await embed([text]);
  const vecStr = `[${embedding!.join(",")}]`;

  const [chunk] = await db
    .insert(chunks)
    .values({
      documentId: docRow!.id,
      knowledgeBaseId: kbId,
      clientId,
      workspaceId,
      content: text,
      embedding: sql`${vecStr}::vector`,
      tsv: sql`to_tsvector('english', ${text})`,
      chunkIndex: 0,
      tokenCount: Math.ceil(text.length / 4),
      metadata: {},
    })
    .returning({ id: chunks.id });

  return chunk!.id;
}

describe("Cross-client chunk isolation", () => {
  let kbIdA: string;
  let kbIdB: string;
  let chunkIdA: string;
  let chunkIdB: string;

  beforeAll(async () => {
    await db
      .insert(workspaces)
      .values({
        id: TEST_WS_ID,
        clerkOrgId: "test-org",
        name: "Test WS",
        slug: "test-ws",
      })
      .onConflictDoNothing();
    await db
      .insert(clients)
      .values({
        id: TEST_CLIENT_A,
        workspaceId: TEST_WS_ID,
        name: "Client A",
        slug: "client-a",
      })
      .onConflictDoNothing();
    await db
      .insert(clients)
      .values({
        id: TEST_CLIENT_B,
        workspaceId: TEST_WS_ID,
        name: "Client B",
        slug: "client-b",
      })
      .onConflictDoNothing();

    const [kbA] = await db
      .insert(knowledgeBases)
      .values({
        workspaceId: TEST_WS_ID,
        clientId: TEST_CLIENT_A,
        name: "KB A",
        kbType: "client",
      })
      .returning({ id: knowledgeBases.id });
    kbIdA = kbA!.id;

    const [kbB] = await db
      .insert(knowledgeBases)
      .values({
        workspaceId: TEST_WS_ID,
        clientId: TEST_CLIENT_B,
        name: "KB B",
        kbType: "client",
      })
      .returning({ id: knowledgeBases.id });
    kbIdB = kbB!.id;

    chunkIdA = await seedChunk(
      `Client A unique content: ${UNIQUE_MARKER_A}. Anxiety management for therapists.`,
      kbIdA,
      TEST_CLIENT_A,
      TEST_WS_ID,
    );
    chunkIdB = await seedChunk(
      `Client B unique content: ${UNIQUE_MARKER_B}. Burnout recovery strategies.`,
      kbIdB,
      TEST_CLIENT_B,
      TEST_WS_ID,
    );
  });

  afterAll(async () => {
    await db.delete(knowledgeBases).where(eq(knowledgeBases.id, kbIdA));
    await db.delete(knowledgeBases).where(eq(knowledgeBases.id, kbIdB));
  });

  it("retrieve() for client A does not return client B chunks", async () => {
    const result = await retrieve(UNIQUE_MARKER_B, {
      clientId: TEST_CLIENT_A,
      workspaceId: TEST_WS_ID,
    });

    const chunkIds = result.chunks.map((c) => c.chunkId);
    expect(chunkIds).not.toContain(chunkIdB);
  }, 30_000);

  it("retrieve() for client A returns client A chunks when queried", async () => {
    const result = await retrieve(UNIQUE_MARKER_A, {
      clientId: TEST_CLIENT_A,
      workspaceId: TEST_WS_ID,
    });

    const chunkIds = result.chunks.map((c) => c.chunkId);
    expect(chunkIds).toContain(chunkIdA);
  }, 30_000);
});
