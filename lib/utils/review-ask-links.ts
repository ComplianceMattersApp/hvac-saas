/**
 * Builds device-intent mailto: and sms: hrefs for the Google review ask.
 * Both use encodeURIComponent for body content.
 * Returns null for a link if the required recipient field is missing.
 */

export interface ReviewAskLinkParams {
  customerFirstName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  googleReviewUrl: string;
  businessName: string;
}

export interface ReviewAskLinks {
  mailtoHref: string | null;
  smsHref: string | null;
}

export function buildReviewAskLinks(params: ReviewAskLinkParams): ReviewAskLinks {
  const {
    customerFirstName,
    customerEmail,
    customerPhone,
    googleReviewUrl,
    businessName,
  } = params;

  const firstName = customerFirstName?.trim() || null;
  const greeting = firstName ? `Hi ${firstName}` : "Hi there";

  const emailSubject = encodeURIComponent(
    `Thank you for choosing ${businessName}!`
  );
  const emailBody = encodeURIComponent(
    `${greeting}, thank you for having us out today. If you had a great experience, ` +
    `we'd really appreciate a quick Google review — it helps other homeowners find us.\n\n` +
    `${googleReviewUrl}\n\nThank you,\n${businessName}`
  );

  const smsBody = encodeURIComponent(
    `${greeting}, thanks for having us out! If you had a great experience, ` +
    `we'd love a quick Google review: ${googleReviewUrl} — ${businessName}`
  );

  const phone = customerPhone?.replace(/\D/g, "") ?? "";

  return {
    mailtoHref: customerEmail?.trim()
      ? `mailto:${customerEmail.trim()}?subject=${emailSubject}&body=${emailBody}`
      : null,
    smsHref: phone.length >= 10
      ? `sms:${phone}?body=${smsBody}`
      : null,
  };
}
