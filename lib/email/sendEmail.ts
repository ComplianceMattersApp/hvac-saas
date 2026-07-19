import { Resend } from "resend";

type SendEmailArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
};

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

function requireResendApiKey() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  return apiKey;
}

function resolveFromAddress() {
  const configured = String(process.env.EMAIL_FROM ?? "").trim();
  if (configured) return configured;
  return "Compliance Matters <reports@mail.compliancemattersca.com>";
}

export async function sendEmail({ to, subject, html, text, attachments }: SendEmailArgs) {
  const resend = new Resend(requireResendApiKey());
  const recipients = Array.isArray(to) ? to : [to];

  const result = await resend.emails.send({
    from: resolveFromAddress(),
    to: recipients,
    subject,
    html,
    ...(typeof text === "string" && text.trim().length > 0 ? { text } : {}),
    ...(attachments?.length
      ? {
          attachments: attachments.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content,
          })),
        }
      : {}),
  });

  if (result.error) {
    throw new Error(result.error.message || "Failed to send email via Resend");
  }

  return result;
}
