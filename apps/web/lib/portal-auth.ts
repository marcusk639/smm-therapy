import { cookies } from "next/headers";
import {
  generateMagicToken,
  hashToken,
  encryptCookie,
  decryptCookie,
} from "./portal-crypto";

export { generateMagicToken, hashToken, encryptCookie, decryptCookie };

export async function getPortalSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get("portal_session")?.value;
  if (!value) return null;
  const payload = decryptCookie(value);
  if (!payload) return null;
  const maxAge = 24 * 60 * 60 * 1000;
  if (Date.now() - payload.issuedAt > maxAge) return null;
  return payload.clientId;
}
