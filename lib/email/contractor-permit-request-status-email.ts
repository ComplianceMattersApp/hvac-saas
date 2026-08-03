import { escapeHtml, renderOperationalEmailLayout } from "@/lib/email/layout";

type ContractorPermitRequestStatusEmailArgs = {
  headline: string;
  message: string;
  statusLabel: string;
  referenceCode: string;
  requestSummary: string | null;
  permitNumber: string | null;
  nextStep: string | null;
  portalUrl: string | null;
  companyDisplayName: string;
  companyLogoUrl: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
};

function detailRow(label: string, value: string) {
  return `<tr><td style="padding: 8px 12px; font-size: 13px; color: #475569;">${escapeHtml(label)}</td><td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(value)}</td></tr>`;
}

export function buildContractorPermitRequestStatusEmailHtml(
  args: ContractorPermitRequestStatusEmailArgs,
) {
  const detailRows = [
    detailRow("Reference", args.referenceCode),
    detailRow("Status", args.statusLabel),
  ];

  if (args.requestSummary) {
    detailRows.push(detailRow("Request", args.requestSummary));
  }

  if (args.permitNumber) {
    detailRows.push(detailRow("Permit Number", args.permitNumber));
  }

  const nextStepBlock = args.nextStep
    ? `
      <div style="margin: 12px 0 0 0; border: 1px solid #dbe4f0; border-radius: 10px; background: #f8fbff; padding: 12px;">
        <div style="margin: 0 0 6px 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; font-weight: 700;">What Happens Next</div>
        <div style="margin: 0; font-size: 14px; line-height: 1.6; color: #0f172a;">${escapeHtml(args.nextStep)}</div>
      </div>
    `
    : "";

  const ctaBlock = args.portalUrl
    ? `
      <div style="margin: 14px 0 2px 0;">
        <a href="${escapeHtml(args.portalUrl)}" style="display: inline-block; border-radius: 8px; background: #1d4ed8; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 10px 14px;">View Your Permit Requests</a>
      </div>
      <div style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">If the button does not open, use this link: <a href="${escapeHtml(args.portalUrl)}">${escapeHtml(args.portalUrl)}</a></div>
    `
    : "";

  return renderOperationalEmailLayout({
    title: args.headline,
    companyDisplayName: args.companyDisplayName,
    companyLogoUrl: args.companyLogoUrl,
    supportPhone: args.supportPhone,
    supportEmail: args.supportEmail,
    bodyHtml: `
      <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6; color: #334155;">${escapeHtml(args.message)}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #dbe4f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
        <tr>
          <td colspan="2" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; font-weight: 700; border-bottom: 1px solid #dbe4f0;">Permit Request</td>
        </tr>
        ${detailRows.join("")}
      </table>
      ${nextStepBlock}
      ${ctaBlock}
    `,
  });
}
