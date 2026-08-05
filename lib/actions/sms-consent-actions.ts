"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";

/**
 * SMS consent capture — account-scoped, tenant-generic.
 *
 * Records auditable opt-in/opt-out for a contact recipient and message class in
 * `contact_recipient_consents`. Writes go through the regular client: the table
 * has account-scoped INSERT/UPDATE policies that also require the captured-by
 * user to be the acting user, which is exactly the audit posture we want.
 *
 * Recording opted_in consent does not send SMS and does not enable sending —
 * it satisfies one gate the eligibility evaluator reads. Suppressions (STOP)
 * remain a separate hard stop that consent cannot override.
 */

const ALLOWED_MESSAGE_CLASSES = new Set([
  "scheduling",
  "on_the_way",
  "appointment_reminder",
  "access_coordination",
  "follow_up_no_answer",
  "completion_notice",
  "invoice_ready_notice",
]);

const ALLOWED_CONSENT_SOURCES = new Set([
  "verbal_in_person",
  "verbal_phone",
  "written_form",
  "customer_request",
]);

/** Bump when the customer-facing consent wording changes (privacy/terms). */
const CONSENT_TEXT_VERSION = "sms-consent-v1-2026-08";

function asTrimmed(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function recordContactRecipientSmsConsentFromForm(
  formData: FormData,
): Promise<void> {
  const customerId = asTrimmed(formData.get("customer_id"));
  if (!isUuid(customerId)) {
    redirect("/customers");
  }

  const customerPath = `/customers/${customerId}`;
  const failurePath = `${customerPath}?consentError=1#role-contacts`;

  const supabase = await createClient();

  let userId: string;
  let accountOwnerUserId: string;
  try {
    const internal = await requireInternalUser({ supabase });
    userId = asTrimmed(internal.userId);
    accountOwnerUserId = asTrimmed(internal.internalUser.account_owner_user_id);
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }
    throw error;
  }

  if (!userId || !accountOwnerUserId) {
    redirect(failurePath);
  }

  const contactRecipientId = asTrimmed(formData.get("contact_recipient_id"));
  const messageClass = asTrimmed(formData.get("message_class")).toLowerCase();
  const consentAction = asTrimmed(formData.get("consent_action")).toLowerCase();
  const consentSource = asTrimmed(formData.get("consent_source")).toLowerCase();

  if (!isUuid(contactRecipientId) || !ALLOWED_MESSAGE_CLASSES.has(messageClass)) {
    redirect(failurePath);
  }

  if (consentAction !== "opt_in" && consentAction !== "opt_out") {
    redirect(failurePath);
  }

  if (consentAction === "opt_in" && !ALLOWED_CONSENT_SOURCES.has(consentSource)) {
    redirect(failurePath);
  }

  // Verify the recipient belongs to this account before writing (RLS enforces
  // this too; checking first gives a clean failure redirect instead of a policy
  // error).
  const recipientResponse = await supabase
    .from("contact_recipients")
    .select("id")
    .eq("id", contactRecipientId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (recipientResponse?.error || !recipientResponse?.data?.id) {
    redirect(failurePath);
  }

  const now = new Date().toISOString();
  const consentStatus = consentAction === "opt_in" ? "opted_in" : "opted_out";

  const existingResponse = await supabase
    .from("contact_recipient_consents")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("contact_recipient_id", contactRecipientId)
    .eq("message_class", messageClass)
    .maybeSingle();

  if (existingResponse?.error) {
    redirect(failurePath);
  }

  const existingId = asTrimmed((existingResponse?.data as any)?.id);

  const consentValues = {
    consent_status: consentStatus,
    consent_source: consentAction === "opt_in" ? consentSource : consentSource || "customer_request",
    consent_text_version: CONSENT_TEXT_VERSION,
    consent_captured_at: now,
    consent_captured_by_user_id: userId,
    updated_by_user_id: userId,
  };

  if (existingId) {
    const updateResponse = await supabase
      .from("contact_recipient_consents")
      .update(consentValues)
      .eq("id", existingId)
      .eq("account_owner_user_id", accountOwnerUserId);

    if (updateResponse?.error) {
      redirect(failurePath);
    }
  } else {
    const insertResponse = await supabase.from("contact_recipient_consents").insert({
      account_owner_user_id: accountOwnerUserId,
      contact_recipient_id: contactRecipientId,
      message_class: messageClass,
      ...consentValues,
    });

    if (insertResponse?.error) {
      redirect(failurePath);
    }
  }

  revalidatePath(customerPath);
  redirect(`${customerPath}?consentSaved=1#role-contacts`);
}
