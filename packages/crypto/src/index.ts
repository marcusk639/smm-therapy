import crypto from "node:crypto";

function hexToKey(keyHex: string): Buffer {
  if (!keyHex || keyHex.length < 64) {
    throw new Error("Encryption key must be at least 32 bytes (64 hex chars)");
  }
  return Buffer.from(keyHex.slice(0, 64), "hex");
}

export function encrypt(plaintext: string, keyHex: string): string {
  const key = hexToKey(keyHex);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decrypt(ciphertext: string, keyHex: string): string {
  const key = hexToKey(keyHex);
  const buf = Buffer.from(ciphertext, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}
