import { escapeHtml, renderOperationalEmailLayout } from "@/lib/email/layout";

export function buildCustomerScheduledEmailHtml(args: {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string;
  serviceAddress: string;
  scheduledDate: string;
  scheduledWindow: string;
  serviceType: string | null;
  companyName: string | null;
  supportDisplayName: string;
  companyLogoUrl: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
}) {
  const details: string[] = [
    `<li><strong>Customer:</strong> ${escapeHtml(args.customerName)}</li>`,
    `<li><strong>Service Address:</strong> ${escapeHtml(args.serviceAddress)}</li>`,
    `<li><strong>Scheduled Date:</strong> ${escapeHtml(args.scheduledDate)}</li>`,
    `<li><strong>Time Window:</strong> ${escapeHtml(args.scheduledWindow)}</li>`,
  ];

  if (args.serviceType) {
    details.push(`<li><strong>Service Type:</strong> ${escapeHtml(args.serviceType)}</li>`);
  }

  if (args.companyName) {
    details.push(`<li><strong>Service Company:</strong> ${escapeHtml(args.companyName)}</li>`);
  }

  details.push(`<li><strong>Customer Email:</strong> ${escapeHtml(args.customerEmail)}</li>`);

  if (args.customerPhone) {
    details.push(`<li><strong>Customer Phone:</strong> ${escapeHtml(args.customerPhone)}</li>`);
  }

  const supportDetails = [args.supportPhone, args.supportEmail].filter(Boolean).join(" • ");
  const supportLine = supportDetails
    ? `${escapeHtml(args.supportDisplayName)} (${escapeHtml(supportDetails)})`
    : escapeHtml(args.supportDisplayName);

  return renderOperationalEmailLayout({
    title: "Your Job Is Scheduled",
    companyDisplayName: args.supportDisplayName,
    companyLogoUrl: args.companyLogoUrl,
    supportEmail: args.supportEmail,
    supportPhone: args.supportPhone,
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Your upcoming service has been scheduled.</p>
      <ul style="margin: 0 0 12px 20px; padding: 0;">${details.join("")}</ul>
      <p style="margin: 0 0 12px 0;">Please ensure someone can provide access to the service location during the scheduled time window.</p>
      <p style="margin: 0;">If you need to make changes, please contact ${supportLine} as soon as possible.</p>
    `,
  });
}

export function buildContractorScheduledEmailHtml(args: {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  serviceAddress: string;
  scheduledDate: string;
  scheduledWindow: string;
  serviceType: string | null;
  permitNumber: string | null;
  portalJobUrl: string | null;
  companyName: string | null;
  supportDisplayName: string;
  companyLogoUrl: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
}) {
  const details: string[] = [
    `<li><strong>Customer:</strong> ${escapeHtml(args.customerName)}</li>`,
    `<li><strong>Service Address:</strong> ${escapeHtml(args.serviceAddress)}</li>`,
    `<li><strong>Scheduled Date:</strong> ${escapeHtml(args.scheduledDate)}</li>`,
    `<li><strong>Time Window:</strong> ${escapeHtml(args.scheduledWindow)}</li>`,
  ];

  if (args.customerPhone) {
    details.push(`<li><strong>Customer Phone:</strong> ${escapeHtml(args.customerPhone)}</li>`);
  }

  if (args.customerEmail) {
    details.push(`<li><strong>Customer Email:</strong> ${escapeHtml(args.customerEmail)}</li>`);
  }

  if (args.serviceType) {
    details.push(`<li><strong>Service Type:</strong> ${escapeHtml(args.serviceType)}</li>`);
  }

  if (args.companyName) {
    details.push(`<li><strong>Company:</strong> ${escapeHtml(args.companyName)}</li>`);
  }

  if (args.permitNumber) {
    details.push(`<li><strong>Permit Number:</strong> ${escapeHtml(args.permitNumber)}</li>`);
  }

  const portalSection = args.portalJobUrl
    ? `<p style="margin: 0 0 12px 0;">Portal Job Link: <a href="${escapeHtml(args.portalJobUrl)}">${escapeHtml(args.portalJobUrl)}</a></p>`
    : "";

  return renderOperationalEmailLayout({
    title: `${args.supportDisplayName} Schedule`,
    companyDisplayName: args.supportDisplayName,
    companyLogoUrl: args.companyLogoUrl,
    supportEmail: args.supportEmail,
    supportPhone: args.supportPhone,
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">A job has been scheduled or updated.</p>
      <ul style="margin: 0 0 12px 20px; padding: 0;">${details.join("")}</ul>
      <p style="margin: 0 0 12px 0;">Please ensure someone can provide access to the property and equipment if needed.</p>
      ${portalSection}
      <p style="margin: 0;">For questions or changes, please contact us directly.</p>
    `,
  });
}