import { inngest } from "../client";
import { ingestDocument } from "./ingest";
import { calendarGenerate } from "./calendar-generate";
import { igPublish } from "./ig-publish";
import { igMetricsSync } from "./ig-metrics-sync";
import { trendSync } from "./trend-sync";
import { monthlyReports } from "./monthly-reports";
import { dataRetention } from "./data-retention";

export const smokeTest = inngest.createFunction(
  { id: "smoke-test" },
  { event: "test/smoke" },
  async ({ event }) => {
    return { ok: true, received: event.data };
  },
);

export const functions = [
  smokeTest,
  ingestDocument,
  calendarGenerate,
  igPublish,
  igMetricsSync,
  trendSync,
  monthlyReports,
  dataRetention,
];
