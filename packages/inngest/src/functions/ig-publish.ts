import { z } from "zod";
import { inngest } from "../client";
import { db } from "@smm/db/client";
import { drafts, draftStatusHistory, instagramTokens } from "@smm/db/schema";
import { workspaceFilter, and, eq } from "@smm/db/rls";
import { decrypt } from "@smm/crypto";
import { buildCaption } from "./ig-publish-utils";

export { buildCaption };

async function graphPost<T>(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://graph.facebook.com/v21.0${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  const data = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || (data as { error?: { message: string } }).error) {
    const errMsg =
      (data as { error?: { message: string } }).error?.message ??
      `Graph API error ${res.status}`;
    throw new Error(errMsg);
  }
  return data;
}

const eventSchema = z.object({
  draftId: z.string().uuid(),
  clientId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  imageUrl: z.string().url().optional(),
});

export const igPublish = inngest.createFunction(
  { id: "ig-publish", retries: 3 },
  { event: "instagram/publish" },
  async ({ event, step }) => {
    const { draftId, clientId, workspaceId, imageUrl } = eventSchema.parse(
      event.data,
    );

    const [draft] = await step.run("fetch-draft", () =>
      db
        .select()
        .from(drafts)
        .where(
          and(
            workspaceFilter(drafts.workspaceId, workspaceId),
            eq(drafts.id, draftId),
          ),
        ),
    );
    if (!draft) throw new Error(`Draft ${draftId} not found`);

    const [tokenRow] = await step.run("fetch-token", () =>
      db
        .select()
        .from(instagramTokens)
        .where(
          and(
            workspaceFilter(instagramTokens.workspaceId, workspaceId),
            eq(instagramTokens.clientId, clientId),
          ),
        ),
    );
    if (!tokenRow) throw new Error("Instagram not connected for this client");

    const igTokenKey = process.env.INSTAGRAM_TOKEN_KEY;
    if (!igTokenKey) throw new Error("INSTAGRAM_TOKEN_KEY is not configured");
    const accessToken = decrypt(tokenRow.encryptedToken, igTokenKey);
    const igUserId = tokenRow.igUserId;
    const caption = buildCaption(draft.hook, draft.caption, draft.hashtags);

    const { id: containerId } = await step.run("create-media-container", () =>
      graphPost<{ id: string }>(`/${igUserId}/media`, accessToken, {
        image_url: imageUrl ?? "https://placeholder.invalid/1080x1080.jpg",
        caption,
      }),
    );

    const { id: igMediaId } = await step.run("publish-media", () =>
      graphPost<{ id: string }>(`/${igUserId}/media_publish`, accessToken, {
        creation_id: containerId,
      }),
    );

    await step.run("update-draft", () =>
      db
        .update(drafts)
        .set({ status: "published", igMediaId })
        .where(
          and(
            workspaceFilter(drafts.workspaceId, workspaceId),
            eq(drafts.id, draftId),
          ),
        ),
    );

    return { ok: true, draftId, igMediaId };
  },
);
