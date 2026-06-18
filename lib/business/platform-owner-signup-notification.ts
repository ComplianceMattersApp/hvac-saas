import type { ProductMode } from "@/lib/business/product-mode-defaults";
import { resolvePlatformOwnerSignupNotificationRecipient } from "@/lib/business/platform-owner-access";
import { sendEmail } from "@/lib/email/sendEmail";

type SignupPath = "generic" | "service" | "ecc" | "cleaning";

export type PlatformOwnerSignupNotificationInput = {
  companyName: string;
  ownerEmail: string;
  ownerDisplayName: string | null;
  signupPath: SignupPath;
  productMode: ProductMode | null;
  billingMode: string | null;
  entitlementStatus: string | null;
  planKey: string | null;
  accountOwnerUserId: string | null;
  inviteStatus: string;
  timestampIso: string;
  env?: NodeJS.ProcessEnv;
};

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function signupPathLabel(path: SignupPath) {
  if (path === "service") return "/signup/service";
  if (path === "ecc") return "/signup/ecc";
  if (path === "cleaning") return "/signup/cleaning";
  return "/signup";
}

function formatNullable(value: unknown) {
  const normalized = toCleanString(value);
  return normalized || "null";
}

function buildNotificationText(input: PlatformOwnerSignupNotificationInput) {
  return [
    "New account signup observed (best-effort notification).",
    "",
    `Company: ${formatNullable(input.companyName)}`,
    `Owner email: ${formatNullable(input.ownerEmail)}`,
    `Owner display name: ${formatNullable(input.ownerDisplayName)}`,
    `Signup path: ${signupPathLabel(input.signupPath)}`,
    `Product mode: ${formatNullable(input.productMode)}`,
    `Billing mode: ${formatNullable(input.billingMode)}`,
    `Plan key: ${formatNullable(input.planKey)}`,
    `Entitlement status: ${formatNullable(input.entitlementStatus)}`,
    `Account owner user id: ${formatNullable(input.accountOwnerUserId)}`,
    `Invite status: ${formatNullable(input.inviteStatus)}`,
    `Timestamp: ${formatNullable(input.timestampIso)}`,
  ].join("\n");
}

function buildNotificationHtml(input: PlatformOwnerSignupNotificationInput) {
  const rows: Array<[string, string]> = [
    ["Company", formatNullable(input.companyName)],
    ["Owner email", formatNullable(input.ownerEmail)],
    ["Owner display name", formatNullable(input.ownerDisplayName)],
    ["Signup path", signupPathLabel(input.signupPath)],
    ["Product mode", formatNullable(input.productMode)],
    ["Billing mode", formatNullable(input.billingMode)],
    ["Plan key", formatNullable(input.planKey)],
    ["Entitlement status", formatNullable(input.entitlementStatus)],
    ["Account owner user id", formatNullable(input.accountOwnerUserId)],
    ["Invite status", formatNullable(input.inviteStatus)],
    ["Timestamp", formatNullable(input.timestampIso)],
  ];

  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:6px 10px;border:1px solid #e2e8f0;background:#f8fafc;">${label}</th><td style="padding:6px 10px;border:1px solid #e2e8f0;">${value}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <body style="font-family:Arial,sans-serif;color:#0f172a;padding:16px;">
    <p style="margin:0 0 12px;font-size:14px;">New account signup observed (best-effort notification).</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">${tableRows}</table>
  </body>
</html>`;
}

export async function sendPlatformOwnerSignupNotification(
  input: PlatformOwnerSignupNotificationInput,
) {
  const recipient = resolvePlatformOwnerSignupNotificationRecipient(input.env);
  if (!recipient) {
    return { sent: false, recipient: null };
  }

  const subject = `New signup: ${toCleanString(input.companyName) || "Unknown company"}`;

  await sendEmail({
    to: recipient,
    subject,
    html: buildNotificationHtml(input),
    text: buildNotificationText(input),
  });

  return { sent: true, recipient };
}
