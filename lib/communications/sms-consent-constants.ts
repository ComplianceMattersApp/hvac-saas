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
