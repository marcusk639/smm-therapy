import crypto from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

type StatePayload = {
  workspaceId: string;
  returnTo: string;
  nonce: string;
  issuedAt: number;
};

export function buildOAuthState(workspaceId: string, returnTo: string): string {
  const payload: StatePayload = {
    workspaceId,
    returnTo,
    nonce: crypto.randomBytes(16).toString("hex"),
    issuedAt: Date.now(),
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function parseOAuthState(state: string): StatePayload | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as StatePayload;
    if (
      typeof decoded.workspaceId !== "string" ||
      typeof decoded.returnTo !== "string" ||
      typeof decoded.issuedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - decoded.issuedAt > STATE_TTL_MS) return null;
    return decoded;
  } catch {
    return null;
  }
}
