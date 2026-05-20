import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../packages/db/src/schema/index";
import { eq, and, isNull } from "drizzle-orm";
import { workspaceFilter } from "../../packages/db/src/rls";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const SUFFIX = Math.random().toString(36).slice(2, 8);

describe("workspace isolation (RLS pattern)", () => {
  let wsAId: string;
  let wsBId: string;
  let clientId: string;

  beforeAll(async () => {
    const [wsA] = await db
      .insert(schema.workspaces)
      .values({
        clerkOrgId: `test_org_A_${SUFFIX}`,
        name: "WS A",
        slug: `ws-a-${SUFFIX}`,
      })
      .returning();
    const [wsB] = await db
      .insert(schema.workspaces)
      .values({
        clerkOrgId: `test_org_B_${SUFFIX}`,
        name: "WS B",
        slug: `ws-b-${SUFFIX}`,
      })
      .returning();
    wsAId = wsA!.id;
    wsBId = wsB!.id;

    const [client] = await db
      .insert(schema.clients)
      .values({
        workspaceId: wsAId,
        name: "Therapy Co",
        slug: `therapy-co-${SUFFIX}`,
      })
      .returning();
    clientId = client!.id;
  });

  afterAll(async () => {
    await db
      .delete(schema.clients)
      .where(eq(schema.clients.workspaceId, wsAId));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, wsAId));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, wsBId));
  });

  it("querying with workspace-B id returns zero clients from workspace-A", async () => {
    const result = await db
      .select()
      .from(schema.clients)
      .where(
        and(
          workspaceFilter(schema.clients.workspaceId, wsBId),
          isNull(schema.clients.deletedAt),
        ),
      );

    expect(result).toHaveLength(0);
    expect(result.find((c) => c.id === clientId)).toBeUndefined();
  });

  it("querying with workspace-A id returns workspace-A clients", async () => {
    const result = await db
      .select()
      .from(schema.clients)
      .where(
        and(
          workspaceFilter(schema.clients.workspaceId, wsAId),
          isNull(schema.clients.deletedAt),
        ),
      );

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.find((c) => c.id === clientId)).toBeDefined();
  });
});
