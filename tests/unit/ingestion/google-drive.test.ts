import { describe, it, expect, vi } from "vitest";

const mockFilesList = vi.hoisted(() => vi.fn());
const mockFilesGet = vi.hoisted(() => vi.fn());
const mockExport = vi.hoisted(() => vi.fn());

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    drive: vi.fn().mockReturnValue({
      files: {
        list: mockFilesList,
        get: mockFilesGet,
        export: mockExport,
      },
    }),
  },
}));

import { fetchGoogleDrive } from "../../../packages/ingestion/src/sources/google-drive";

const MOCK_DOC = {
  id: "doc-1",
  knowledgeBaseId: "kb-1",
  sourceType: "google_drive" as const,
  title: "Drive Folder",
  sourceUrl: "https://drive.google.com/drive/folders/FOLDER_ID",
  r2Key: null,
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

describe("fetchGoogleDrive", () => {
  it("lists files and exports Google Docs as plain text", async () => {
    mockFilesList.mockResolvedValueOnce({
      data: {
        files: [
          {
            id: "file-1",
            name: "Anxiety Guide",
            mimeType: "application/vnd.google-apps.document",
          },
        ],
      },
    });
    mockExport.mockResolvedValueOnce({
      data: "Exported document text content here.",
    });

    const result = await fetchGoogleDrive(MOCK_DOC, "access-token-123");

    expect(result.text).toContain("Anxiety Guide");
    expect(result.text).toContain("Exported document text content here.");
  });

  it("throws if access token is missing", async () => {
    await expect(fetchGoogleDrive(MOCK_DOC, "")).rejects.toThrow(
      "Google Drive access token",
    );
  });
});
