import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, brandVoices, llmUsageLog } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { getRulesForClient, runComplianceCritic } from "@smm/compliance/engine";
import { getDisclaimerFor, appendDisclaimer } from "@smm/compliance/disclaimer";
import { anthropic, extractUsage } from "@smm/ai/client";
import { buildCaptionSystemPrompt } from "@smm/ai/prompts/captions";
import { buildCaptionUserPrompt } from "@smm/ai/prompts/hooks";
import { retrieve } from "@smm/rag/retrieve";
import { buildCitations } from "@smm/rag/citations";
import { GenerateCaptionsSchema } from "@smm/types/generation";

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
  const parsed = GenerateCaptionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { selectedHook, topic, formats } = parsed.data;

  const [brandVoice] = await db
    .select()
    .from(brandVoices)
    .where(eq(brandVoices.clientId, clientId));

  const brandVoiceContext = brandVoice
    ? JSON.stringify(brandVoice.profile)
    : "Warm and professional. Plain vocabulary. Moderate disclosure.";

  const clientState = client.practiceState ?? null;

  const ragResult = await retrieve(`${topic} ${selectedHook}`, {
    clientId,
    workspaceId,
  }).catch(() => ({ chunks: [], contextText: "" }));
  const citations = buildCitations(ragResult.chunks);

  const systemBlocks = buildCaptionSystemPrompt("");
  const clientCtx = {
    state: client.practiceState ?? "unknown",
    credential: client.primaryCredential ?? "Other",
  };
  const rules = await getRulesForClient(clientCtx);

  const captionResults = await Promise.all(
    formats.map(async (format) => {
      const userPrompt = buildCaptionUserPrompt(
        topic,
        selectedHook,
        format,
        brandVoiceContext,
        clientState,
        ragResult.contextText || undefined,
      );

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: systemBlocks,
        messages: [{ role: "user", content: userPrompt }],
      });

      const usage = extractUsage(response);
      const rawText =
        response.content[0]?.type === "text" ? response.content[0].text : "{}";

      let caption = "";
      let hashtags: string[] = [];
      try {
        const parsedJson = JSON.parse(rawText) as {
          caption?: string;
          hashtags?: string[];
        };
        caption = parsedJson.caption ?? "";
        hashtags = parsedJson.hashtags ?? [];
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
        callType: "caption_generation",
      });

      const criticResult = await runComplianceCritic(caption, rules);

      await db.insert(llmUsageLog).values({
        workspaceId,
        model: "claude-haiku-4-5-20251001",
        promptTokens: criticResult.usage.inputTokens,
        completionTokens: criticResult.usage.outputTokens,
        cacheReadTokens: criticResult.usage.cacheReadTokens,
        cacheWriteTokens: criticResult.usage.cacheWriteTokens,
        callType: "compliance_critic",
      });

      const disclaimer = await getDisclaimerFor(format, clientState);
      const finalCaption = appendDisclaimer(caption, disclaimer);

      return {
        format,
        caption: finalCaption,
        hashtags,
        compliance: {
          violations: criticResult.violations,
          approved: criticResult.approved,
        },
        cacheHit: usage.cacheReadTokens > 0,
      };
    }),
  );

  return NextResponse.json({ captions: captionResults, citations });
}
