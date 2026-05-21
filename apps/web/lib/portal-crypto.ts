import crypto from "node:crypto";

function getSecret(): Buffer {
  const hex = process.env.PORTAL_SECRET;
  if (!hex || hex.length < 64) {
    throw new Error("PORTAL_SECRET must be at least 32 bytes (64 hex chars)");
  }
  return Buffer.from(hex.slice(0, 64), "hex");
}

export function generateMagicToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  return { rawToken, tokenHash: hashToken(rawToken) };
}

export function hashToken(rawToken: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(rawToken)
    .digest("hex");
}

export function encryptCookie(payload: {
  clientId: string;
  issuedAt: number;
}): string {
  const key = getSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const json = JSON.stringify(payload);
  const enc = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptCookie(
  value: string,
): { clientId: string; issuedAt: number } | null {
  try {
    const key = getSecret();
    const buf = Buffer.from(value, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString("utf8")) as {
      clientId: string;
      issuedAt: number;
    };
  } catch {
    return null;
  }
}
