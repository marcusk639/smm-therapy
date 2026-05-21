import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendMagicLinkEmail(
  to: string,
  magicUrl: string,
  clientName: string,
): Promise<void> {
  await resend.emails.send({
    from: "noreply@yourdomain.com",
    to,
    subject: `Review content for ${clientName}`,
    html: `
      <p>Hi,</p>
      <p>You've been invited to review social media content for <strong>${clientName}</strong>.</p>
      <p><a href="${magicUrl}" style="background:#18181b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0;">Review Content</a></p>
      <p>This link expires in 15 minutes and can only be used once.</p>
    `,
  });
}
