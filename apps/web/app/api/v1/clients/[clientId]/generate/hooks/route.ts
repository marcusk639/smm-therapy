import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import {
  clients,
  brandVoices,
  generationAudit,
  llmUsageLog,
} from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { getRulesForClient, runComplianceCritic } from "@smm/compliance/engine";
import { detectCrisis } from "@smm/compliance/crisis";
import { anthropic, cachedTextBlock, extractUsage } from "@smm/ai/client";
import {
  buildHookSystemPrompt,
  buildHookUserPrompt,
} from "@smm/ai/prompts/hooks";
import { NICHE_EXAMPLES } from "@smm/ai/templates/niche-examples";
import { GenerateHooksSchema } from "@smm/types/generation";
import crypto from "node:crypto";

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
  const parsed = GenerateHooksSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { topic } = parsed.data;

  const [brandVoice] = await db
    .select()
    .from(brandVoices)
    .where(eq(brandVoices.clientId, clientId));

  const brandVoiceContext = brandVoice
    ? JSON.stringify(brandVoice.profile)
    : "Warm and professional tone. Plain vocabulary. Moderate disclosure level.";

  const systemBlocks = buildHookSystemPrompt(NICHE_EXAMPLES);
  const userPrompt = buildHookUserPrompt(topic, brandVoiceContext);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    system: systemBlocks,
    messages: [{ role: "user", content: userPrompt }],
  });

  const usage = extractUsage(response);
  const rawText =
    response.content[0]?.type === "text" ? response.content[0].text : "{}";

  let hooks: string[] = [];
  try {
    const parsedJson = JSON.parse(rawText) as { hooks?: string[] };
    hooks = parsedJson.hooks ?? [];
  } catch {
    return NextResponse.json(
      { error: "Failed to parse hook generation response" },
      { status: 500 },
    );
  }

  await db.insert(llmUsageLog).values({
    workspaceId,
    model: "claude-haiku-4-5-20251001",
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    callType: "hook_generation",
  });

  const crisisResult = await detectCrisis(topic + " " + hooks.join(" "));

  const clientCtx = {
    state: client.practiceState ?? "unknown",
    credential: client.primaryCredential ?? "Other",
  };
  const rules = await getRulesForClient(clientCtx);
  const criticResult = await runComplianceCritic(hooks.join("\n"), rules);

  await db.insert(llmUsageLog).values({
    workspaceId,
    model: "claude-haiku-4-5-20251001",
    promptTokens: criticResult.usage.inputTokens,
    completionTokens: criticResult.usage.outputTokens,
    cacheReadTokens: criticResult.usage.cacheReadTokens,
    cacheWriteTokens: criticResult.usage.cacheWriteTokens,
    callType: "compliance_critic",
  });

  const contentHash = crypto
    .createHash("sha256")
    .update(hooks.join("\n"))
    .digest("hex");

  const [auditEntry] = await db
    .insert(generationAudit)
    .values({
      workspaceId,
      clientId,
      generationType: "hooks",
      contentHash,
      rulesVersion: "1.0",
      violationsFlagged: criticResult.violations,
      approved: criticResult.approved,
    })
    .returning({ id: generationAudit.id });

  return NextResponse.json({
    hooks,
    auditId: auditEntry!.id,
    compliance: {
      violations: criticResult.violations,
      approved: criticResult.approved,
      rulesVersion: "1.0",
    },
    crisis: {
      triggered: crisisResult.triggered,
      score: crisisResult.score,
      resources: crisisResult.resources,
    },
    cacheHit: usage.cacheReadTokens > 0,
  });
}
