export async function sendSmsNotification(
  to: string,
  message: string,
): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return; // SMS not configured — silently no-op

  // Dynamic import to avoid crashing if twilio is not installed
  const twilio = await import("twilio");
  const client = twilio.default(sid, token);
  await client.messages.create({ body: message, from, to });
}
