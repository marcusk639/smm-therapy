import { describe, it, expect, vi } from "vitest";

const mockGetPresigned = vi.hoisted(() => vi.fn());
const mockPartition = vi.hoisted(() => vi.fn());
const mockGroqCreate = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());
const mockFetchTranscript = vi.hoisted(() => vi.fn());
const mockRssParser = vi.hoisted(() => ({ parseURL: vi.fn() }));
const mockReadability = vi.hoisted(() => ({ parse: vi.fn() }));

vi.mock("@smm/storage/r2", () => ({
  getPresignedDownloadUrl: mockGetPresigned,
}));
vi.mock("unstructured-client", () => ({
  UnstructuredClient: vi.fn().mockImplementation(() => ({
    general: { partition: mockPartition },
  })),
}));
vi.mock("groq-sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: mockGroqCreate } },
  })),
  toFile: vi.fn(async (buffer: Buffer, name: string) => ({ buffer, name })),
}));
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: mockFetchTranscript },
}));
vi.mock("rss-parser", () => ({
  default: vi.fn().mockImplementation(() => mockRssParser),
}));
vi.mock("@mozilla/readability", () => ({
  Readability: vi.fn().mockImplementation(() => mockReadability),
}));
vi.mock("linkedom", () => ({
  parseHTML: vi.fn().mockReturnValue({ document: {} }),
}));
global.fetch = mockFetch as typeof fetch;

import { fetchFileUpload } from "../../../packages/ingestion/src/sources/file-upload";
import { fetchYoutubeUrl } from "../../../packages/ingestion/src/sources/youtube";
import { fetchPodcastRss } from "../../../packages/ingestion/src/sources/podcast-rss";
import { fetchWebUrl } from "../../../packages/ingestion/src/sources/web-url";
import {
  parseIgPosts,
  fetchIgPosts,
} from "../../../packages/ingestion/src/sources/ig-posts";

const MOCK_DOC = {
  id: "doc-1",
  knowledgeBaseId: "kb-1",
  sourceType: "file_upload" as const,
  title: "Test PDF",
  sourceUrl: null,
  r2Key: "uploads/doc-1.pdf",
  rawText: null as string | null,
  status: "pending" as const,
  failedStage: null,
  failedReason: null,
  rightsConfirmed: true,
  rightsConfirmedAt: null,
  rightsConfirmedBy: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("fetchFileUpload — PDF", () => {
  it("fetches from R2, sends to Unstructured, returns elements", async () => {
    mockGetPresigned.mockResolvedValueOnce("https://r2.example.com/signed");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    mockPartition.mockResolvedValueOnce({
      elements: [
        { type: "Title", text: "Section One" },
        { type: "NarrativeText", text: "Body text here." },
      ],
    });

    const result = await fetchFileUpload({
      ...MOCK_DOC,
      r2Key: "uploads/doc-1.pdf",
    });

    expect(result.title).toBe("Test PDF");
    expect(result.elements).toHaveLength(2);
    expect(result.elements![0]!.type).toBe("Title");
  });
});

describe("fetchFileUpload — audio (mp3)", () => {
  it("sends to Groq Whisper and returns transcript text", async () => {
    mockGetPresigned.mockResolvedValueOnce("https://r2.example.com/signed");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    mockGroqCreate.mockResolvedValueOnce({ text: "Transcribed audio text." });

    const result = await fetchFileUpload({
      ...MOCK_DOC,
      r2Key: "uploads/episode.mp3",
    });

    expect(result.text).toBe("Transcribed audio text.");
    expect(result.elements).toBeUndefined();
    expect(result.metadata.transcribed).toBe(true);
  });
});

describe("fetchYoutubeUrl", () => {
  it("extracts transcript and joins into text", async () => {
    mockFetchTranscript.mockResolvedValueOnce([
      { text: "Hello and welcome.", offset: 0, duration: 3 },
      { text: "Today we discuss anxiety.", offset: 3, duration: 4 },
    ]);

    const result = await fetchYoutubeUrl({
      ...MOCK_DOC,
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      r2Key: null,
    });

    expect(result.text).toContain("Hello and welcome.");
    expect(result.text).toContain("Today we discuss anxiety.");
    expect(result.title).toBe("Test PDF");
  });

  it("throws a helpful error when no transcript is available", async () => {
    mockFetchTranscript.mockRejectedValueOnce(new Error("No transcript found"));

    await expect(
      fetchYoutubeUrl({
        ...MOCK_DOC,
        sourceUrl: "https://www.youtube.com/watch?v=abc",
        r2Key: null,
      }),
    ).rejects.toThrow("No transcript available");
  });
});

describe("fetchPodcastRss", () => {
  it("parses the feed and returns episode titles + descriptions as text", async () => {
    mockRssParser.parseURL.mockResolvedValueOnce({
      title: "Mental Health Podcast",
      items: [
        {
          title: "Ep 1: Anxiety",
          contentSnippet: "We discuss anxiety management.",
        },
        { title: "Ep 2: Burnout", contentSnippet: "Signs of burnout." },
      ],
    });

    const result = await fetchPodcastRss({
      ...MOCK_DOC,
      sourceUrl: "https://example.com/feed.xml",
      r2Key: null,
    });

    expect(result.text).toContain("Ep 1: Anxiety");
    expect(result.text).toContain("We discuss anxiety management.");
  });

  it("throws on invalid RSS feed URL", async () => {
    mockRssParser.parseURL.mockRejectedValueOnce(new Error("404"));
    await expect(
      fetchPodcastRss({
        ...MOCK_DOC,
        sourceUrl: "https://broken.example.com/feed.xml",
        r2Key: null,
      }),
    ).rejects.toThrow("Feed URL is unreachable or invalid");
  });
});

describe("fetchWebUrl", () => {
  it("extracts article text via Readability", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        "<html><body><p>Article content here.</p></body></html>",
    });
    mockReadability.parse.mockReturnValueOnce({
      title: "Article Title",
      textContent: "Article content here.",
    });

    const result = await fetchWebUrl({
      ...MOCK_DOC,
      sourceUrl: "https://example.com/article",
      r2Key: null,
    });

    expect(result.text).toContain("Article content here.");
    expect(result.title).toBe("Article Title");
  });
});

describe("parseIgPosts", () => {
  it("splits pasted content on triple-dash separator", () => {
    const raw = "Post one text here.\n---\nPost two text here.";
    const result = parseIgPosts(raw);
    expect(result.posts).toHaveLength(2);
    expect(result.posts![0]).toBe("Post one text here.");
  });

  it("filters out posts shorter than 10 characters", () => {
    const raw =
      "Short.\n---\nThis is a proper length post that should be kept.";
    const result = parseIgPosts(raw);
    expect(result.posts).toHaveLength(1);
  });
});

describe("fetchIgPosts", () => {
  it("reads doc.rawText and returns parsed posts", async () => {
    const result = await fetchIgPosts({
      ...MOCK_DOC,
      sourceType: "ig_posts" as const,
      rawText:
        "First Instagram caption.\n---\nSecond Instagram caption goes here.",
      title: "My IG Backlog",
    });
    expect(result.posts).toHaveLength(2);
    expect(result.title).toBe("My IG Backlog");
  });

  it("throws a helpful error when rawText is missing", async () => {
    await expect(
      fetchIgPosts({
        ...MOCK_DOC,
        sourceType: "ig_posts" as const,
        rawText: null,
      }),
    ).rejects.toThrow("has no rawText");
  });
});
