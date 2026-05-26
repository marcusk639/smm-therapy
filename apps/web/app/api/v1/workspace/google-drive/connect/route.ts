import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { buildOAuthState } from "./oauth-state";

const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"].join(" ");

export async function GET(req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const { searchParams } = new URL(req.url);
  const returnTo = searchParams.get("returnTo") ?? "/";

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !baseUrl) {
    return NextResponse.json(
      {
        error:
          "Google Drive OAuth is not configured. GOOGLE_DRIVE_CLIENT_ID and NEXT_PUBLIC_APP_URL must be set.",
      },
      { status: 500 },
    );
  }

  const redirectUri = `${baseUrl}/api/v1/workspace/google-drive/callback`;
  const state = buildOAuthState(workspaceId, returnTo);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}
