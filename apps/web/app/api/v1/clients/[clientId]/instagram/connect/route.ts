import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { buildOAuthState } from "./oauth-state";

const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "pages_show_list",
].join(",");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const appId = process.env.IG_APP_ID!;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const redirectUri = encodeURIComponent(
    `${baseUrl}/api/v1/clients/${clientId}/instagram/callback`,
  );
  const state = buildOAuthState(clientId, workspaceId);

  const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${SCOPES}&state=${state}&response_type=code`;

  return NextResponse.redirect(url);
}
