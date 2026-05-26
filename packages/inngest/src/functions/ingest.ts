import { z } from "zod";
import { inngest } from "../client";
import {
  runIngestionPipeline,
  type PipelineResult,
} from "@smm/ingestion/pipeline";

const eventDataSchema = z.object({ documentId: z.string().uuid() });

export const ingestDocument = inngest.createFunction(
  { id: "ingest-document", retries: 3 },
  { event: "ingestion/document.ingest" },
  async ({ event, step }) => {
    const { documentId } = eventDataSchema.parse(event.data);

    const result = await step.run(
      "run-pipeline",
      async (): Promise<PipelineResult> => runIngestionPipeline(documentId),
    );

    return { ok: true, documentId, chunkCount: result.chunkCount };
  },
);
