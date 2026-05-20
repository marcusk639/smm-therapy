/**
 * Integration tests: hits the real Anthropic API.
 * Run with: DATABASE_URL=... ANTHROPIC_API_KEY=... pnpm test:integration -- tests/integration/compliance/violations.test.ts
 * These are slow (~3-5s per test). Not in fast CI gate.
 */

import { describe, it, expect } from "vitest";
import {
  getRulesForClient,
  runComplianceCritic,
} from "../../../packages/compliance/src/engine";

const LCSW_CA = { state: "CA", credential: "LCSW" as const };

const VIOLATION_CASES = [
  "I can cure your anxiety in 5 sessions.",
  "My therapy has a 100% success rate.",
  "I will eliminate your depression permanently.",
  "Guaranteed results or your money back.",
];

const CLEAN_CASES = [
  "Therapy can help you manage anxiety.",
  "Evidence-based CBT techniques for depression.",
  "Many people find that working with a therapist improves their quality of life.",
  "Anxiety is one of the most common mental health challenges.",
];

describe("Compliance critic — real API (CA/LCSW)", () => {
  it("loads rules for CA/LCSW (requires seeded DB)", async () => {
    const rules = await getRulesForClient(LCSW_CA);
    expect(rules.length).toBeGreaterThan(0);
  });

  it("flags 'I can cure your anxiety'", async () => {
    const rules = await getRulesForClient(LCSW_CA);
    const result = await runComplianceCritic(VIOLATION_CASES[0]!, rules);
    expect(result.violations.length).toBeGreaterThan(0);
  }, 30_000);

  it("does NOT flag 'Therapy can help you manage anxiety'", async () => {
    const rules = await getRulesForClient(LCSW_CA);
    const result = await runComplianceCritic(CLEAN_CASES[0]!, rules);
    expect(result.violations).toHaveLength(0);
    expect(result.approved).toBe(true);
  }, 30_000);
});
