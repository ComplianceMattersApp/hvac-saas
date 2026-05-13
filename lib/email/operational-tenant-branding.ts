import {
  resolveInternalBusinessIdentityByAccountOwnerId,
  resolveInternalBusinessProfileLogoUrl,
} from "@/lib/business/internal-business-profile";

export type OperationalTenantIdentity = {
  displayName: string;
  supportEmail: string | null;
  supportPhone: string | null;
  logoUrl: string | null;
};

const DEFAULT_OPERATIONAL_DISPLAY_NAME = "Compliance Matters";

export async function resolveOperationalTenantIdentity(params: {
  accountOwnerUserId: string | null | undefined;
  supabase?: any;
}): Promise<OperationalTenantIdentity> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();

  const baseIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase: params.supabase,
    accountOwnerUserId,
  });

  const displayName = String(baseIdentity.display_name ?? "").trim() || DEFAULT_OPERATIONAL_DISPLAY_NAME;
  const supportEmail = String(baseIdentity.support_email ?? "").trim() || null;
  const supportPhone = String(baseIdentity.support_phone ?? "").trim() || null;
  const rawLogoUrl = String(baseIdentity.logo_url ?? "").trim();

  let logoUrl: string | null = null;

  if (rawLogoUrl) {
    try {
      logoUrl = await resolveInternalBusinessProfileLogoUrl({ logoUrl: rawLogoUrl, expiresIn: 60 * 60 * 24 });
    } catch {
      logoUrl = null;
    }
  }

  return {
    displayName,
    supportEmail,
    supportPhone,
    logoUrl,
  };
}