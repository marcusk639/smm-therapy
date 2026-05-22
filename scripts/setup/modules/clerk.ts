export interface ClerkWebhookResult {
  signingSecret: string;
}

export interface ClerkModuleOptions {
  secretKey: string;
  endpointUrl: string;
}

export async function setupClerkWebhook(
  opts: ClerkModuleOptions,
): Promise<ClerkWebhookResult> {
  const response = await fetch("https://api.clerk.com/v1/webhooks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: opts.endpointUrl,
      event_types: ["organization.created"],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Clerk API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as { signing_secret: string };
  return { signingSecret: data.signing_secret };
}
