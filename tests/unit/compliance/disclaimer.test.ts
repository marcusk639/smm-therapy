import { describe, it, expect, vi } from "vitest";

vi.mock("@smm/db/client", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            disclaimerText:
              "This content is for informational purposes only and does not constitute medical advice.",
          },
        ]),
      }),
    }),
  },
}));

describe("getDisclaimerFor", () => {
  it("returns a disclaimer for psychoeducation content type", async () => {
    const { getDisclaimerFor } =
      await import("../../../packages/compliance/src/disclaimer");
    const result = await getDisclaimerFor("psychoeducation", "CA");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });
});
