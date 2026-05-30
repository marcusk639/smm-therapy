import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { db } from "@smm/db/client";
import { documents, knowledgeBases } from "@smm/db/schema";
import { getDriveAccessToken } from "./google-drive-token";
import type { FetchResultRaw } from "./types";

const EXPORTABLE_MIMES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
};

function extractFolderId(url: string): string {
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!match?.[1])
    throw new Error(`Could not extract folder ID from URL: ${url}`);
  return match[1];
}

async function getWorkspaceIdForDoc(
  doc: typeof documents.$inferSelect,
): Promise<string> {
  const [kb] = await db
    .select({ workspaceId: knowledgeBases.workspaceId })
    .from(knowledgeBases)
    .where(eq(knowledgeBases.id, doc.knowledgeBaseId));
  if (!kb?.workspaceId) {
    throw new Error(
      "Google Drive document's knowledge base has no workspace — cannot load access token.",
    );
  }
  return kb.workspaceId;
}

export async function fetchGoogleDrive(
  doc: typeof documents.$inferSelect,
): Promise<FetchResultRaw> {
  if (!doc.sourceUrl) throw new Error("Document has no sourceUrl");

  const workspaceId = await getWorkspaceIdForDoc(doc);
  const accessToken = await getDriveAccessToken(workspaceId);

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  );
  auth.setCredentials({ access_token: accessToken });

  const drive = google.drive({ version: "v3", auth });
  const folderId = extractFolderId(doc.sourceUrl);

  type DriveFile = { id: string; name: string; mimeType: string };
  const files: DriveFile[] = [];
  try {
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType)",
        pageSize: 1000,
        pageToken,
      });
      files.push(...((res.data.files ?? []) as DriveFile[]));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch {
    throw new Error(
      "Access to this folder was removed. Re-connect Google Drive in workspace settings.",
    );
  }

  const textParts: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const exportMime = EXPORTABLE_MIMES[file.mimeType];
    if (!exportMime) continue;

    try {
      const exported = await drive.files.export({
        fileId: file.id,
        mimeType: exportMime,
      });
      const content = exported.data;
      if (typeof content !== "string") {
        skipped.push(file.name);
        continue;
      }
      textParts.push(`# ${file.name}\n\n${content}`);
    } catch {
      skipped.push(file.name);
    }
  }

  if (textParts.length === 0 && files.length > 0) {
    throw new Error(
      `No files in this Google Drive folder could be exported (${files.length} files found, ${skipped.length} skipped). Check folder contents and sharing permissions.`,
    );
  }

  return {
    text: textParts.join("\n\n---\n\n"),
    title: doc.title,
    metadata: {
      folderId,
      fileCount: files.length,
      exportedCount: textParts.length,
      skippedFiles: skipped,
    },
  };
}
