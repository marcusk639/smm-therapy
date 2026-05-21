import { z } from "zod";
import { inngest } from "../client";
import { db } from "@smm/db/client";
import {
  calendarJobs,
  drafts,
  clients,
  brandVoices,
  llmUsageLog,
} from "@smm/db/schema";
import { eq } from "drizzle-orm";
import { anthropic, extractUsage } from "@smm/ai/client";
import {
  buildCalendarSystemPrompt,
  buildCalendarUserPrompt,
} from "@smm/ai/prompts/calendar";
import { getRulesForClient, runComplianceCritic } from "@smm/compliance/engine";
import { getDisclaimerFor, appendDisclaimer } from "@smm/compliance/disclaimer";
import { retrieve } from "@smm/rag/retrieve";
import {
  distributeTopics,
  distributeFormats,
  getScheduledDates,
} from "./calendar-utils";

export { distributeTopics, getScheduledDates } from "./calendar-utils";

const eventSchema = z.object({
  jobId: z.string().uuid(),
  clientId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  month: z.string(),
  topicAreas: z.array(z.string()),
  postsPerWeek: z.number().int(),
});

export const calendarGenerate = inngest.createFunction(
  { id: "calendar-generate", retries: 2 },
  { event: "calendar/generate" },
  async ({ event, step }) => {
    const { jobId, clientId, workspaceId, month, topicAreas, postsPerWeek } =
      eventSchema.parse(event.data);

    const totalPosts = postsPerWeek * 4;
    const topicList = distributeTopics(topicAreas, totalPosts);
    const formatList = distributeFormats(totalPosts);
    const scheduledDates = getScheduledDates(month, totalPosts, postsPerWeek);

    await step.run("mark-running", () =>
      db
        .update(calendarJobs)
        .set({ status: "running" })
        .where(eq(calendarJobs.id, jobId)),
    );

    const [client] = await step.run("fetch-client", () =>
      db.select().from(clients).where(eq(clients.id, clientId)),
    );
    if (!client) throw new Error(`Client ${clientId} not found`);

    const [brandVoice] = await step.run("fetch-brand-voice", () =>
      db.select().from(brandVoices).where(eq(brandVoices.clientId, clientId)),
    );
    const brandVoiceContext = brandVoice
      ? JSON.stringify(brandVoice.profile)
      : "Warm and professional. Plain vocabulary. Moderate disclosure.";

    const rules = await step.run("fetch-rules", () =>
      getRulesForClient({
        state: client.practiceState ?? "unknown",
        credential: client.primaryCredential ?? "Other",
      }),
    );

    let savedCount = 0;

    for (let i = 0; i < totalPosts; i++) {
      const topic = topicList[i]!;
      const format = formatList[i]!;
      const scheduledAt = scheduledDates[i] ?? new Date();

      await step.run(`generate-post-${i}`, async () => {
        const ragResult = await retrieve(topic, {
          clientId,
          workspaceId,
        }).catch(() => ({ chunks: [], contextText: "" }));

        const systemBlocks = buildCalendarSystemPrompt();
        const userPrompt = buildCalendarUserPrompt(
          topic,
          format,
          brandVoiceContext,
          client.practiceState ?? null,
          ragResult.contextText || undefined,
        );

        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          system: systemBlocks,
          messages: [{ role: "user", content: userPrompt }],
        });

        const usage = extractUsage(response);
        const rawText =
          response.content[0]?.type === "text"
            ? response.content[0].text
            : "{}";

        let hook = topic;
        let caption = "";
        let hashtags: string[] = [];
        try {
          const parsed = JSON.parse(rawText) as {
            hook?: string;
            caption?: string;
            hashtags?: string[];
          };
          hook = parsed.hook ?? topic;
          caption = parsed.caption ?? "";
          hashtags = parsed.hashtags ?? [];
        } catch {
          caption = rawText;
        }

        await db.insert(llmUsageLog).values({
          workspaceId,
          model: "claude-haiku-4-5-20251001",
          promptTokens: usage.inputTokens,
          completionTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
          callType: "calendar_generation",
        });

        const criticResult = await runComplianceCritic(caption, rules);
        const disclaimer = await getDisclaimerFor(
          format,
          client.practiceState ?? null,
        );
        const finalCaption = appendDisclaimer(caption, disclaimer);

        await db.insert(drafts).values({
          workspaceId,
          clientId,
          hook,
          caption: finalCaption,
          hashtags,
          format,
          status: "draft",
          complianceApproved: criticResult.approved,
          requiresCrisisResources: false,
          scheduledAt,
        });

        savedCount++;
      });
    }

    await step.run("mark-complete", () =>
      db
        .update(calendarJobs)
        .set({ status: "complete", draftCount: savedCount })
        .where(eq(calendarJobs.id, jobId)),
    );

    return { ok: true, jobId, draftCount: savedCount };
  },
);
