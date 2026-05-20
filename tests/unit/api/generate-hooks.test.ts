import { describe, it, expect } from "vitest";
import { GenerateHooksSchema } from "../../../packages/types/src/generation";

describe("GenerateHooksSchema", () => {
  it("accepts a valid topic", () => {
    const result = GenerateHooksSchema.safeParse({
      topic: "anxiety management",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a topic that is too short", () => {
    const result = GenerateHooksSchema.safeParse({ topic: "hi" });
    expect(result.success).toBe(false);
  });

  it("rejects missing topic", () => {
    const result = GenerateHooksSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
