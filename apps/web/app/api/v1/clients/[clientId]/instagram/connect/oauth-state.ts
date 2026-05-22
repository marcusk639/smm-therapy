export function buildOAuthState(clientId: string, workspaceId: string): string {
  return Buffer.from(JSON.stringify({ clientId, workspaceId })).toString(
    "base64url",
  );
}

export function parseOAuthState(
  state: string,
): { clientId: string; workspaceId: string } | null {
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      clientId: string;
      workspaceId: string;
    };
  } catch {
    return null;
  }
}
