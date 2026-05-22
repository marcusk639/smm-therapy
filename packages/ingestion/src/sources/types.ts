export type SourceType =
  | "file_upload"
  | "youtube_url"
  | "podcast_rss"
  | "google_drive"
  | "web_url"
  | "ig_posts";

export type FetchResult = {
  text: string;
  title: string;
  metadata: Record<string, unknown>;
};

export type UnstructuredElement = {
  type: string;
  text: string;
};

export type FetchResultRaw = FetchResult & {
  elements?: UnstructuredElement[]; // set when sourceType === file_upload (PDF)
  posts?: string[]; // set when sourceType === ig_posts
};
