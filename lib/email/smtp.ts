import nodemailer from "nodemailer";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export function getSmtpTransport() {
  const host = requireEnv("RESEND_SMTP_HOST");
  const port = Number(requireEnv("RESEND_SMTP_PORT"));
  const user = requireEnv("RESEND_SMTP_USER");
  const pass = requireEnv("RESEND_SMTP_PASS");

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL, 587 = STARTTLS
    auth: { user, pass },
  });
}

export async function sendInviteEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const from = requireEnv("EMAIL_FROM");
  const transporter = getSmtpTransport();

  await transporter.sendMail({
    from,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
  });
}