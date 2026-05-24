import { Resend } from "resend";

function getResendClient(): Resend {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendMagicLinkEmail(
  to: string,
  magicUrl: string,
  clientName: string,
): Promise<void> {
  const resend = getResendClient();
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

export async function sendReviewRequestEmail(
  to: string,
  clientName: string,
  draftsCount: number,
  reviewUrl: string,
): Promise<void> {
  const resend = getResendClient();
  await resend.emails.send({
    from: "noreply@yourdomain.com",
    to,
    subject: `Content ready for your review — ${clientName}`,
    html: `
      <p>Hi,</p>
      <p>${draftsCount} post(s) are ready for your review for <strong>${clientName}</strong>.</p>
      <p><a href="${reviewUrl}" style="background:#18181b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0;">Review Content</a></p>
    `,
  });
}

export async function sendApprovalConfirmedEmail(
  to: string,
  clientName: string,
  draftTitle: string,
): Promise<void> {
  const resend = getResendClient();
  await resend.emails.send({
    from: "noreply@yourdomain.com",
    to,
    subject: `✓ ${draftTitle} approved by ${clientName}`,
    html: `
      <p>Hi,</p>
      <p>Your draft <strong>${draftTitle}</strong> has been approved by <strong>${clientName}</strong>.</p>
    `,
  });
}

export async function sendChangesRequestedEmail(
  to: string,
  clientName: string,
  draftTitle: string,
  comment: string,
): Promise<void> {
  const resend = getResendClient();
  await resend.emails.send({
    from: "noreply@yourdomain.com",
    to,
    subject: `Changes requested on ${draftTitle}`,
    html: `
      <p>Hi,</p>
      <p><strong>${clientName}</strong> has requested changes on <strong>${draftTitle}</strong>.</p>
      <p>Their comment:</p>
      <blockquote style="border-left:3px solid #e4e4e7;padding-left:12px;color:#52525b;">${comment}</blockquote>
    `,
  });
}
