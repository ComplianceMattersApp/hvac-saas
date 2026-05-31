"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isInternalAccessError,
  requireInternalRole,
} from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import {
  archiveAuthorizedHandoffRecipient,
  createAuthorizedHandoffRecipient,
  updateAuthorizedHandoffRecipient,
} from "@/lib/workflows/authorized-handoff-recipients-actions";

const COMPANY_PROFILE_PATH = "/ops/admin/company-profile";
const SECTION_ANCHOR = "#authorized-ecc-raters";

function withNotice(notice: string) {
  return `${COMPANY_PROFILE_PATH}?notice=${encodeURIComponent(notice)}${SECTION_ANCHOR}`;
}

function cleanString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function cleanNullableString(value: FormDataEntryValue | null) {
  const normalized = cleanString(value);
  return normalized ? normalized : null;
}

function normalizeChecked(value: FormDataEntryValue | null) {
  const normalized = cleanString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

async function requireAdminOrRedirectForbidden() {
  const supabase = await createClient();

  try {
    await requireInternalRole("admin", { supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/forbidden");
    }
    throw error;
  }
}

export async function createAuthorizedEccRaterFromForm(formData: FormData): Promise<void> {
  await requireAdminOrRedirectForbidden();

  const displayName = cleanString(formData.get("display_name"));
  if (!displayName) {
    redirect(withNotice("authorized_ecc_rater_display_name_required"));
  }

  const result = await createAuthorizedHandoffRecipient({
    recipientType: cleanString(formData.get("recipient_type")) || "external_manual",
    handoffKind: cleanString(formData.get("handoff_kind")) || "ecc",
    displayName,
    externalCompanyName: cleanNullableString(formData.get("external_company_name")),
    externalContactName: cleanNullableString(formData.get("external_contact_name")),
    externalEmail: cleanNullableString(formData.get("external_email")),
    externalPhone: cleanNullableString(formData.get("external_phone")),
    notes: cleanNullableString(formData.get("notes")),
    isDefault: normalizeChecked(formData.get("is_default")),
    isActive: true,
  });

  if (!result.success) {
    redirect(withNotice("authorized_ecc_rater_save_failed"));
  }

  revalidatePath(COMPANY_PROFILE_PATH);
  redirect(withNotice("authorized_ecc_rater_saved"));
}

export async function setAuthorizedEccRaterDefaultFromForm(formData: FormData): Promise<void> {
  await requireAdminOrRedirectForbidden();

  const recipientId = cleanString(formData.get("recipient_id"));
  if (!recipientId) {
    redirect(withNotice("authorized_ecc_rater_default_failed"));
  }

  const result = await updateAuthorizedHandoffRecipient({
    recipientId,
    isDefault: true,
    isActive: true,
  });

  if (!result.success) {
    redirect(withNotice("authorized_ecc_rater_default_failed"));
  }

  revalidatePath(COMPANY_PROFILE_PATH);
  redirect(withNotice("authorized_ecc_rater_default_saved"));
}

export async function archiveAuthorizedEccRaterFromForm(formData: FormData): Promise<void> {
  await requireAdminOrRedirectForbidden();

  const recipientId = cleanString(formData.get("recipient_id"));
  if (!recipientId) {
    redirect(withNotice("authorized_ecc_rater_archive_failed"));
  }

  const result = await archiveAuthorizedHandoffRecipient({ recipientId });
  if (!result.success) {
    redirect(withNotice("authorized_ecc_rater_archive_failed"));
  }

  revalidatePath(COMPANY_PROFILE_PATH);
  redirect(withNotice("authorized_ecc_rater_archived"));
}
