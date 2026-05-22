import { encrypt, decrypt } from "@smm/crypto";

function getKeyHex(): string {
  const hex = process.env.INSTAGRAM_TOKEN_KEY;
  if (!hex || hex.length < 64) {
    throw new Error(
      "INSTAGRAM_TOKEN_KEY must be at least 32 bytes (64 hex chars)",
    );
  }
  return hex;
}

export function encryptToken(plaintext: string): string {
  return encrypt(plaintext, getKeyHex());
}

export function decryptToken(ciphertext: string): string {
  return decrypt(ciphertext, getKeyHex());
}
