export function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function resolveAppUrl() {
  const raw = String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

function resolveLogoUrl() {
  const appUrl = resolveAppUrl();
  if (!appUrl) return null;
  return `${appUrl}/CM%20Logo-white.png`;
}

export function renderSystemEmailLayout(args: { title?: string | null; bodyHtml: string }) {
  const title = String(args.title ?? "").trim();
  const logoUrl = resolveLogoUrl();

  const logoBlock = logoUrl
    ? `<div style="margin-bottom: 16px;"><img src="${escapeHtml(logoUrl)}" alt="Compliance Matters" style="max-width: 220px; height: auto; display: block;" /></div>`
    : "";

  const titleBlock = title
    ? `<h2 style="margin: 0 0 12px 0; font-size: 20px; line-height: 1.3; color: #111827;">${escapeHtml(title)}</h2>`
    : "";

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827; max-width: 640px;">
      ${logoBlock}
      ${titleBlock}
      <div>${args.bodyHtml}</div>
      <p style="margin-top: 20px; color: #4b5563; font-size: 13px;">
        This is an automated message from Compliance Matters. For questions or changes, please contact us directly.
      </p>
    </div>
  `;
}
