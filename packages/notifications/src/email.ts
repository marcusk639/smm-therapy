import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not configured. Set it in your environment before calling any email helper.",
    );
  }
  resendClient = new Resend(key);
  return resendClient;
}

function getFromAddress(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error(
      "EMAIL_FROM is not configured. Set it to your verified Resend sender (e.g. 'noreply@yourdomain.com').",
    );
  }
  return from;
}

function safeUrl(url: string): string {
  if (!url.startsWith("https://")) {
    throw new Error(`Unsafe URL rejected — must begin with https://: ${url}`);
  }
  return url;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Attachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

type SendEmailOpts = {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Attachment[];
  /** Override the default From address. Rarely needed. */
  from?: string;
};

/**
 * Send an email via Resend. `from` defaults to the EMAIL_FROM env var.
 * Use this rather than instantiating Resend directly so we have a single
 * place for sender config + (future) outbound logging.
 */
export async function sendEmail(opts: SendEmailOpts): Promise<void> {
  const resend = getResendClient();
  await resend.emails.send({
    from: opts.from ?? getFromAddress(),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.attachments ? { attachments: opts.attachments } : {}),
  });
}

export async function sendMagicLinkEmail(
  to: string,
  magicUrl: string,
  clientName: string,
): Promise<void> {
  const safeName = escapeHtml(clientName);
  await sendEmail({
    to,
    subject: `Review content for ${clientName}`,
    html: `
      <p>Hi,</p>
      <p>You've been invited to review social media content for <strong>${safeName}</strong>.</p>
      <p><a href="${safeUrl(magicUrl)}" style="background:#18181b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0;">Review Content</a></p>
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
  const safeName = escapeHtml(clientName);
  await sendEmail({
    to,
    subject: `Content ready for your review — ${clientName}`,
    html: `
      <p>Hi,</p>
      <p>${draftsCount} post(s) are ready for your review for <strong>${safeName}</strong>.</p>
      <p><a href="${safeUrl(reviewUrl)}" style="background:#18181b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0;">Review Content</a></p>
    `,
  });
}

export async function sendApprovalConfirmedEmail(
  to: string,
  clientName: string,
  draftTitle: string,
): Promise<void> {
  const safeName = escapeHtml(clientName);
  const safeTitle = escapeHtml(draftTitle);
  await sendEmail({
    to,
    subject: `✓ ${draftTitle} approved by ${clientName}`,
    html: `
      <p>Hi,</p>
      <p>Your draft <strong>${safeTitle}</strong> has been approved by <strong>${safeName}</strong>.</p>
    `,
  });
}

export async function sendChangesRequestedEmail(
  to: string,
  clientName: string,
  draftTitle: string,
  comment: string,
): Promise<void> {
  const safeName = escapeHtml(clientName);
  const safeTitle = escapeHtml(draftTitle);
  const safeComment = escapeHtml(comment);
  await sendEmail({
    to,
    subject: `Changes requested on ${draftTitle}`,
    html: `
      <p>Hi,</p>
      <p><strong>${safeName}</strong> has requested changes on <strong>${safeTitle}</strong>.</p>
      <p>Their comment:</p>
      <blockquote style="border-left:3px solid #e4e4e7;padding-left:12px;color:#52525b;">${safeComment}</blockquote>
    `,
  });
}
