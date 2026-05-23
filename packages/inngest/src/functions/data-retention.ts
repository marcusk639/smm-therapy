import { inngest } from "../client";
import { db } from "@smm/db/client";
import { chunks, documents, llmUsageLog } from "@smm/db/schema";
import { and, eq, isNotNull, lte, lt } from "drizzle-orm";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const THIRTEEN_MONTHS_MS = 13 * 30 * 24 * 60 * 60 * 1000;

export const dataRetention = inngest.createFunction(
  { id: "data-retention", retries: 1 },
  { cron: "0 3 * * *" },
  async ({ step }) => {
    const chunksCutoff = new Date(Date.now() - THIRTY_DAYS_MS);
    const llmCutoff = new Date(Date.now() - THIRTEEN_MONTHS_MS);

    const deletedChunks = await step.run("delete-stale-chunks", async () => {
      const staleDocumentIds = await db
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            isNotNull(documents.deletedAt),
            lte(documents.deletedAt, chunksCutoff),
          ),
        );

      if (staleDocumentIds.length === 0) return { count: 0 };

      let total = 0;
      for (const { id } of staleDocumentIds) {
        const rows = await db
          .delete(chunks)
          .where(eq(chunks.documentId, id))
          .returning({ id: chunks.id });
        total += rows.length;
      }
      return { count: total };
    });

    const deletedDocuments = await step.run(
      "delete-stale-documents",
      async () => {
        const rows = await db
          .delete(documents)
          .where(
            and(
              isNotNull(documents.deletedAt),
              lte(documents.deletedAt, chunksCutoff),
            ),
          )
          .returning({ id: documents.id });
        return { count: rows.length };
      },
    );

    const deletedLlmLogs = await step.run(
      "delete-stale-llm-usage-logs",
      async () => {
        const rows = await db
          .delete(llmUsageLog)
          .where(lt(llmUsageLog.createdAt, llmCutoff))
          .returning({ id: llmUsageLog.id });
        return { count: rows.length };
      },
    );

    return {
      deletedChunks: deletedChunks.count,
      deletedDocuments: deletedDocuments.count,
      deletedLlmLogs: deletedLlmLogs.count,
    };
  },
);
