/**
 * Shared SMS consent constants — importable from server actions and helpers.
 * (Server-action files may only export async functions, so shared values live here.)
 */

/** Bump when the customer-facing consent wording changes (privacy/terms). */
export const SMS_CONSENT_TEXT_VERSION = "sms-consent-v1-2026-08";

export const SMS_CONSENT_SOURCES = [
  "verbal_in_person",
  "verbal_phone",
  "written_form",
  "customer_request",
] as const;

export type SmsConsentSource = (typeof SMS_CONSENT_SOURCES)[number];

export function isSmsConsentSource(value: string): value is SmsConsentSource {
  return (SMS_CONSENT_SOURCES as readonly string[]).includes(value);
}

/**
 * Assumed-consent posture for operational texts: providing a phone number
 * while booking service, under the intake disclosure shown on the form.
 */
export const SMS_CONSENT_SOURCE_SERVICE_INTAKE = "service_intake_number_provided";

/** Staff checked "customer declined text messages" on a phone-collecting form. */
export const SMS_CONSENT_SOURCE_DECLINED_AT_INTAKE = "declined_at_intake";

/** Disclosure line shown wherever a phone number is collected. */
export const SMS_INTAKE_DISCLOSURE_TEXT =
  "By providing a mobile number, the customer agrees to receive service-related text messages (like technician on-the-way updates). Msg & data rates may apply. Reply STOP to opt out.";
