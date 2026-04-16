import { requireInternalUser } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const INTERNAL_BUSINESS_LOGO_STORAGE_PREFIX = "storage://attachments/";

export type BillingMode = "external_billing" | "internal_invoicing";

export const DEFAULT_BILLING_MODE: BillingMode = "external_billing";

export type InternalBusinessProfile = {
  account_owner_user_id: string;
  display_name: string;
  support_email: string | null;
  support_phone: string | null;
  logo_url: string | null;
  billing_mode: BillingMode;
  created_at: string;
  updated_at: string;
};

export type ResolvedInternalBusinessIdentity = {
  display_name: string;
  support_email: string | null;
  support_phone: string | null;
  logo_url: string | null;
};

const DEFAULT_INTERNAL_BUSINESS_DISPLAY_NAME = "Compliance Matters";

export function normalizeBillingMode(value: string | null | undefined): BillingMode {
  return String(value ?? "").trim().toLowerCase() === "internal_invoicing"
    ? "internal_invoicing"
    : DEFAULT_BILLING_MODE;
}

export function buildInternalBusinessProfileLogoStorageRef(storagePath: string) {
  const normalizedPath = String(storagePath ?? "").trim().replace(/^\/+/, "");
  return normalizedPath ? `${INTERNAL_BUSINESS_LOGO_STORAGE_PREFIX}${normalizedPath}` : null;
}

export function parseInternalBusinessProfileLogoStorageRef(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized.startsWith(INTERNAL_BUSINESS_LOGO_STORAGE_PREFIX)) return null;

  const storagePath = normalized.slice(INTERNAL_BUSINESS_LOGO_STORAGE_PREFIX.length).replace(/^\/+/, "");
  if (!storagePath) return null;

  return {
    bucket: "attachments",
    storagePath,
  };
}

export async function resolveInternalBusinessProfileLogoUrl(params: {
  logoUrl: string | null | undefined;
  expiresIn?: number;
}) {
  const normalized = String(params.logoUrl ?? "").trim();
  if (!normalized) return null;

  const storageRef = parseInternalBusinessProfileLogoStorageRef(normalized);
  if (!storageRef) return normalized;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(storageRef.bucket)
    .createSignedUrl(storageRef.storagePath, params.expiresIn ?? 60 * 60);

  if (error || !data?.signedUrl) {
    console.warn("Failed to resolve internal business profile logo URL", {
      bucket: storageRef.bucket,
      storagePath: storageRef.storagePath,
      error: error?.message ?? null,
    });
    return null;
  }

  return data.signedUrl;
}

function normalizeInternalBusinessProfileRow(row: any): InternalBusinessProfile | null {
  const accountOwnerUserId = String(row?.account_owner_user_id ?? "").trim();
  const displayName = String(row?.display_name ?? "").trim();

  if (!accountOwnerUserId || !displayName) return null;

  return {
    account_owner_user_id: accountOwnerUserId,
    display_name: displayName,
    support_email: String(row?.support_email ?? "").trim() || null,
    support_phone: String(row?.support_phone ?? "").trim() || null,
    logo_url: String(row?.logo_url ?? "").trim() || null,
    billing_mode: normalizeBillingMode(String(row?.billing_mode ?? "")),
    created_at: String(row?.created_at ?? "").trim(),
    updated_at: String(row?.updated_at ?? "").trim(),
  };
}

export async function getInternalBusinessProfileByAccountOwnerId(params: {
  accountOwnerUserId: string;
  supabase?: any;
}): Promise<InternalBusinessProfile | null> {
  const supabase = params.supabase ?? (await createClient());
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();

  if (!accountOwnerUserId) return null;

  const { data, error } = await supabase
    .from("internal_business_profiles")
    .select(
      "account_owner_user_id, display_name, support_email, support_phone, logo_url, billing_mode, created_at, updated_at",
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (error) throw error;

  return normalizeInternalBusinessProfileRow(data);
}

export async function getCurrentInternalBusinessProfile(params: {
  supabase?: any;
} = {}): Promise<InternalBusinessProfile | null> {
  const supabase = params.supabase ?? (await createClient());
  const { internalUser } = await requireInternalUser({ supabase });

  return getInternalBusinessProfileByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
}

export async function resolveInternalBusinessIdentityByAccountOwnerId(params: {
  accountOwnerUserId: string | null | undefined;
  supabase?: any;
}): Promise<ResolvedInternalBusinessIdentity> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();

  if (!accountOwnerUserId) {
    return {
      display_name: DEFAULT_INTERNAL_BUSINESS_DISPLAY_NAME,
      support_email: null,
      support_phone: null,
      logo_url: null,
    };
  }

  const profile = await getInternalBusinessProfileByAccountOwnerId({
    supabase: params.supabase,
    accountOwnerUserId,
  });

  return {
    display_name: profile?.display_name ?? DEFAULT_INTERNAL_BUSINESS_DISPLAY_NAME,
    support_email: profile?.support_email ?? null,
    support_phone: profile?.support_phone ?? null,
    logo_url: profile?.logo_url ?? null,
  };
}

export async function resolveBillingModeByAccountOwnerId(params: {
  accountOwnerUserId: string | null | undefined;
  supabase?: any;
}): Promise<BillingMode> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();

  if (!accountOwnerUserId) {
    return DEFAULT_BILLING_MODE;
  }

  const profile = await getInternalBusinessProfileByAccountOwnerId({
    supabase: params.supabase,
    accountOwnerUserId,
  });

  return profile?.billing_mode ?? DEFAULT_BILLING_MODE;
}