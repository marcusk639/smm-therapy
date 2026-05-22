import { randomBytes } from "crypto";

export function generateHexSecret(): string {
  return randomBytes(32).toString("hex");
}

export function isValidHexSecret(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
