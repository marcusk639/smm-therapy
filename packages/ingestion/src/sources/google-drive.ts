import { google } from "googleapis";
import type { FetchResultRaw } from "./types";
import type { documents } from "@smm/db/schema";

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

export async function fetchGoogleDrive(
  doc: typeof documents.$inferSelect,
  accessToken: string,
): Promise<FetchResultRaw> {
  if (!accessToken) {
    throw new Error(
      "Google Drive access token is required. Re-connect Google Drive in workspace settings.",
    );
  }
  if (!doc.sourceUrl) throw new Error("Document has no sourceUrl");

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  );
  auth.setCredentials({ access_token: accessToken });

  const drive = google.drive({ version: "v3", auth });
  const folderId = extractFolderId(doc.sourceUrl);

  let files: Array<{ id: string; name: string; mimeType: string }>;
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType)",
    });
    files = (res.data.files ?? []) as typeof files;
  } catch {
    throw new Error(
      "Access to this folder was removed. Re-connect Google Drive in workspace settings.",
    );
  }

  const textParts: string[] = [];

  for (const file of files) {
    const exportMime = EXPORTABLE_MIMES[file.mimeType];
    if (!exportMime) continue;

    const exported = await drive.files.export({
      fileId: file.id,
      mimeType: exportMime,
    });

    textParts.push(`# ${file.name}\n\n${exported.data as string}`);
  }

  return {
    text: textParts.join("\n\n---\n\n"),
    title: doc.title,
    metadata: { folderId, fileCount: files.length },
  };
}
