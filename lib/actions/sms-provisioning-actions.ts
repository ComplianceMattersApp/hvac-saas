"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireInternalRole } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  assertSmsSelfServeEnabledForAccountOwner,
  resolveSmsProvisioningEnvironment,
} from "@/lib/communications/sms-self-serve-gate";
import { runNextProvisioningStep } from "@/lib/communications/sms-provisioning-orchestrator";
import { resolveSubaccountCredential } from "@/lib/communications/sms-account-resolution";
import { resendSoleProprietorOtp } from "@/lib/communications/twilio-provisioning-client";

const PATH = "/ops/admin/communications/provisioning";

function withNotice(notice: string) {
  return `${PATH}?notice=${encodeURIComponent(notice)}`;
}

function trimmed(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

/**
 * Every provisioning action starts here.
 *
 * The allowlist assert is INSIDE the shared context rather than at each call
 * site, so there is no ordering in which a non-entitled account reaches a
 * Twilio call — and every step of this wizard spends real money.
 */
async function requireProvisioningContext() {
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalRole("admin", { supabase });
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  assertSmsSelfServeEnabledForAccountOwner(accountOwnerUserId);
  return { supabase, admin: createAdminClient(), accountOwnerUserId, actingUserId: userId };
}

async function loadActiveRegistration(admin: any, accountOwnerUserId: string) {
  const { data } = await admin
    .from("sms_provisioning_registrations")
    .select("*")
    .eq("account_owner_user_id", accountOwnerUserId)
    .is("completed_at", null)
    .maybeSingle();
  return data ?? null;
}

/**
 * Create the registration from the wizard form. Collects only what the
 * carriers require, and nothing is sent to Twilio yet — submission is a
 * separate, deliberate action.
 */
export async function startSmsProvisioningFromForm(formData: FormData): Promise<void> {
  const { admin, accountOwnerUserId, actingUserId } = await requireProvisioningContext();

  const hasEin = trimmed(formData.get("has_ein")) === "yes";
  const ein = trimmed(formData.get("ein"));

  // A registered LLC or corporation must never take the sole-proprietor path —
  // Twilio rejects it with 30915 and the fee is spent by then.
  if (hasEin && !ein) redirect(withNotice("ein_required"));

  const payload: Record<string, unknown> = {
    account_owner_user_id: accountOwnerUserId,
    // Derived from the deployment, never from the form: sandbox = Mock brands
    // (free, never reach carriers); production only where the owner set it.
    provider_environment: resolveSmsProvisioningEnvironment(),
    registration_path: hasEin ? "a2p_lvs" : "a2p_sole_prop",
    legal_business_name: trimmed(formData.get("legal_business_name")) || null,
    business_type: trimmed(formData.get("business_type")) || null,
    ein: hasEin ? ein : null,
    business_industry: trimmed(formData.get("business_industry")) || null,
    website_url: trimmed(formData.get("website_url")) || null,
    address_line1: trimmed(formData.get("address_line1")) || null,
    address_line2: trimmed(formData.get("address_line2")) || null,
    city: trimmed(formData.get("city")) || null,
    region: trimmed(formData.get("region")) || null,
    postal_code: trimmed(formData.get("postal_code")) || null,
    rep_first_name: trimmed(formData.get("rep_first_name")) || null,
    rep_last_name: trimmed(formData.get("rep_last_name")) || null,
    rep_email: trimmed(formData.get("rep_email")) || null,
    rep_phone: trimmed(formData.get("rep_phone")) || null,
    rep_title: trimmed(formData.get("rep_title")) || null,
    rep_business_title: trimmed(formData.get("rep_business_title")) || null,
    created_by_user_id: actingUserId,
    updated_by_user_id: actingUserId,
  };

  const existing = await loadActiveRegistration(admin, accountOwnerUserId);
  const { error } = existing
    ? await admin.from("sms_provisioning_registrations").update(payload).eq("id", existing.id)
    : await admin.from("sms_provisioning_registrations").insert(payload);

  if (error) redirect(withNotice("save_failed"));

  revalidatePath(PATH);
  redirect(withNotice("details_saved"));
}

/**
 * Advance one step. Deliberately one step per click: each is a non-refundable
 * spend, so the operator sees the outcome of each before the next runs.
 */
export async function advanceSmsProvisioningFromForm(): Promise<void> {
  const { admin, accountOwnerUserId } = await requireProvisioningContext();

  const registration = await loadActiveRegistration(admin, accountOwnerUserId);
  if (!registration) redirect(withNotice("registration_missing"));

  const result = await runNextProvisioningStep({ admin, registration });
  revalidatePath(PATH);

  if (result.outcome === "failed") redirect(withNotice("step_failed"));
  if (result.outcome === "blocked") redirect(withNotice("validation_blocked"));
  if (result.outcome === "waiting") redirect(withNotice("waiting_on_review"));
  if (result.outcome === "complete") redirect(withNotice("submitted"));
  redirect(withNotice("step_advanced"));
}

/**
 * Clear the failed-step marker so the operator can retry after editing.
 *
 * Only the failure record is cleared — never a Twilio reference, because that
 * would make the engine re-run a step whose money is already spent.
 */
export async function retrySmsProvisioningStepFromForm(): Promise<void> {
  const { admin, accountOwnerUserId } = await requireProvisioningContext();

  const registration = await loadActiveRegistration(admin, accountOwnerUserId);
  if (!registration) redirect(withNotice("registration_missing"));

  await admin
    .from("sms_provisioning_registrations")
    .update({ last_error: null })
    .eq("id", registration.id);

  const result = await runNextProvisioningStep({
    admin,
    registration: { ...registration, last_error: null },
  });
  revalidatePath(PATH);
  if (result.outcome === "failed") redirect(withNotice("step_failed"));
  if (result.outcome === "blocked") redirect(withNotice("validation_blocked"));
  if (result.outcome === "waiting") redirect(withNotice("waiting_on_review"));
  redirect(withNotice("step_advanced"));
}

/** Sole-proprietor brands verify the rep's phone by OTP; this resends it. */
export async function resendSmsProvisioningOtpFromForm(): Promise<void> {
  const { admin, accountOwnerUserId } = await requireProvisioningContext();

  const registration = await loadActiveRegistration(admin, accountOwnerUserId);
  if (!registration?.brand_registration_sid) redirect(withNotice("otp_unavailable"));

  const credential = await resolveSubaccountCredential({ admin, accountOwnerUserId });
  if (!credential) redirect(withNotice("otp_unavailable"));

  try {
    await resendSoleProprietorOtp({
      auth: { accountSid: credential.accountSid, authToken: credential.authToken },
      brandRegistrationSid: String(registration.brand_registration_sid),
    });
  } catch {
    redirect(withNotice("otp_failed"));
  }

  revalidatePath(PATH);
  redirect(withNotice("otp_sent"));
}
