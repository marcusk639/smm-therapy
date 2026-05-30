import crypto from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

type StatePayload = {
  workspaceId: string;
  returnTo: string;
  nonce: string;
  issuedAt: number;
};

function getStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("OAUTH_STATE_SECRET must be set and at least 32 chars");
  }
  return secret;
}

function sign(data: string): string {
  return crypto
    .createHmac("sha256", getStateSecret())
    .update(data)
    .digest("base64url");
}

/**
 * Constrains returnTo to a relative path on the current origin to prevent
 * open redirects. Anything that doesn't start with "/" (and isn't a
 * protocol-relative "//") falls back to "/".
 */
export function safeReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) return "/";
  if (!returnTo.startsWith("/")) return "/";
  if (returnTo.startsWith("//")) return "/";
  return returnTo;
}

export function buildOAuthState(workspaceId: string, returnTo: string): string {
  const payload: StatePayload = {
    workspaceId,
    returnTo,
    nonce: crypto.randomBytes(16).toString("hex"),
    issuedAt: Date.now(),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function parseOAuthState(state: string): StatePayload | null {
  try {
    const dot = state.lastIndexOf(".");
    if (dot <= 0) return null;
    const data = state.slice(0, dot);
    const sig = state.slice(dot + 1);
    const expected = sign(data);
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expected, "base64url");
    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }
    const decoded = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8"),
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
