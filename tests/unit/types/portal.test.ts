import { describe, it, expect } from "vitest";
import {
  MagicLinkSchema,
  CommentSchema,
} from "../../../packages/types/src/portal";

describe("MagicLinkSchema", () => {
  it("requires valid email", () => {
    expect(
      MagicLinkSchema.safeParse({ email: "bad", clientSlug: "slug" }).success,
    ).toBe(false);
    expect(
      MagicLinkSchema.safeParse({
        email: "a@b.com",
        clientSlug: "slug",
      }).success,
    ).toBe(true);
  });

  it("requires non-empty clientSlug", () => {
    expect(
      MagicLinkSchema.safeParse({ email: "a@b.com", clientSlug: "" }).success,
    ).toBe(false);
  });
});

describe("CommentSchema", () => {
  it("requires non-empty body", () => {
    expect(CommentSchema.safeParse({ body: "" }).success).toBe(false);
    expect(CommentSchema.safeParse({ body: "hello" }).success).toBe(true);
  });

  it("rejects body over 2000 chars", () => {
    expect(CommentSchema.safeParse({ body: "a".repeat(2001) }).success).toBe(
      false,
    );
  });

  it("accepts optional valid uuid parentId", () => {
    expect(
      CommentSchema.safeParse({
        body: "text",
        parentId: "00000000-0000-0000-0000-000000000000",
      }).success,
    ).toBe(true);
    expect(
      CommentSchema.safeParse({ body: "text", parentId: "not-a-uuid" }).success,
    ).toBe(false);
  });
});
