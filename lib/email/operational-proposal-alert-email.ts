import { escapeHtml, renderOperationalEmailLayout } from "@/lib/email/layout";

type InternalProposalAlertEmailArgs = {
  contractorName: string;
  customerName: string;
  proposedAddress: string;
  serviceType: string;
  submittedAtText: string;
  proposalUrl: string | null;
  proposalTitle?: string | null;
  proposalNotes?: string | null;
  companyDisplayName: string;
  companyLogoUrl: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
};

export function buildInternalProposalAlertEmailHtml(args: InternalProposalAlertEmailArgs) {
  const proposalTitle = String(args.proposalTitle ?? "").trim();
  const proposalNotes = String(args.proposalNotes ?? "").trim();

  const detailRows = [
    `<tr><td style="padding: 8px 12px; font-size: 13px; color: #475569;">Submitted By</td><td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(args.contractorName)}</td></tr>`,
    `<tr><td style="padding: 8px 12px; font-size: 13px; color: #475569;">Customer</td><td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(args.customerName)}</td></tr>`,
    `<tr><td style="padding: 8px 12px; font-size: 13px; color: #475569;">Location</td><td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(args.proposedAddress)}</td></tr>`,
    `<tr><td style="padding: 8px 12px; font-size: 13px; color: #475569;">Service/Test Type</td><td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(args.serviceType)}</td></tr>`,
    `<tr><td style="padding: 8px 12px; font-size: 13px; color: #475569;">Submitted</td><td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(args.submittedAtText)}</td></tr>`,
  ];

  if (proposalTitle) {
    detailRows.push(
      `<tr><td style="padding: 8px 12px; font-size: 13px; color: #475569;">Proposal Title</td><td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(proposalTitle)}</td></tr>`,
    );
  }

  const notesBlock = proposalNotes
    ? `
      <div style="margin: 12px 0 0 0; border: 1px solid #dbe4f0; border-radius: 10px; background: #f8fbff; padding: 12px;">
        <div style="margin: 0 0 6px 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; font-weight: 700;">Submitted Notes</div>
        <div style="margin: 0; font-size: 14px; line-height: 1.6; color: #0f172a; white-space: pre-wrap;">${escapeHtml(proposalNotes)}</div>
      </div>
    `
    : "";

  const ctaBlock = args.proposalUrl
    ? `
      <div style="margin: 14px 0 2px 0;">
        <a href="${escapeHtml(args.proposalUrl)}" style="display: inline-block; border-radius: 8px; background: #1d4ed8; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 10px 14px;">Review Proposal in Compliance Matters</a>
      </div>
      <div style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">If the button does not open, use this link: <a href="${escapeHtml(args.proposalUrl)}">${escapeHtml(args.proposalUrl)}</a></div>
    `
    : "";

  return renderOperationalEmailLayout({
    title: "New job proposal submitted",
    companyDisplayName: args.companyDisplayName,
    companyLogoUrl: args.companyLogoUrl,
    supportPhone: args.supportPhone,
    supportEmail: args.supportEmail,
    bodyHtml: `
      <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6; color: #334155;">A new job proposal was submitted through the portal and is ready for internal review.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #dbe4f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
        <tr>
          <td colspan="2" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; font-weight: 700; border-bottom: 1px solid #dbe4f0;">Review Context</td>
        </tr>
        ${detailRows.join("")}
      </table>
      ${notesBlock}
      ${ctaBlock}
      <p style="margin: 14px 0 0 0; font-size: 13px; line-height: 1.6; color: #475569;">This proposal is pending internal review and has not been approved, scheduled, or finalized.</p>
    `,
  });
}
