# Phase 3: Agent Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 30-day content calendar generator, voice consistency critic, and repurposing agent so therapist SMMs can generate a full month of compliant, on-brand content in one action and repurpose any draft into an alternate format.

**Architecture:** A `calendarGenerate` Inngest function orchestrates batch hook+caption generation for a calendar month, reusing `retrieve()`, `runComplianceCritic()`, and `getDisclaimerFor()`. A `voiceCritic` Claude tool-use agent scores each caption against brand voice before saving (score < 7 flags the draft). A `repurpose` agent re-frames an existing draft into any of the 5 content formats. New `calendarJobs` table tracks batch generation status. `scheduled_at` column added to `drafts`. Calendar UI renders a month grid from drafts.

**Tech Stack:** drizzle-orm · Inngest step functions · Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) · shadcn/ui · Next.js App Router

---

## File Structure

```
packages/db/src/schema/
├── calendar-jobs.ts         NEW: calendarJobs table + calendarJobStatusEnum
├── drafts.ts                MODIFY: add scheduledAt column
└── index.ts                 MODIFY: export calendarJobs + calendarJobStatusEnum

packages/ai/src/
├── agents/
│   ├── voice-critic.ts      NEW: runVoiceCritic() Claude tool-use agent
│   └── repurpose.ts         NEW: repurposeDraft() Claude call
└── prompts/
    └── calendar.ts          NEW: buildCalendarSystemPrompt(), buildCalendarUserPrompt()

packages/inngest/src/
├── functions/
│   └── calendar-generate.ts NEW: "calendar/generate" event handler
└── index.ts                  MODIFY: register calendarGenerate

packages/types/src/
└── calendar.ts              NEW: GenerateCalendarSchema, RepurposeSchema

apps/web/app/api/v1/clients/[clientId]/
├── calendar/route.ts             NEW: GET (month view), POST (trigger)
├── drafts/route.ts               NEW: GET list all drafts
└── drafts/[draftId]/
    ├── route.ts                   NEW: GET detail, PATCH status/hook/caption
    └── repurpose/route.ts         NEW: POST create repurposed draft

apps/web/app/(app)/clients/[clientId]/
├── calendar/page.tsx             NEW: month-view calendar UI
└── drafts/[draftId]/page.tsx     NEW: draft detail/edit page
```

---

### Task 1: DB Migration — scheduledAt + calendarJobs

**Files:**

- Create: `packages/db/src/schema/calendar-jobs.ts`
- Modify: `packages/db/src/schema/drafts.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/src/schema/__tests__/calendar-schema.test.ts
import { describe, it, expect } from "vitest";

describe("calendarJobs schema", () => {
  it("exports calendarJobs", async () => {
    const mod = await import("../calendar-jobs");
    expect(mod.calendarJobs).toBeDefined();
    expect(mod.calendarJobStatusEnum).toBeDefined();
  });

  it("drafts exports scheduledAt in column config", async () => {
    const mod = await import("../drafts");
    const col = (mod.drafts as unknown as Record<string, unknown>)[
      "scheduledAt"
    ];
    expect(col).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/db test`
Expected: FAIL — "calendarJobs is not exported"

- [ ] **Step 3: Create calendar-jobs schema**

```typescript
// packages/db/src/schema/calendar-jobs.ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { clients } from "./clients";

export const calendarJobStatusEnum = pgEnum("calendar_job_status", [
  "pending",
  "running",
  "complete",
  "failed",
]);

export const calendarJobs = pgTable("calendar_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  topicAreas: text("topic_areas").array().notNull().default([]),
  postsPerWeek: integer("posts_per_week").notNull().default(5),
  status: calendarJobStatusEnum("status").notNull().default("pending"),
  draftCount: integer("draft_count").notNull().default(0),
  failedReason: text("failed_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type CalendarJob = typeof calendarJobs.$inferSelect;
export type NewCalendarJob = typeof calendarJobs.$inferInsert;
```

Add `scheduledAt` column to `packages/db/src/schema/drafts.ts` after `generationAuditId`:

```typescript
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
```

- [ ] **Step 4: Update index.ts**

```typescript
// packages/db/src/schema/index.ts — append:
export * from "./calendar-jobs";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @smm/db test`
Expected: PASS

- [ ] **Step 6: Generate migration**

```bash
pnpm --filter @smm/db migrate:generate
# Review generated SQL, then:
pnpm --filter @smm/db migrate
```

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/calendar-jobs.ts packages/db/src/schema/drafts.ts packages/db/src/schema/index.ts
git commit -m "feat: add calendar_jobs table and scheduled_at to drafts"
```

---

### Task 2: Calendar Types

**Files:**

- Create: `packages/types/src/calendar.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/types/src/__tests__/calendar.test.ts
import { describe, it, expect } from "vitest";
import { GenerateCalendarSchema, RepurposeSchema } from "../calendar";

describe("GenerateCalendarSchema", () => {
  it("validates correct input", () => {
    const result = GenerateCalendarSchema.safeParse({
      month: "2026-06",
      topicAreas: ["anxiety", "burnout"],
      postsPerWeek: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid month format", () => {
    const result = GenerateCalendarSchema.safeParse({
      month: "June 2026",
      topicAreas: ["anxiety"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty topicAreas", () => {
    const result = GenerateCalendarSchema.safeParse({
      month: "2026-06",
      topicAreas: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("RepurposeSchema", () => {
  it("accepts valid formats", () => {
    expect(RepurposeSchema.safeParse({ targetFormat: "story" }).success).toBe(
      true,
    );
  });

  it("rejects unknown formats", () => {
    expect(RepurposeSchema.safeParse({ targetFormat: "tweet" }).success).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/types test`
Expected: FAIL — module not found

- [ ] **Step 3: Create types**

```typescript
// packages/types/src/calendar.ts
import { z } from "zod";

export const GenerateCalendarSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM"),
  topicAreas: z.array(z.string().min(1)).min(1).max(10),
  postsPerWeek: z.number().int().min(1).max(7).default(5),
});
export type GenerateCalendarInput = z.infer<typeof GenerateCalendarSchema>;

export const RepurposeSchema = z.object({
  targetFormat: z.enum([
    "psychoeducation",
    "normalization",
    "coping_skill",
    "story",
    "cta",
  ]),
});
export type RepurposeInput = z.infer<typeof RepurposeSchema>;
```

Add to `packages/types/src/index.ts`:

```typescript
export * from "./calendar";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smm/types test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/calendar.ts packages/types/src/index.ts
git commit -m "feat: add GenerateCalendarSchema and RepurposeSchema types"
```

---

### Task 3: Calendar Prompt + Inngest Function

**Files:**

- Create: `packages/ai/src/prompts/calendar.ts`
- Create: `packages/inngest/src/functions/calendar-generate.ts`
- Modify: `packages/inngest/src/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/inngest/src/functions/__tests__/calendar-generate.test.ts
import { describe, it, expect } from "vitest";
import { distributeTopics, getScheduledDates } from "../calendar-generate";

describe("distributeTopics", () => {
  it("distributes topics evenly", () => {
    const result = distributeTopics(["anxiety", "burnout"], 4);
    expect(result).toEqual(["anxiety", "burnout", "anxiety", "burnout"]);
  });

  it("cycles when more posts than topics", () => {
    const result = distributeTopics(["anxiety"], 3);
    expect(result).toEqual(["anxiety", "anxiety", "anxiety"]);
  });
});

describe("getScheduledDates", () => {
  it("returns the right count of dates within the month", () => {
    const dates = getScheduledDates("2026-06", 8, 2);
    expect(dates.length).toBe(8);
    expect(dates[0]!.getMonth()).toBe(5); // June is 5
    dates.forEach((d) => {
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(5);
    });
  });

  it("does not exceed days in month", () => {
    const dates = getScheduledDates("2026-02", 100, 7);
    const daysInFeb = new Date(2026, 2, 0).getDate();
    dates.forEach((d) => expect(d.getDate()).toBeLessThanOrEqual(daysInFeb));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/inngest test`
Expected: FAIL — "distributeTopics is not exported"

- [ ] **Step 3: Create calendar prompt helpers**

```typescript
// packages/ai/src/prompts/calendar.ts
import { cachedTextBlock } from "../client";

export function buildCalendarSystemPrompt() {
  return [
    cachedTextBlock(
      'You are a licensed mental health social media strategist. Generate Instagram hook-caption pairs for therapist accounts.\n\nRules:\n- Hook: 8-15 words, engaging question or statement\n- Caption: 50-150 words, warm and evidence-informed\n- No direct clinical advice, no diagnostic language\n- Output valid JSON only: {"hook":"...","caption":"...","hashtags":["..."]}',
    ),
  ];
}

const FORMAT_INSTRUCTIONS: Record<string, string> = {
  psychoeducation:
    "educational post explaining a mental health concept in plain language",
  normalization:
    "post that normalizes a common emotional experience and reduces shame",
  coping_skill:
    "post sharing one specific, actionable coping skill with clear steps",
  story:
    "post framed as a brief relatable scenario that illustrates a therapeutic insight",
  cta: "post inviting followers to take one small, low-stakes positive action",
};

export function buildCalendarUserPrompt(
  topic: string,
  format: string,
  brandVoice: string,
  practiceState: string | null,
  ragContext?: string,
): string {
  const formatDesc = FORMAT_INSTRUCTIONS[format] ?? format;
  const contextSection = ragContext
    ? `\n\nRelevant background from this therapist's knowledge base:\n${ragContext}`
    : "";
  return `Topic: ${topic}\nFormat type: ${formatDesc}\nBrand voice: ${brandVoice}\nPractice state: ${practiceState ?? "not specified"}${contextSection}\n\nGenerate one hook-caption pair as JSON.`;
}
```

- [ ] **Step 4: Create the Inngest function**

```typescript
// packages/inngest/src/functions/calendar-generate.ts
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

const FORMATS = [
  "psychoeducation",
  "normalization",
  "coping_skill",
  "story",
  "cta",
] as const;
type Format = (typeof FORMATS)[number];

export function distributeTopics(topics: string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => topics[i % topics.length]!);
}

function distributeFormats(count: number): Format[] {
  return Array.from({ length: count }, (_, i) => FORMATS[i % FORMATS.length]!);
}

export function getScheduledDates(
  month: string,
  count: number,
  postsPerWeek: number,
): Date[] {
  const [year, mo] = month.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(year, mo, 0).getDate();
  const intervalDays = Math.max(1, Math.floor(7 / postsPerWeek));
  const dates: Date[] = [];
  let day = 1;
  while (dates.length < count && day <= daysInMonth) {
    dates.push(new Date(year, mo - 1, day));
    day += intervalDays;
  }
  return dates;
}

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
```

- [ ] **Step 5: Register function in inngest index**

In `packages/inngest/src/index.ts`, add:

```typescript
export { calendarGenerate } from "./functions/calendar-generate";
```

Also add `calendarGenerate` to the array passed to `serve()` in the Inngest route handler at `apps/web/app/api/inngest/route.ts`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @smm/inngest test`
Expected: PASS — distributeTopics and getScheduledDates pass

- [ ] **Step 7: Commit**

```bash
git add packages/ai/src/prompts/calendar.ts packages/inngest/src/functions/calendar-generate.ts packages/inngest/src/index.ts
git commit -m "feat: add calendar generation Inngest function"
```

---

### Task 4: Voice Critic Agent

**Files:**

- Create: `packages/ai/src/agents/voice-critic.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/ai/src/agents/__tests__/voice-critic.test.ts
import { describe, it, expect } from "vitest";
import { buildVoiceCriticPrompt } from "../voice-critic";

describe("buildVoiceCriticPrompt", () => {
  it("includes caption in prompt", () => {
    const prompt = buildVoiceCriticPrompt(
      "This is a caption about anxiety.",
      "Warm, avoids jargon, conversational.",
    );
    expect(prompt).toContain("This is a caption about anxiety.");
    expect(prompt).toContain("Warm, avoids jargon");
  });

  it("instructs tool use", () => {
    const prompt = buildVoiceCriticPrompt("cap", "profile");
    expect(prompt).toContain("record_voice_assessment");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/ai test`
Expected: FAIL — module not found

- [ ] **Step 3: Implement voice critic**

```typescript
// packages/ai/src/agents/voice-critic.ts
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, extractUsage } from "../client";

export type VoiceCriticResult = {
  score: number;
  passed: boolean;
  feedback: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
};

const tool: Anthropic.Tool = {
  name: "record_voice_assessment",
  description:
    "Record a voice consistency assessment for a social media caption.",
  input_schema: {
    type: "object" as const,
    properties: {
      score: {
        type: "number",
        description:
          "Voice consistency score 1–10 (1 = totally off-brand, 10 = perfect match).",
      },
      passed: {
        type: "boolean",
        description: "True when score >= 7.",
      },
      feedback: {
        type: "string",
        description:
          "One sentence of actionable feedback when score < 7, or an affirmation when >= 7.",
      },
    },
    required: ["score", "passed", "feedback"],
  },
};

export function buildVoiceCriticPrompt(
  caption: string,
  brandVoiceProfile: string,
): string {
  return `Brand voice profile:\n${brandVoiceProfile}\n\nCaption to evaluate:\n${caption}\n\nScore this caption's alignment with the brand voice using the record_voice_assessment tool.`;
}

export async function runVoiceCritic(
  caption: string,
  brandVoiceProfile: string,
): Promise<VoiceCriticResult> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    tools: [tool],
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: buildVoiceCriticPrompt(caption, brandVoiceProfile),
      },
    ],
  });

  const usage = extractUsage(response);
  const toolUse = response.content.find((b) => b.type === "tool_use");

  if (!toolUse || toolUse.type !== "tool_use") {
    return {
      score: 5,
      passed: false,
      feedback: "Assessment unavailable.",
      usage,
    };
  }

  const input = toolUse.input as {
    score: number;
    passed: boolean;
    feedback: string;
  };
  return {
    score: input.score,
    passed: input.passed,
    feedback: input.feedback,
    usage,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smm/ai test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/agents/voice-critic.ts
git commit -m "feat: add voice consistency critic agent"
```

---

### Task 5: Repurpose Agent

**Files:**

- Create: `packages/ai/src/agents/repurpose.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/ai/src/agents/__tests__/repurpose.test.ts
import { describe, it, expect } from "vitest";
import { buildRepurposePrompt } from "../repurpose";

describe("buildRepurposePrompt", () => {
  it("includes original hook", () => {
    const prompt = buildRepurposePrompt(
      "3 signs you're burning out",
      "Some caption.",
      "story",
    );
    expect(prompt).toContain("3 signs you're burning out");
  });

  it("includes target format description", () => {
    const prompt = buildRepurposePrompt("hook", "caption", "coping_skill");
    expect(prompt).toContain("coping skill");
  });

  it("requests JSON output", () => {
    const prompt = buildRepurposePrompt("h", "c", "story");
    expect(prompt).toContain("JSON");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/ai test`
Expected: FAIL

- [ ] **Step 3: Implement repurpose agent**

```typescript
// packages/ai/src/agents/repurpose.ts
import { anthropic, extractUsage } from "../client";

export type RepurposeResult = {
  hook: string;
  caption: string;
  hashtags: string[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
};

const FORMAT_DESCRIPTIONS: Record<string, string> = {
  psychoeducation:
    "educational post explaining a mental health concept in plain language",
  normalization:
    "post that normalizes a common emotional experience and reduces shame",
  coping_skill:
    "post sharing one specific, actionable coping skill with clear numbered steps",
  story:
    "brief relatable scenario (not a real client story) that illustrates a therapeutic insight",
  cta: "post inviting followers to take one small, low-stakes positive action",
};

export function buildRepurposePrompt(
  hook: string,
  caption: string,
  targetFormat: string,
): string {
  const description = FORMAT_DESCRIPTIONS[targetFormat] ?? targetFormat;
  return `Original hook: ${hook}\nOriginal caption: ${caption}\n\nRewrite this as a ${description}. Preserve the core topic but change the angle and structure to match the format. Output JSON only:\n{"hook":"...","caption":"...","hashtags":["..."]}`;
}

export async function repurposeDraft(
  hook: string,
  caption: string,
  targetFormat: string,
): Promise<RepurposeResult> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: buildRepurposePrompt(hook, caption, targetFormat),
      },
    ],
  });

  const usage = extractUsage(response);
  const rawText =
    response.content[0]?.type === "text" ? response.content[0].text : "{}";

  try {
    const parsed = JSON.parse(rawText) as {
      hook?: string;
      caption?: string;
      hashtags?: string[];
    };
    return {
      hook: parsed.hook ?? hook,
      caption: parsed.caption ?? caption,
      hashtags: parsed.hashtags ?? [],
      usage,
    };
  } catch {
    return { hook, caption, hashtags: [], usage };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smm/ai test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/agents/repurpose.ts
git commit -m "feat: add repurpose agent"
```

---

### Task 6: Calendar and Draft API Routes

**Files:**

- Create: `apps/web/app/api/v1/clients/[clientId]/calendar/route.ts`
- Create: `apps/web/app/api/v1/clients/[clientId]/drafts/route.ts`
- Create: `apps/web/app/api/v1/clients/[clientId]/drafts/[draftId]/route.ts`
- Create: `apps/web/app/api/v1/clients/[clientId]/drafts/[draftId]/repurpose/route.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/types/src/__tests__/calendar.test.ts — already passes from Task 2
// Verify schema validation edge cases:
import { describe, it, expect } from "vitest";
import { GenerateCalendarSchema } from "@smm/types/calendar";

describe("calendar API input validation", () => {
  it("rejects month > 12", () => {
    expect(
      GenerateCalendarSchema.safeParse({ month: "2026-13", topicAreas: ["x"] })
        .success,
    ).toBe(false);
  });
});
```

Run: `pnpm --filter @smm/types test`
Expected: FAIL — month "2026-13" passes the regex but test expects false

- [ ] **Step 2: Fix the month regex to reject invalid months**

Update `packages/types/src/calendar.ts`:

```typescript
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Must be YYYY-MM with valid month"),
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter @smm/types test`
Expected: PASS

- [ ] **Step 4: Create calendar route**

```typescript
// apps/web/app/api/v1/clients/[clientId]/calendar/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, drafts, calendarJobs } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq, gte, lte } from "@smm/db/rls";
import { inngestClient } from "@smm/inngest/client";
import { GenerateCalendarSchema } from "@smm/types/calendar";
import crypto from "node:crypto";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const { searchParams } = new URL(req.url);
  const month =
    searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const [year, mo] = month.split("-").map(Number) as [number, number];
  const start = new Date(year, mo - 1, 1);
  const end = new Date(year, mo, 0, 23, 59, 59);

  const rows = await db
    .select()
    .from(drafts)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.clientId, clientId),
        isNull(drafts.deletedAt),
        gte(drafts.scheduledAt, start),
        lte(drafts.scheduledAt, end),
      ),
    )
    .orderBy(drafts.scheduledAt);

  return NextResponse.json({ drafts: rows });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        isNull(clients.deletedAt),
      ),
    );
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = GenerateCalendarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { month, topicAreas, postsPerWeek } = parsed.data;

  const [job] = await db
    .insert(calendarJobs)
    .values({ workspaceId, clientId, month, topicAreas, postsPerWeek })
    .returning({ id: calendarJobs.id });

  await inngestClient.send({
    name: "calendar/generate",
    data: {
      jobId: job!.id,
      clientId,
      workspaceId,
      month,
      topicAreas,
      postsPerWeek,
    },
  });

  return NextResponse.json(
    { jobId: job!.id, status: "pending" },
    { status: 202 },
  );
}
```

- [ ] **Step 5: Create drafts list route**

```typescript
// apps/web/app/api/v1/clients/[clientId]/drafts/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { drafts } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const rows = await db
    .select()
    .from(drafts)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.clientId, clientId),
        isNull(drafts.deletedAt),
      ),
    )
    .orderBy(drafts.scheduledAt);

  return NextResponse.json({ drafts: rows });
}
```

- [ ] **Step 6: Create draft detail + PATCH route**

```typescript
// apps/web/app/api/v1/clients/[clientId]/drafts/[draftId]/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { drafts } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { z } from "zod";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; draftId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { draftId } = await params;

  const [draft] = await db
    .select()
    .from(drafts)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.id, draftId),
        isNull(drafts.deletedAt),
      ),
    );
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  return NextResponse.json({ draft });
}

const PatchDraftSchema = z.object({
  hook: z.string().min(1).optional(),
  caption: z.string().min(1).optional(),
  hashtags: z.array(z.string()).optional(),
  status: z
    .enum([
      "draft",
      "ready_for_client",
      "client_reviewing",
      "approved",
      "changes_requested",
      "scheduled",
      "published",
    ])
    .optional(),
  scheduledAt: z.string().datetime().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clientId: string; draftId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { draftId } = await params;

  const body = await req.json();
  const parsed = PatchDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.scheduledAt) {
    update.scheduledAt = new Date(parsed.data.scheduledAt);
  }

  const [updated] = await db
    .update(drafts)
    .set(update)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.id, draftId),
        isNull(drafts.deletedAt),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  return NextResponse.json({ draft: updated });
}
```

- [ ] **Step 7: Create repurpose route**

```typescript
// apps/web/app/api/v1/clients/[clientId]/drafts/[draftId]/repurpose/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { drafts, llmUsageLog } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { repurposeDraft } from "@smm/ai/agents/repurpose";
import { RepurposeSchema } from "@smm/types/calendar";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string; draftId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId, draftId } = await params;

  const [draft] = await db
    .select()
    .from(drafts)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.id, draftId),
        isNull(drafts.deletedAt),
      ),
    );
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = RepurposeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const result = await repurposeDraft(
    draft.hook,
    draft.caption,
    parsed.data.targetFormat,
  );

  await db.insert(llmUsageLog).values({
    workspaceId,
    model: "claude-haiku-4-5-20251001",
    promptTokens: result.usage.inputTokens,
    completionTokens: result.usage.outputTokens,
    cacheReadTokens: result.usage.cacheReadTokens,
    cacheWriteTokens: result.usage.cacheWriteTokens,
    callType: "repurpose",
  });

  const [newDraft] = await db
    .insert(drafts)
    .values({
      workspaceId,
      clientId,
      hook: result.hook,
      caption: result.caption,
      hashtags: result.hashtags,
      format: parsed.data.targetFormat,
      status: "draft",
      complianceApproved: false,
      requiresCrisisResources: false,
    })
    .returning();

  return NextResponse.json({ draft: newDraft }, { status: 201 });
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/api/v1/clients/
git commit -m "feat: add calendar trigger, draft list/detail/patch/repurpose API routes"
```

---

### Task 7: Calendar UI Page

**Files:**

- Create: `apps/web/app/(app)/clients/[clientId]/calendar/page.tsx`

- [ ] **Step 1: Create the calendar page**

```tsx
// apps/web/app/(app)/clients/[clientId]/calendar/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Zap } from "lucide-react";
import Link from "next/link";

type DraftRow = {
  id: string;
  hook: string;
  status: string;
  scheduledAt: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  ready_for_client: "bg-blue-100 text-blue-700",
  client_reviewing: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  changes_requested: "bg-red-100 text-red-700",
  scheduled: "bg-purple-100 text-purple-700",
  published: "bg-emerald-100 text-emerald-700",
};

function getMonthDays(month: string): Date[] {
  const [year, mo] = month.split("-").map(Number) as [number, number];
  const count = new Date(year, mo, 0).getDate();
  return Array.from({ length: count }, (_, i) => new Date(year, mo - 1, i + 1));
}

export default function CalendarPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [topics, setTopics] = useState("anxiety, burnout, boundaries");
  const [postsPerWeek, setPostsPerWeek] = useState(5);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/v1/clients/${clientId}/calendar?month=${month}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { drafts: DraftRow[] };
      setDrafts(data.drafts);
    }
    setLoading(false);
  }, [clientId, month]);

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/v1/clients/${clientId}/calendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month,
        topicAreas: topics
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        postsPerWeek,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { jobId: string };
      setJobId(data.jobId);
      setTimeout(() => {
        void fetchDrafts();
        setGenerating(false);
      }, 8000);
    } else {
      const data = (await res.json()) as { error: string };
      setError(
        typeof data.error === "string" ? data.error : "Generation failed",
      );
      setGenerating(false);
    }
  }

  const days = getMonthDays(month);
  const byDate = drafts.reduce<Record<string, DraftRow[]>>((acc, d) => {
    if (!d.scheduledAt) return acc;
    const key = d.scheduledAt.slice(0, 10);
    acc[key] = [...(acc[key] ?? []), d];
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Content Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate a full month of posts in one click.
          </p>
        </div>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-36"
        />
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <h2 className="text-sm font-medium">Generate Calendar</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48 space-y-1">
            <Label htmlFor="topics">Topics (comma-separated)</Label>
            <Input
              id="topics"
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ppw">Posts / week</Label>
            <Input
              id="ppw"
              type="number"
              min={1}
              max={7}
              value={postsPerWeek}
              onChange={(e) => setPostsPerWeek(Number(e.target.value))}
              className="w-20"
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="gap-2"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {generating ? "Generating…" : "Generate"}
          </Button>
        </div>
        {jobId && !error && (
          <p className="text-xs text-muted-foreground">
            Job {jobId.slice(0, 8)}… queued. Drafts appear as the job runs.
          </p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-7 gap-px text-xs font-medium text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="p-2 text-center">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px border rounded-md overflow-hidden bg-border">
        {Array.from({ length: days[0]!.getDay() }).map((_, i) => (
          <div key={`pad-${i}`} className="min-h-20 bg-background" />
        ))}
        {days.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const dayDrafts = byDate[key] ?? [];
          return (
            <div key={key} className="min-h-20 bg-background p-1 text-xs">
              <div className="font-medium text-muted-foreground mb-1">
                {day.getDate()}
              </div>
              {loading ? null : (
                <>
                  {dayDrafts.map((d) => (
                    <Link
                      key={d.id}
                      href={`/clients/${clientId}/drafts/${d.id}`}
                      className="block mb-0.5 truncate rounded px-1 py-0.5 hover:bg-accent"
                    >
                      <span
                        className={`mr-1 rounded px-1 ${STATUS_COLORS[d.status] ?? ""}`}
                      >
                        {d.status.replace(/_/g, " ")}
                      </span>
                      <span className="text-muted-foreground">{d.hook}</span>
                    </Link>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in dev server**

Run: `pnpm --filter @smm/web dev`
Navigate to: `/clients/[any-id]/calendar`
Verify: Month grid renders, day cells show drafts, clicking a draft navigates.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(app)/clients/[clientId]/calendar/"
git commit -m "feat: add content calendar month-view UI"
```

---

### Task 8: Draft Detail Page

**Files:**

- Create: `apps/web/app/(app)/clients/[clientId]/drafts/[draftId]/page.tsx`

- [ ] **Step 1: Create draft detail page**

```tsx
// apps/web/app/(app)/clients/[clientId]/drafts/[draftId]/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";
import Link from "next/link";

type DraftRow = {
  id: string;
  hook: string;
  caption: string;
  hashtags: string[];
  format: string | null;
  status: string;
  complianceApproved: boolean;
  scheduledAt: string | null;
};

const DRAFT_STATUSES = [
  "draft",
  "ready_for_client",
  "client_reviewing",
  "approved",
  "changes_requested",
  "scheduled",
  "published",
] as const;

const FORMATS = [
  "psychoeducation",
  "normalization",
  "coping_skill",
  "story",
  "cta",
] as const;

export default function DraftDetailPage() {
  const { clientId, draftId } = useParams<{
    clientId: string;
    draftId: string;
  }>();
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [hook, setHook] = useState("");
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState("draft");
  const [repurposeFormat, setRepurposeFormat] = useState("");
  const [saving, setSaving] = useState(false);
  const [repurposing, setRepurposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/v1/clients/${clientId}/drafts/${draftId}`);
      if (res.ok) {
        const data = (await res.json()) as { draft: DraftRow };
        setDraft(data.draft);
        setHook(data.draft.hook);
        setCaption(data.draft.caption);
        setStatus(data.draft.status);
      }
    })();
  }, [clientId, draftId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/v1/clients/${clientId}/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hook, caption, status }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      const data = (await res.json()) as { error: string };
      setError(typeof data.error === "string" ? data.error : "Save failed");
    }
    setSaving(false);
  }

  async function handleRepurpose() {
    if (!repurposeFormat) return;
    setRepurposing(true);
    const res = await fetch(
      `/api/v1/clients/${clientId}/drafts/${draftId}/repurpose`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetFormat: repurposeFormat }),
      },
    );
    if (res.ok) {
      const data = (await res.json()) as { draft: { id: string } };
      window.location.href = `/clients/${clientId}/drafts/${data.draft.id}`;
    } else {
      setError("Repurpose failed");
      setRepurposing(false);
    }
  }

  if (!draft) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}/calendar`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Calendar
          </Button>
        </Link>
        <Badge
          className={
            draft.complianceApproved
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }
        >
          {draft.complianceApproved ? "Compliant" : "Compliance review needed"}
        </Badge>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Hook</Label>
          <Textarea
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-1">
          <Label>Caption</Label>
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={8}
          />
        </div>

        <div className="space-y-1 w-56">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DRAFT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {saved && (
          <Alert>
            <AlertDescription>Saved.</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <h2 className="text-sm font-medium">Repurpose as another format</h2>
        <div className="flex gap-2">
          <Select value={repurposeFormat} onValueChange={setRepurposeFormat}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Choose format" />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleRepurpose}
            disabled={!repurposeFormat || repurposing}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {repurposing ? "Repurposing…" : "Repurpose"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in dev server**

Navigate to any draft from the calendar. Verify: hook + caption are editable, status dropdown works, repurpose creates a new draft and navigates to it.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(app)/clients/[clientId]/drafts/"
git commit -m "feat: add draft detail/edit page with repurpose panel"
```
