/**
 * SMS consent provisioning at customer creation — server-only, best-effort.
 *
 * Posture (owner decision, Aug 2026): providing a phone number while booking
 * service constitutes prior express consent for OPERATIONAL service texts
 * (on_the_way class) under the intake disclosure shown on phone-collecting
 * forms. No explicit opt-in action is required; staff record an explicit
 * decline instead. STOP suppression and the profile opt-out always win, and
 * this posture never extends to marketing classes (review requests etc.),
 * which keep the express opt-in bar.
 *
 * On customer creation with a valid phone this seeds:
 * - an active `contact_recipients` row (role customer_primary, source
 *   seeded_from_customer) unless an active recipient already exists for that
 *   customer + phone
 * - a `contact_recipient_consents` row for on_the_way (opted_in under the
 *   intake disclosure, or opted_out when the decline box was checked) —
 *   only when no consent row exists yet; an earlier explicit decision is
 *   never overwritten
 *
 * Best-effort by contract: any failure is swallowed after logging — customer
 * creation must never fail because of SMS provisioning.
 */

import {
  SMS_CONSENT_SOURCE_DECLINED_AT_INTAKE,
  SMS_CONSENT_SOURCE_SERVICE_INTAKE,
  SMS_CONSENT_TEXT_VERSION,
} from "@/lib/communications/sms-consent-constants";

type SupabaseLike = {
  from(table: string): any;
};

function asTrimmed(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

export function normalizePhoneE164ForProvisioning(value: unknown): string | null {
  const raw = asTrimmed(value);
  if (!raw) return null;

  const compact = raw.replace(/[\s().-]/g, "");
  const digits = compact.replace(/\D/g, "");

  if (compact.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return null;
}

export type ProvisionCustomerSmsConsentParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  /** Acting internal user when known; null for machine/public-intake paths. */
  actingUserId?: string | null;
  customerId: string | null | undefined;
  displayName?: string | null;
  phoneRaw: string | null | undefined;
  /** True when staff checked "customer declined text messages". */
  declined?: boolean;
};

export async function provisionCustomerSmsRecipientAndConsent(
  params: ProvisionCustomerSmsConsentParams,
): Promise<void> {
  try {
    const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
    const customerId = asTrimmed(params.customerId);
    const phoneE164 = normalizePhoneE164ForProvisioning(params.phoneRaw);

    if (!accountOwnerUserId || !customerId || !phoneE164) {
      return;
    }

    const actingUserId = asTrimmed(params.actingUserId) || null;
    const displayName = asTrimmed(params.displayName) || "Customer";
    const phoneLast10 = phoneE164.replace(/\D/g, "").slice(-10);

    // Reuse an existing active recipient for this customer + phone when present.
    const existingRecipientResponse = await params.supabase
      .from("contact_recipients")
      .select("id")
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("linked_entity_type", "customer")
      .eq("linked_entity_id", customerId)
      .eq("phone_e164", phoneE164)
      .eq("status", "active")
      .limit(1);

    if (existingRecipientResponse?.error) {
      throw existingRecipientResponse.error;
    }

    const existingRecipientRows = Array.isArray(existingRecipientResponse?.data)
      ? existingRecipientResponse.data
      : [];
    let recipientId = asTrimmed(existingRecipientRows[0]?.id);

    if (!recipientId) {
      const insertResponse = await params.supabase
        .from("contact_recipients")
        .insert({
          account_owner_user_id: accountOwnerUserId,
          linked_entity_type: "customer",
          linked_entity_id: customerId,
          recipient_role: "customer_primary",
          display_name: displayName.slice(0, 120),
          phone_e164: phoneE164,
          phone_last10: phoneLast10,
          preferred_contact_method: "sms",
          source_type: "seeded_from_customer",
          status: "active",
          created_by_user_id: actingUserId,
          updated_by_user_id: actingUserId,
        })
        .select("id")
        .single();

      if (insertResponse?.error) {
        // Unique active-identity conflict: another writer seeded it first.
        if (asTrimmed(insertResponse.error.code) !== "23505") {
          throw insertResponse.error;
        }

        const retryResponse = await params.supabase
          .from("contact_recipients")
          .select("id")
          .eq("account_owner_user_id", accountOwnerUserId)
          .eq("linked_entity_type", "customer")
          .eq("linked_entity_id", customerId)
          .eq("phone_e164", phoneE164)
          .eq("status", "active")
          .limit(1);

        if (retryResponse?.error) {
          throw retryResponse.error;
        }
        const retryRows = Array.isArray(retryResponse?.data) ? retryResponse.data : [];
        recipientId = asTrimmed(retryRows[0]?.id);
      } else {
        recipientId = asTrimmed(insertResponse?.data?.id);
      }
    }

    if (!recipientId) {
      return;
    }

    // Never overwrite an existing consent decision.
    const existingConsentResponse = await params.supabase
      .from("contact_recipient_consents")
      .select("id")
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("contact_recipient_id", recipientId)
      .eq("message_class", "on_the_way")
      .limit(1);

    if (existingConsentResponse?.error) {
      throw existingConsentResponse.error;
    }

    const existingConsentRows = Array.isArray(existingConsentResponse?.data)
      ? existingConsentResponse.data
      : [];
    if (existingConsentRows.length > 0) {
      return;
    }

    const now = new Date().toISOString();
    const declined = params.declined === true;

    const consentInsertResponse = await params.supabase
      .from("contact_recipient_consents")
      .insert({
        account_owner_user_id: accountOwnerUserId,
        contact_recipient_id: recipientId,
        message_class: "on_the_way",
        consent_status: declined ? "opted_out" : "opted_in",
        consent_source: declined
          ? SMS_CONSENT_SOURCE_DECLINED_AT_INTAKE
          : SMS_CONSENT_SOURCE_SERVICE_INTAKE,
        consent_text_version: SMS_CONSENT_TEXT_VERSION,
        consent_captured_at: now,
        consent_captured_by_user_id: actingUserId,
        updated_by_user_id: actingUserId,
      });

    if (consentInsertResponse?.error && asTrimmed(consentInsertResponse.error.code) !== "23505") {
      throw consentInsertResponse.error;
    }
  } catch (error) {
    console.warn("[SMS_CONSENT_PROVISIONING_BEST_EFFORT_FAILED]", {
      customerId: asTrimmed(params.customerId) || null,
      message: error instanceof Error ? error.message : "unknown_error",
    });
  }
}
