---
paths:
  - "vitest.config.ts"
  - "packages/*/package.json"
  - "apps/*/package.json"
---

# Vitest aliases are hand-maintained

`vitest.config.ts` carries an explicit `resolve.alias` list mapping every `@smm/*` subpath export and several vendor packages to their on-disk source paths. This exists because:

1. pnpm's isolated workspaces produce module IDs that don't match `vi.mock("string")` literals consistently — the alias canonicalises the path so mocks intercept reliably.
2. `voyageai@0.2.1` ships a broken ESM build (directory import without an index file). The alias pins tests to its CJS build.
3. Some vendor packages (`unstructured-client`, `groq-sdk`, `@mozilla/readability`, …) are aliased to `packages/ingestion/node_modules/...` so mocks consistently match the resolved path inside the ingestion workspace boundary.

## Rules

- Adding a new workspace package (`packages/<new>/`) with a subpath export → add aliases for each subpath plus the bare package, longer paths first (Vite picks the first match).
- Adding a new vendor dep that gets mocked in tests → add an alias if mocks fail to intercept.
- More specific paths MUST come before shorter prefixes in the array. Putting `@smm/db` before `@smm/db/schema` will swallow the longer match.
- The aliases at the bottom (voyageai CJS pin, ingestion vendor pins) are workarounds for specific packaging bugs and pnpm-boundary issues; keep them grouped with their comment.

## Why this matters

A new package without an alias often passes typecheck but produces baffling test failures ("module not found" / mocks not intercepting / hitting real external services). The first failure in this session's verification came from this exact issue.
