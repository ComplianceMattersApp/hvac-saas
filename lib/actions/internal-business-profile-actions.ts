"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalRole } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { parseBooleanToggleEntries } from "@/lib/time-clock/settings-controls";
import {
  buildInternalBusinessProfileLogoStorageRef,
  DEFAULT_BILLING_MODE,
  normalizeBillingMode,
  parseInternalBusinessProfileLogoStorageRef,
} from "@/lib/business/internal-business-profile";
import {
  createTenantStripeConnectOnboardingLink,
  normalizeStripeConnectError,
  syncTenantStripeConnectReadinessForAccountOwner,
} from "@/lib/business/tenant-stripe-connect-onboarding";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";

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

function isValidHttpsUrl(value: string) {
  return /^https:\/\/\S+$/i.test(value);
}

function isUploadFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function withNotice(notice: string) {
  return `/ops/admin/company-profile?notice=${encodeURIComponent(notice)}`;
}

function normalizeTimeClockSettingsRedirectTarget(raw: FormDataEntryValue | null) {
  const target = String(raw ?? "").trim();
  if (target === "/ops/admin/company-profile") return target;
  if (target === "/ops/admin/time-clock") return target;
  return "/ops/admin/time-clock";
}

function withNoticeAtPath(path: string, notice: string) {
  return `${path}?notice=${encodeURIComponent(notice)}`;
}

function isRedirectControlFlowError(error: unknown) {
  if (!error) return false;

  const message = error instanceof Error ? String(error.message ?? "") : "";
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : "";

  return (
    message.startsWith("REDIRECT:") ||
    message.includes("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_REDIRECT")
  );
}

async function requireScopedInternalBusinessProfileMutationContext(params: {
  admin: any;
  actorUserId: string;
  accountOwnerUserId: string;
}) {
  const actorUserId = String(params.actorUserId ?? "").trim();
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();

  if (!actorUserId || !accountOwnerUserId) {
    throw new Error("BUSINESS_PROFILE_SCOPE_DENIED");
  }

  const { data: scopedActor, error: scopedActorErr } = await params.admin
    .from("internal_users")
    .select("user_id, role, is_active, account_owner_user_id")
    .eq("user_id", actorUserId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (scopedActorErr) {
    throw scopedActorErr;
  }

  const isActive = Boolean((scopedActor as any)?.is_active);
  const role = String((scopedActor as any)?.role ?? "").trim().toLowerCase();

  if (!scopedActor?.user_id || !isActive || role !== "admin") {
    throw new Error("BUSINESS_PROFILE_SCOPE_DENIED");
  }
}

export async function saveInternalBusinessProfileFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalRole("admin", { supabase });

  const displayName = normalizeText(formData.get("display_name"));
  const supportEmail = normalizeNullableText(formData.get("support_email"));
  const supportPhone = normalizeNullableText(formData.get("support_phone"));
  const googleReviewUrl = normalizeNullableText(formData.get("google_review_url"));
  const hasBillingModeInput = formData.has("billing_mode");
  const logoFileEntry = formData.get("logo_file");
  const removeLogo = String(formData.get("remove_logo") ?? "").trim() === "1";

  if (!displayName) {
    redirect(withNotice("display_name_required"));
  }

  if (supportEmail && !isValidEmail(supportEmail)) {
    redirect(withNotice("invalid_support_email"));
  }

  if (googleReviewUrl && !isValidHttpsUrl(googleReviewUrl)) {
    redirect(withNotice("invalid_google_review_url"));
  }

  const logoFile = isUploadFile(logoFileEntry) && logoFileEntry.size > 0 ? logoFileEntry : null;

  if (logoFile && !String(logoFile.type ?? "").toLowerCase().startsWith("image/")) {
    redirect(withNotice("invalid_logo_file"));
  }

  if (logoFile && logoFile.size > MAX_LOGO_FILE_SIZE) {
    redirect(withNotice("logo_too_large"));
  }

  const admin = createAdminClient();
  try {
    await requireScopedInternalBusinessProfileMutationContext({
      admin,
      actorUserId: userId,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
  } catch {
    redirect("/forbidden");
  }

  const { data: existingProfile, error: existingProfileError } = await admin
    .from("internal_business_profiles")
    .select("logo_url, billing_mode")
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .maybeSingle();

  if (existingProfileError) {
    redirect(withNotice("save_failed"));
  }

  const existingLogoRef = parseInternalBusinessProfileLogoStorageRef(existingProfile?.logo_url ?? null);
  const billingMode = hasBillingModeInput
    ? normalizeBillingMode(String(formData.get("billing_mode") ?? ""))
    : normalizeBillingMode(String(existingProfile?.billing_mode ?? DEFAULT_BILLING_MODE));
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
        google_review_url: googleReviewUrl,
        logo_url: nextLogoUrl,
        billing_mode: billingMode,
        profile_reviewed_at: new Date().toISOString(),
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
  revalidatePath("/jobs");
  redirect(withNotice("saved"));
}

export async function saveInvoiceModeFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalRole("admin", { supabase });
  const billingMode = normalizeBillingMode(String(formData.get("billing_mode") ?? ""));

  const admin = createAdminClient();
  try {
    await requireScopedInternalBusinessProfileMutationContext({
      admin,
      actorUserId: userId,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
  } catch {
    redirect("/forbidden");
  }

  const { data: existingProfile, error: existingProfileError } = await admin
    .from("internal_business_profiles")
    .select("display_name, support_email, support_phone, logo_url")
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .maybeSingle();

  if (existingProfileError) {
    redirect(withNotice("save_failed"));
  }

  const displayName = String(existingProfile?.display_name ?? "").trim() || "Your Company";

  const { error } = await admin
    .from("internal_business_profiles")
    .upsert(
      {
        account_owner_user_id: internalUser.account_owner_user_id,
        display_name: displayName,
        support_email: normalizeNullableText(existingProfile?.support_email ?? null),
        support_phone: normalizeNullableText(existingProfile?.support_phone ?? null),
        logo_url: normalizeNullableText(existingProfile?.logo_url ?? null),
        billing_mode: billingMode,
      },
      {
        onConflict: "account_owner_user_id",
      },
    );

  if (error) {
    redirect(withNotice("save_failed"));
  }

  revalidatePath("/ops");
  revalidatePath("/ops/admin");
  revalidatePath("/ops/admin/company-profile");
  revalidatePath("/jobs");
  redirect(withNotice("invoice_settings_saved"));
}

export async function saveTimeClockAccountSettingFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalRole("admin", { supabase });
  const redirectPath = normalizeTimeClockSettingsRedirectTarget(formData.get("redirect_to"));

  const admin = createAdminClient();
  try {
    await requireScopedInternalBusinessProfileMutationContext({
      admin,
      actorUserId: userId,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
  } catch {
    redirect("/forbidden");
  }

  const timeClockEnabled = parseBooleanToggleEntries(
    formData.getAll("time_clock_enabled"),
  );

  const { error } = await admin
    .from("account_settings")
    .upsert(
      {
        account_owner_user_id: internalUser.account_owner_user_id,
        time_clock_enabled: timeClockEnabled,
      },
      {
        onConflict: "account_owner_user_id",
      },
    );

  if (error) {
    redirect(withNoticeAtPath(redirectPath, "time_clock_settings_save_failed"));
  }

  revalidatePath("/ops");
  revalidatePath("/ops/admin");
  revalidatePath("/ops/admin/company-profile");
  revalidatePath("/ops/admin/time-clock");
  revalidatePath("/ops/admin/internal-users");
  redirect(withNoticeAtPath(redirectPath, "time_clock_settings_saved"));
}

export async function confirmTeamSetupFromForm(): Promise<void> {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole("admin", { supabase });

  const admin = createAdminClient();

  const { error } = await admin
    .from("internal_business_profiles")
    .update({ team_reviewed_at: new Date().toISOString() })
    .eq("account_owner_user_id", internalUser.account_owner_user_id);

  if (error) {
    redirect("/ops/admin/internal-users?team_confirm=failed");
  }

  revalidatePath("/ops/admin");
  revalidatePath("/ops/admin/internal-users");
  redirect("/ops/admin/internal-users?team_confirm=confirmed");
}

export async function startTenantStripeConnectOnboardingFromForm(): Promise<void> {
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalRole("admin", { supabase });

  const admin = createAdminClient();
  try {
    await requireScopedInternalBusinessProfileMutationContext({
      admin,
      actorUserId: userId,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
  } catch {
    redirect("/forbidden");
  }

  try {
    const onboarding = await createTenantStripeConnectOnboardingLink({
      accountOwnerUserId: internalUser.account_owner_user_id,
      admin,
    });

    revalidatePath("/ops");
    revalidatePath("/ops/admin");
    revalidatePath("/ops/admin/company-profile");
    redirect(onboarding.url);
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }

    console.warn("Stripe Connect onboarding start failed", {
      accountOwnerUserId: internalUser.account_owner_user_id,
      ...normalizeStripeConnectError(error, "startTenantStripeConnectOnboardingFromForm"),
    });
    redirect(withNotice("stripe_connect_onboarding_failed"));
  }
}

export async function refreshTenantStripeConnectReadinessFromForm(): Promise<void> {
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalRole("admin", { supabase });

  const admin = createAdminClient();
  try {
    await requireScopedInternalBusinessProfileMutationContext({
      admin,
      actorUserId: userId,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
  } catch {
    redirect("/forbidden");
  }

  try {
    await syncTenantStripeConnectReadinessForAccountOwner({
      accountOwnerUserId: internalUser.account_owner_user_id,
      admin,
    });

    revalidatePath("/ops");
    revalidatePath("/ops/admin");
    revalidatePath("/ops/admin/company-profile");
    redirect(withNotice("stripe_connect_status_refreshed"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) {
      throw error;
    }

    let notice = "stripe_connect_status_refresh_failed_unready";
    try {
      const storedReadiness = await resolveTenantStripeConnectReadiness(
        internalUser.account_owner_user_id,
        admin,
      );
      if (storedReadiness.isReady) {
        notice = "stripe_connect_status_refresh_failed_ready";
      }
    } catch {
      notice = "stripe_connect_status_refresh_failed";
    }

    console.warn("Stripe Connect readiness refresh failed", {
      accountOwnerUserId: internalUser.account_owner_user_id,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    redirect(withNotice(notice));
  }
}