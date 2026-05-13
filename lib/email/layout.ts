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
  return `${appUrl}/cm-logo.png`;
}

export function renderSystemEmailLayout(args: {
  title?: string | null;
  bodyHtml: string;
  logoWidthPx?: number;
  centerHeader?: boolean;
  logoMarginBottomPx?: number;
  titleMarginBottomPx?: number;
}) {
  const title = String(args.title ?? "").trim();
  const logoUrl = resolveLogoUrl();
  const logoWidthPx = Number.isFinite(Number(args.logoWidthPx))
    ? Math.max(48, Math.min(260, Number(args.logoWidthPx)))
    : 220;
  const centerHeader = Boolean(args.centerHeader);
  const logoMarginBottomPx = Number.isFinite(Number(args.logoMarginBottomPx))
    ? Math.max(0, Math.min(40, Number(args.logoMarginBottomPx)))
    : 16;
  const titleMarginBottomPx = Number.isFinite(Number(args.titleMarginBottomPx))
    ? Math.max(0, Math.min(40, Number(args.titleMarginBottomPx)))
    : 12;
  const headerAlign = centerHeader ? "center" : "left";

  const logoBlock = logoUrl
    ? `<div style="margin-bottom: ${logoMarginBottomPx}px; text-align: ${headerAlign};"><img src="${escapeHtml(logoUrl)}" alt="Compliance Matters logo" width="${logoWidthPx}" height="${logoWidthPx}" style="width: ${logoWidthPx}px; max-width: 100%; height: auto; display: inline-block;" /></div>`
    : "";

  const titleBlock = title
    ? `<h2 style="margin: 0 0 ${titleMarginBottomPx}px 0; font-size: 20px; line-height: 1.3; color: #111827; text-align: ${headerAlign};">${escapeHtml(title)}</h2>`
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

export function renderOperationalEmailLayout(args: {
  title?: string | null;
  bodyHtml: string;
  companyDisplayName?: string | null;
  companyLogoUrl?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
}) {
  const title = String(args.title ?? "").trim();
  const companyDisplayName = String(args.companyDisplayName ?? "").trim() || "Compliance Matters";
  const companyLogoUrl = String(args.companyLogoUrl ?? "").trim() || null;
  const supportEmail = String(args.supportEmail ?? "").trim() || null;
  const supportPhone = String(args.supportPhone ?? "").trim() || null;
  const supportDetails = [supportEmail, supportPhone].filter(Boolean).join(" • ");

  const headerBlock = companyLogoUrl
    ? `<div style="margin-bottom: 16px; text-align: left;"><img src="${escapeHtml(companyLogoUrl)}" alt="${escapeHtml(companyDisplayName)} logo" width="220" height="220" style="width: 220px; max-width: 100%; height: auto; display: inline-block;" /></div>`
    : `<div style="margin: 0 0 16px 0; font-size: 24px; line-height: 1.2; font-weight: 700; color: #111827;">${escapeHtml(companyDisplayName)}</div>`;

  const titleBlock = title
    ? `<h2 style="margin: 0 0 12px 0; font-size: 20px; line-height: 1.3; color: #111827;">${escapeHtml(title)}</h2>`
    : "";

  const supportBlock = supportDetails
    ? `<p style="margin: 6px 0 0 0; color: #4b5563; font-size: 13px;">Questions or changes: ${escapeHtml(supportDetails)}</p>`
    : "";

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827; max-width: 640px;">
      ${headerBlock}
      ${titleBlock}
      <div>${args.bodyHtml}</div>
      <p style="margin-top: 20px; color: #4b5563; font-size: 13px;">
        This is an automated message from ${escapeHtml(companyDisplayName)}.
      </p>
      ${supportBlock}
    </div>
  `;
}
