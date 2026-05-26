---
paths:
  - "apps/web/lib/*-crypto.ts"
  - "apps/web/app/api/**/instagram/**/route.ts"
  - "apps/web/app/api/**/google-drive/**/route.ts"
  - "packages/ingestion/src/sources/*-token.ts"
  - "packages/db/src/schema/instagram.ts"
  - "packages/db/src/schema/workspace-integrations.ts"
---

# OAuth tokens are encrypted at rest with per-provider keys

`packages/crypto/src/index.ts` exposes `encrypt(plaintext, keyHex)` and `decrypt(ciphertext, keyHex)` using AES-256-GCM with a 96-bit random IV and 128-bit auth tag, packed as `iv | tag | ciphertext` and base64url-encoded.

## Required pattern

Never call `@smm/crypto` directly from a route or fetcher. Use the per-provider wrapper in `apps/web/lib/`:

- Instagram tokens → `encryptToken` / `decryptToken` from `@/lib/ig-crypto` (env key: `INSTAGRAM_TOKEN_KEY`).
- Google Drive tokens → `encryptDriveToken` / `decryptDriveToken` from `@/lib/drive-crypto` (env key: `GOOGLE_DRIVE_TOKEN_KEY`).

The token loader for Drive (`packages/ingestion/src/sources/google-drive-token.ts`) uses `@smm/crypto` directly because it runs server-side outside Next.js; it reads its key from `process.env.GOOGLE_DRIVE_TOKEN_KEY` itself.

## Rules

- Adding a new OAuth provider must add a new wrapper module (`apps/web/lib/<provider>-crypto.ts`) and a new env key. Do not reuse another provider's key.
- Env keys must be at least 32 bytes (64 hex chars). The wrapper validates length and throws on startup misconfig.
- Store both `encryptedAccessToken` (always) and `encryptedRefreshToken` (when the provider returns one).
- Refresh-token retention quirk: Google only returns `refresh_token` on first consent. On reconnect, preserve the existing encrypted refresh token unless a new one is received.

## Why this matters

A single shared key means rotating one provider rotates all. Per-provider keys keep blast radius small and let each provider be rotated independently.
