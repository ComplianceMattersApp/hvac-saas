"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalRole } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  buildInternalBusinessProfileLogoStorageRef,
  parseInternalBusinessProfileLogoStorageRef,
} from "@/lib/business/internal-business-profile";

const MAX_LOGO_FILE_SIZE = 5 * 1024 * 1024;

function safeFileName(name: string) {
  return String(name ?? "")
    .trim()
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/\s+/g, " ");
}

function normalizeText(raw: FormDataEntryValue | null) {
  return String(raw ?? "").trim();
}

function normalizeNullableText(raw: FormDataEntryValue | null) {
  const value = normalizeText(raw);
  return value || null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUploadFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function withNotice(notice: string) {
  return `/ops/admin/company-profile?notice=${encodeURIComponent(notice)}`;
}

export async function saveInternalBusinessProfileFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole("admin", { supabase });

  const displayName = normalizeText(formData.get("display_name"));
  const supportEmail = normalizeNullableText(formData.get("support_email"));
  const supportPhone = normalizeNullableText(formData.get("support_phone"));
  const logoFileEntry = formData.get("logo_file");
  const removeLogo = String(formData.get("remove_logo") ?? "").trim() === "1";

  if (!displayName) {
    redirect(withNotice("display_name_required"));
  }

  if (supportEmail && !isValidEmail(supportEmail)) {
    redirect(withNotice("invalid_support_email"));
  }

  const logoFile = isUploadFile(logoFileEntry) && logoFileEntry.size > 0 ? logoFileEntry : null;

  if (logoFile && !String(logoFile.type ?? "").toLowerCase().startsWith("image/")) {
    redirect(withNotice("invalid_logo_file"));
  }

  if (logoFile && logoFile.size > MAX_LOGO_FILE_SIZE) {
    redirect(withNotice("logo_too_large"));
  }

  const admin = createAdminClient();
  const { data: existingProfile, error: existingProfileError } = await admin
    .from("internal_business_profiles")
    .select("logo_url")
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .maybeSingle();

  if (existingProfileError) {
    redirect(withNotice("save_failed"));
  }

  const existingLogoRef = parseInternalBusinessProfileLogoStorageRef(existingProfile?.logo_url ?? null);
  let nextLogoUrl = String(existingProfile?.logo_url ?? "").trim() || null;

  if (removeLogo) {
    nextLogoUrl = null;
  }

  if (logoFile) {
    const cleanName = safeFileName(logoFile.name || "company-logo");
    const storagePath = `company-profile/${internalUser.account_owner_user_id}/${Date.now()}-${cleanName}`;
    const fileBuffer = Buffer.from(await logoFile.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from("attachments")
      .upload(storagePath, fileBuffer, {
        contentType: logoFile.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      redirect(withNotice("save_failed"));
    }

    nextLogoUrl = buildInternalBusinessProfileLogoStorageRef(storagePath);
  }

  const { error } = await admin
    .from("internal_business_profiles")
    .upsert(
      {
        account_owner_user_id: internalUser.account_owner_user_id,
        display_name: displayName,
        support_email: supportEmail,
        support_phone: supportPhone,
        logo_url: nextLogoUrl,
      },
      {
        onConflict: "account_owner_user_id",
      },
    );

  if (error) {
    redirect(withNotice("save_failed"));
  }

  const shouldRemoveExistingLogo = Boolean(existingLogoRef) && (
    removeLogo ||
    (logoFile && existingLogoRef?.storagePath !== parseInternalBusinessProfileLogoStorageRef(nextLogoUrl)?.storagePath)
  );

  if (shouldRemoveExistingLogo && existingLogoRef) {
    const { error: removeError } = await admin.storage
      .from(existingLogoRef.bucket)
      .remove([existingLogoRef.storagePath]);

    if (removeError) {
      console.warn("Failed to remove previous company logo", {
        accountOwnerUserId: internalUser.account_owner_user_id,
        storagePath: existingLogoRef.storagePath,
        error: removeError.message,
      });
    }
  }

  revalidatePath("/ops");
  revalidatePath("/ops/admin");
  revalidatePath("/ops/admin/company-profile");
  redirect(withNotice("saved"));
}