import { describe, it, expect } from "vitest";

describe("calendarJobs schema", () => {
  it("exports calendarJobs", async () => {
    const mod = await import("../../../packages/db/src/schema/calendar-jobs");
    expect(mod.calendarJobs).toBeDefined();
    expect(mod.calendarJobStatusEnum).toBeDefined();
  });

  it("drafts exports scheduledAt in column config", async () => {
    const mod = await import("../../../packages/db/src/schema/drafts");
    const col = (mod.drafts as unknown as Record<string, unknown>)[
      "scheduledAt"
    ];
    expect(col).toBeDefined();
  });
});
