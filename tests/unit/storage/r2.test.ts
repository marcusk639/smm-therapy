import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://example.r2.dev/signed-url"),
}));

describe("R2 storage helpers", () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
    process.env.R2_ACCESS_KEY_ID = "test-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret";
    process.env.R2_BUCKET_NAME = "test-bucket";
  });

  it("getPresignedUploadUrl returns a URL string", async () => {
    const { getPresignedUploadUrl } =
      await import("../../../packages/storage/src/r2");
    const url = await getPresignedUploadUrl(
      "uploads/test.pdf",
      "application/pdf",
    );
    expect(typeof url).toBe("string");
    expect(url).toContain("https://");
  });

  it("getPresignedDownloadUrl returns a URL string", async () => {
    const { getPresignedDownloadUrl } =
      await import("../../../packages/storage/src/r2");
    const url = await getPresignedDownloadUrl("uploads/test.pdf");
    expect(typeof url).toBe("string");
  });
});
