import { encrypt, decrypt } from "@smm/crypto";

function getKeyHex(): string {
  const hex = process.env.GOOGLE_DRIVE_TOKEN_KEY;
  if (!hex || hex.length < 64) {
    throw new Error(
      "GOOGLE_DRIVE_TOKEN_KEY must be at least 32 bytes (64 hex chars)",
    );
  }
  return hex;
}

export function encryptDriveToken(plaintext: string): string {
  return encrypt(plaintext, getKeyHex());
}

export function decryptDriveToken(ciphertext: string): string {
  return decrypt(ciphertext, getKeyHex());
}
