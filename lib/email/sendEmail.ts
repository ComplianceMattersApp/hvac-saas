import { Resend } from "resend";

type SendEmailArgs = {
  to: string | string[];
  subject: string;
  html: string;
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

export async function sendEmail({ to, subject, html }: SendEmailArgs) {
  const resend = new Resend(requireResendApiKey());
  const recipients = Array.isArray(to) ? to : [to];

  const result = await resend.emails.send({
    from: resolveFromAddress(),
    to: recipients,
    subject,
    html,
  });

  if (result.error) {
    throw new Error(result.error.message || "Failed to send email via Resend");
  }

  return result;
}
