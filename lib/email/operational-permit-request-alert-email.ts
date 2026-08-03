import { escapeHtml, renderOperationalEmailLayout } from "@/lib/email/layout";

type InternalPermitRequestAlertEmailArgs = {
  contractorName: string;
  referenceCode: string;
  attachmentCount: number;
  submittedAtText: string;
  contractorNote: string | null;
  permitQueueUrl: string | null;
  companyDisplayName: string;
  companyLogoUrl: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
};

function detailRow(label: string, value: string) {
  return `<tr><td style="padding: 8px 12px; font-size: 13px; color: #475569;">${escapeHtml(label)}</td><td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(value)}</td></tr>`;
}

export function buildInternalPermitRequestAlertEmailHtml(
  args: InternalPermitRequestAlertEmailArgs,
) {
  const contractorNote = String(args.contractorNote ?? "").trim();
  const fileLabel = `${args.attachmentCount} ${args.attachmentCount === 1 ? "file" : "files"}`;

  const detailRows = [
    detailRow("Submitted By", args.contractorName),
    detailRow("Reference", args.referenceCode),
    detailRow("Documents", fileLabel),
    detailRow("Submitted", args.submittedAtText),
  ];

  // The contractor's note is where the customer, address, and scope actually
  // arrive on this surface — never truncate it in the alert.
  const noteBlock = contractorNote
    ? `
      <div style="margin: 12px 0 0 0; border: 1px solid #dbe4f0; border-radius: 10px; background: #f8fbff; padding: 12px;">
        <div style="margin: 0 0 6px 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; font-weight: 700;">Contractor Note</div>
        <div style="margin: 0; font-size: 14px; line-height: 1.6; color: #0f172a; white-space: pre-wrap;">${escapeHtml(contractorNote)}</div>
      </div>
    `
    : "";

  const ctaBlock = args.permitQueueUrl
    ? `
      <div style="margin: 14px 0 2px 0;">
        <a href="${escapeHtml(args.permitQueueUrl)}" style="display: inline-block; border-radius: 8px; background: #1d4ed8; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 10px 14px;">Open Permit Queue</a>
      </div>
      <div style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">If the button does not open, use this link: <a href="${escapeHtml(args.permitQueueUrl)}">${escapeHtml(args.permitQueueUrl)}</a></div>
    `
    : "";

  return renderOperationalEmailLayout({
    title: "New permit request submitted",
    companyDisplayName: args.companyDisplayName,
    companyLogoUrl: args.companyLogoUrl,
    supportPhone: args.supportPhone,
    supportEmail: args.supportEmail,
    bodyHtml: `
      <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6; color: #334155;">A contractor sent a permit request through the portal. It is waiting in the permit queue.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #dbe4f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
        <tr>
          <td colspan="2" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; font-weight: 700; border-bottom: 1px solid #dbe4f0;">Request Context</td>
        </tr>
        ${detailRows.join("")}
      </table>
      ${noteBlock}
      ${ctaBlock}
      <p style="margin: 14px 0 0 0; font-size: 13px; line-height: 1.6; color: #475569;">The uploaded documents are attached to the request in the permit queue.</p>
    `,
  });
}
