import { escapeHtml, renderOperationalEmailLayout } from "@/lib/email/layout";

function formatScheduledDateMMDDYYYY(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.toLowerCase() === "not available") return "Not available";

  const ymdMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    return `${ymdMatch[2]}-${ymdMatch[3]}-${ymdMatch[1]}`;
  }

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    const year = String(parsed.getFullYear());
    return `${month}-${day}-${year}`;
  }

  return normalized;
}

function resolveSafeEmailLogoUrl(rawUrl: string | null | undefined) {
  const normalized = String(rawUrl ?? "").trim();
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildSupportContactLine(args: {
  supportDisplayName: string;
  supportPhone: string | null;
  supportEmail: string | null;
}) {
  const phone = String(args.supportPhone ?? "").trim();
  const email = String(args.supportEmail ?? "").trim();
  if (phone && email) {
    return `Need to make changes? Contact ${args.supportDisplayName} at ${phone} or ${email}.`;
  }
  if (phone) {
    return `Need to make changes? Contact ${args.supportDisplayName} at ${phone}.`;
  }
  if (email) {
    return `Need to make changes? Contact ${args.supportDisplayName} at ${email}.`;
  }
  return `Need to make changes? Contact ${args.supportDisplayName}.`;
}

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
  const safeLogoUrl = resolveSafeEmailLogoUrl(args.companyLogoUrl);
  const supportDisplayName = String(args.supportDisplayName ?? "").trim() || "Compliance Matters";
  const serviceCompany = String(args.companyName ?? "").trim() || supportDisplayName;
  const scheduledDateDisplay = formatScheduledDateMMDDYYYY(args.scheduledDate);
  const supportLine = buildSupportContactLine({
    supportDisplayName,
    supportPhone: args.supportPhone,
    supportEmail: args.supportEmail,
  });

  return `
    <div style="margin: 0; padding: 0; background: #f3f6fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin: 0; padding: 24px 12px;">
        <tr>
          <td align="center" style="padding: 0;">
            <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width: 100%; max-width: 640px; border-collapse: collapse; border: 1px solid #dbe4f0; border-radius: 16px; overflow: hidden; background: #ffffff; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);">
              <tr>
                <td style="padding: 18px 20px 10px 20px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);">
                  <div style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #1d4ed8; font-weight: 700; margin: 0 0 8px 0;">Appointment Scheduled</div>
                  ${safeLogoUrl
                    ? `<img src="${escapeHtml(safeLogoUrl)}" alt="" width="180" height="56" style="display: block; max-width: 180px; max-height: 56px; width: auto; height: auto; object-fit: contain; border: 0; outline: none; text-decoration: none;" />`
                    : `<div style="font-size: 22px; line-height: 1.2; font-weight: 700; color: #0f172a;">${escapeHtml(supportDisplayName)}</div>`}
                </td>
              </tr>
              <tr>
                <td style="padding: 18px 20px 0 20px;">
                  <h1 style="margin: 0; font-size: 24px; line-height: 1.25; color: #0f172a;">Your appointment is scheduled</h1>
                  <p style="margin: 10px 0 0 0; font-size: 15px; line-height: 1.6; color: #334155;">Hi ${escapeHtml(args.customerName)}, your service appointment has been scheduled.</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 16px 20px 0 20px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #dbe4f0; border-radius: 12px; overflow: hidden; background: #f8fbff;">
                    <tr>
                      <td colspan="2" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; font-weight: 700; border-bottom: 1px solid #dbe4f0;">Appointment Summary</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 12px; font-size: 13px; color: #475569;">Scheduled Date</td>
                      <td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(scheduledDateDisplay)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 12px; font-size: 13px; color: #475569;">Time Window</td>
                      <td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(args.scheduledWindow)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 12px; font-size: 13px; color: #475569;">Service Address</td>
                      <td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(args.serviceAddress)}</td>
                    </tr>
                    ${args.serviceType ? `<tr><td style="padding: 8px 12px; font-size: 13px; color: #475569;">Service Type</td><td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(args.serviceType)}</td></tr>` : ""}
                    <tr>
                      <td style="padding: 8px 12px; font-size: 13px; color: #475569;">Service Company</td>
                      <td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(serviceCompany)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 16px 20px 20px 20px;">
                  <p style="margin: 0 0 10px 0; font-size: 14px; line-height: 1.6; color: #334155;">Please make sure someone can provide access to the service location during the scheduled time window.</p>
                  <p style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.6; color: #334155;">${escapeHtml(supportLine)}</p>
                  <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94a3b8;">This is an automated message from ${escapeHtml(supportDisplayName)}.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
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