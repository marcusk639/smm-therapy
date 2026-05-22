import { describe, it, expect } from "vitest";
import {
  replaceBranding,
  findBrandingOccurrences,
  BRANDING_PLACEHOLDER,
} from "../../../scripts/setup/utils/branding";

describe("BRANDING_PLACEHOLDER", () => {
  it("equals 'TherapyContent'", () => {
    expect(BRANDING_PLACEHOLDER).toBe("TherapyContent");
  });
});

describe("replaceBranding", () => {
  it("replaces all occurrences of the placeholder", () => {
    const result = replaceBranding(
      "Welcome to TherapyContent! TherapyContent is great.",
      "MyBrand",
    );
    expect(result).toBe("Welcome to MyBrand! MyBrand is great.");
  });

  it("is case-sensitive — only replaces exact casing", () => {
    const result = replaceBranding("therapycontent TherapyContent", "MyBrand");
    expect(result).toBe("therapycontent MyBrand");
  });

  it("returns unchanged string when no occurrences", () => {
    expect(replaceBranding("Hello world", "MyBrand")).toBe("Hello world");
  });

  it("handles replacement with an empty brand name", () => {
    expect(replaceBranding("TherapyContent rocks", "")).toBe(" rocks");
  });

  it("returns a new string, does not mutate input", () => {
    const original = "TherapyContent";
    const result = replaceBranding(original, "NewBrand");
    expect(original).toBe("TherapyContent");
    expect(result).toBe("NewBrand");
  });
});

describe("findBrandingOccurrences", () => {
  it("returns the count of placeholder occurrences", () => {
    expect(findBrandingOccurrences("TherapyContent and TherapyContent")).toBe(
      2,
    );
  });

  it("returns 1 for a single occurrence", () => {
    expect(findBrandingOccurrences("Welcome to TherapyContent")).toBe(1);
  });

  it("returns 0 when none found", () => {
    expect(findBrandingOccurrences("no match here")).toBe(0);
  });
});
