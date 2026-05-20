import { describe, it, expect } from "vitest";
import { CreateClientSchema } from "../../../packages/types/src/client";

describe("CreateClientSchema", () => {
  it("accepts valid client data", () => {
    const result = CreateClientSchema.safeParse({
      name: "Therapy & Co",
      slug: "therapy-co",
      practiceState: "CA",
      primaryCredential: "LCSW",
    });
    expect(result.success).toBe(true);
  });

  it("rejects slug with spaces", () => {
    const result = CreateClientSchema.safeParse({
      name: "Therapy Co",
      slug: "therapy co",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = CreateClientSchema.safeParse({
      name: "",
      slug: "valid-slug",
    });
    expect(result.success).toBe(false);
  });
});
