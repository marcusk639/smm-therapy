import { describe, it, expect } from "vitest";
import {
  generateHexSecret,
  isValidHexSecret,
} from "../../../scripts/setup/utils/secrets";

describe("generateHexSecret", () => {
  it("returns a 64-character lowercase hex string", () => {
    const secret = generateHexSecret();
    expect(secret).toHaveLength(64);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns unique values on each call", () => {
    const a = generateHexSecret();
    const b = generateHexSecret();
    expect(a).not.toBe(b);
  });
});

describe("isValidHexSecret", () => {
  it("returns true for a valid 64-char hex string", () => {
    expect(isValidHexSecret("a".repeat(64))).toBe(true);
    expect(isValidHexSecret("0123456789abcdef".repeat(4))).toBe(true);
  });

  it("returns false when too short", () => {
    expect(isValidHexSecret("a".repeat(32))).toBe(false);
  });

  it("returns false when too long", () => {
    expect(isValidHexSecret("a".repeat(128))).toBe(false);
  });

  it("returns false for non-hex characters", () => {
    expect(isValidHexSecret("g".repeat(64))).toBe(false);
    expect(isValidHexSecret("G".repeat(64))).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidHexSecret("")).toBe(false);
  });
});
