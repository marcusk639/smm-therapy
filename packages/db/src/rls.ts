import { eq, and, isNull } from "drizzle-orm";
import type { Column } from "drizzle-orm";

/**
 * Neon's PgBouncer runs in transaction mode: SET LOCAL session variables
 * do NOT persist across pooled connections. Never use SET LOCAL for
 * workspace isolation. Always filter by workspace_id explicitly in every
 * query. This helper makes the pattern consistent.
 *
 * Usage:
 *   .where(and(workspaceFilter(clients.workspaceId, workspaceId), isNull(clients.deletedAt)))
 */
export function workspaceFilter(col: Column, workspaceId: string) {
  return eq(col, workspaceId);
}

export { and, isNull, eq };
