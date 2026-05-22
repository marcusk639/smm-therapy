import { UnstructuredClient } from "unstructured-client";
import Groq from "groq-sdk";
import { getPresignedDownloadUrl } from "@smm/storage/r2";
import type { FetchResultRaw, UnstructuredElement } from "./types";
import type { documents } from "@smm/db/schema";

const PDF_EXTENSIONS = [".pdf"];
const AUDIO_EXTENSIONS = [".mp3", ".mp4", ".wav", ".m4a", ".ogg"];

function getExtension(key: string): string {
  const idx = key.lastIndexOf(".");
  return idx === -1 ? "" : key.slice(idx).toLowerCase();
}

async function downloadFromR2(r2Key: string): Promise<Buffer> {
  const url = await getPresignedDownloadUrl(r2Key, 300);
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`R2 download failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function parseWithUnstructured(
  buffer: Buffer,
  fileName: string,
): Promise<UnstructuredElement[]> {
  if (buffer.length > 50 * 1024 * 1024) {
    throw new Error(
      "File exceeds 50MB limit. Try re-exporting as a smaller PDF.",
    );
  }

  const client = new UnstructuredClient({
    serverURL: process.env.UNSTRUCTURED_API_URL!,
  });

  const response = await client.general.partition({
    partitionParameters: {
      files: { content: buffer, fileName },
      strategy: "hi_res",
    },
  });

  return (response.elements ?? []).map((el: Record<string, unknown>) => ({
    type: (el.type as string) ?? "NarrativeText",
    text: ((el.text as string) ?? "").trim(),
  }));
}

async function transcribeWithGroq(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
  // Groq SDK accepts any FileLike; Blob+name works in Node 18 where File is unavailable
  const file = Object.assign(new Blob([buffer]), { name: fileName });
  const result = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3",
    language: "en",
  });
  return result.text;
}

export async function fetchFileUpload(
  doc: typeof documents.$inferSelect,
): Promise<FetchResultRaw> {
  if (!doc.r2Key) throw new Error("Document has no r2Key");

  const ext = getExtension(doc.r2Key);
  const fileName = doc.r2Key.split("/").pop() ?? "file";
  const buffer = await downloadFromR2(doc.r2Key);

  if (PDF_EXTENSIONS.includes(ext)) {
    const elements = await parseWithUnstructured(buffer, fileName);
    return {
      text: elements.map((e) => e.text).join("\n"),
      title: doc.title,
      metadata: {},
      elements,
    };
  }

  if (AUDIO_EXTENSIONS.includes(ext)) {
    const text = await transcribeWithGroq(buffer, fileName);
    return { text, title: doc.title, metadata: { transcribed: true } };
  }

  // Plain text fallback
  return { text: buffer.toString("utf-8"), title: doc.title, metadata: {} };
}
