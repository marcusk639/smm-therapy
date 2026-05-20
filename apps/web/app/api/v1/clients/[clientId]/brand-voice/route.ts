import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, brandVoices, llmUsageLog } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { anthropic, extractUsage } from "@smm/ai/client";
import {
  buildBrandVoiceSystemPrompt,
  buildBrandVoiceUserPrompt,
} from "@smm/ai/prompts/brand-voice";
import {
  ExtractBrandVoiceSchema,
  BrandVoiceProfileSchema,
} from "@smm/types/generation";
import crypto from "node:crypto";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const [client] = await db
    .select({ id: clients.id })
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

  const [profile] = await db
    .select()
    .from(brandVoices)
    .where(eq(brandVoices.clientId, clientId));

  return NextResponse.json({ brandVoice: profile ?? null });
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
    .select({ id: clients.id })
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
  const parsed = ExtractBrandVoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { samplePosts } = parsed.data;

  const systemBlocks = buildBrandVoiceSystemPrompt();
  const userPrompt = buildBrandVoiceUserPrompt(samplePosts);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    system: systemBlocks,
    messages: [{ role: "user", content: userPrompt }],
  });

  const usage = extractUsage(response);
  const rawText =
    response.content[0]?.type === "text" ? response.content[0].text : "{}";

  let profileData: unknown;
  try {
    profileData = JSON.parse(rawText);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse brand voice response" },
      { status: 500 },
    );
  }

  const profileParsed = BrandVoiceProfileSchema.safeParse(profileData);
  if (!profileParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid brand voice profile structure",
        details: profileParsed.error.flatten(),
      },
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
    callType: "brand_voice_extraction",
  });

  const sampleHash = crypto
    .createHash("sha256")
    .update(samplePosts.join("\n"))
    .digest("hex");

  const [saved] = await db
    .insert(brandVoices)
    .values({
      clientId,
      workspaceId,
      profile: profileParsed.data,
      sampleContentHash: sampleHash,
    })
    .onConflictDoUpdate({
      target: brandVoices.clientId,
      set: {
        profile: profileParsed.data,
        sampleContentHash: sampleHash,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ brandVoice: saved });
}
