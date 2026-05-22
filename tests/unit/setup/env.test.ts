import { describe, it, expect } from "vitest";
import {
  parseEnvFile,
  mergeEnv,
  serializeEnv,
  getEnvValue,
} from "../../../scripts/setup/utils/env";

describe("parseEnvFile", () => {
  it("parses key=value pairs", () => {
    const result = parseEnvFile("FOO=bar\nBAZ=qux");
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("ignores comment lines", () => {
    const result = parseEnvFile("# comment\nFOO=bar");
    expect(result).toEqual({ FOO: "bar" });
  });

  it("ignores blank lines", () => {
    const result = parseEnvFile("\nFOO=bar\n\n");
    expect(result).toEqual({ FOO: "bar" });
  });

  it("handles values with = signs inside them", () => {
    const result = parseEnvFile("FOO=bar=baz");
    expect(result).toEqual({ FOO: "bar=baz" });
  });

  it("strips inline comments from values", () => {
    const result = parseEnvFile("FOO=bar # inline comment");
    expect(result).toEqual({ FOO: "bar" });
  });

  it("returns empty object for empty string", () => {
    expect(parseEnvFile("")).toEqual({});
  });
});

describe("mergeEnv", () => {
  it("adds keys that do not exist in existing", () => {
    const result = mergeEnv({ FOO: "old" }, { BAR: "new" });
    expect(result).toEqual({ FOO: "old", BAR: "new" });
  });

  it("does NOT overwrite existing keys (dotenv-merge semantics)", () => {
    const result = mergeEnv({ FOO: "old" }, { FOO: "new" });
    expect(result).toEqual({ FOO: "old" });
  });

  it("adds keys with empty string value if not already present", () => {
    const result = mergeEnv({}, { FOO: "" });
    expect(result).toEqual({ FOO: "" });
  });

  it("returns a new object, does not mutate existing", () => {
    const existing = { FOO: "old" };
    const result = mergeEnv(existing, { BAR: "new" });
    expect(existing).toEqual({ FOO: "old" });
    expect(result).not.toBe(existing);
  });
});

describe("serializeEnv", () => {
  it("produces KEY=value lines", () => {
    const result = serializeEnv({ FOO: "bar", BAZ: "qux" });
    expect(result).toContain("FOO=bar");
    expect(result).toContain("BAZ=qux");
  });

  it("round-trips through parseEnvFile", () => {
    const input = { FOO: "bar", BAZ: "qux=with=equals" };
    expect(parseEnvFile(serializeEnv(input))).toEqual(input);
  });
});

describe("getEnvValue", () => {
  it("returns value when key present and non-empty", () => {
    expect(getEnvValue({ FOO: "bar" }, "FOO")).toBe("bar");
  });

  it("returns undefined when key missing", () => {
    expect(getEnvValue({}, "FOO")).toBeUndefined();
  });

  it("returns undefined when value is empty string", () => {
    expect(getEnvValue({ FOO: "" }, "FOO")).toBeUndefined();
  });
});
