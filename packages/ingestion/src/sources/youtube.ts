import { YoutubeTranscript } from "youtube-transcript";
import type { FetchResultRaw } from "./types";
import type { documents } from "@smm/db/schema";

function extractVideoId(url: string): string {
  const match = url.match(/[?&]v=([^&]+)/) ?? url.match(/youtu\.be\/([^/?]+)/);
  if (!match?.[1])
    throw new Error(`Could not extract video ID from URL: ${url}`);
  return match[1];
}

export async function fetchYoutubeUrl(
  doc: typeof documents.$inferSelect,
): Promise<FetchResultRaw> {
  if (!doc.sourceUrl) throw new Error("Document has no sourceUrl");

  const videoId = extractVideoId(doc.sourceUrl);

  let transcript: Array<{ text: string }>;
  try {
    transcript = await YoutubeTranscript.fetchTranscript(videoId);
  } catch {
    throw new Error(
      "No transcript available for this video. Upload the audio file instead.",
    );
  }

  const text = transcript.map((t) => t.text).join(" ");
  return {
    text,
    title: doc.title,
    metadata: { videoId, sourceUrl: doc.sourceUrl },
  };
}
