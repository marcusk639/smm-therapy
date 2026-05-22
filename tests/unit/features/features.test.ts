import { describe, it, expect } from "vitest";
import {
  canUseFeature,
  clientLimit,
  isWithinClientLimit,
} from "../../../packages/features/src/index";

describe("canUseFeature", () => {
  it("starter cannot use calendar_generation", () => {
    expect(canUseFeature("starter", "calendar_generation")).toBe(false);
  });

  it("growth can use calendar_generation", () => {
    expect(canUseFeature("growth", "calendar_generation")).toBe(true);
  });

  it("agency can use meta_publishing", () => {
    expect(canUseFeature("agency", "meta_publishing")).toBe(true);
  });

  it("growth cannot use meta_publishing", () => {
    expect(canUseFeature("growth", "meta_publishing")).toBe(false);
  });
});

describe("clientLimit", () => {
  it("starter is capped at 1", () => {
    expect(clientLimit("starter")).toBe(1);
  });

  it("agency is unlimited (-1)", () => {
    expect(clientLimit("agency")).toBe(-1);
  });
});

describe("isWithinClientLimit", () => {
  it("allows agency with many clients", () => {
    expect(isWithinClientLimit("agency", 100)).toBe(true);
  });

  it("blocks starter at second client", () => {
    expect(isWithinClientLimit("starter", 1)).toBe(false);
  });
});
