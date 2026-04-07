import { requireInternalUser } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";

export type InternalBusinessProfile = {
  account_owner_user_id: string;
  display_name: string;
  support_email: string | null;
  support_phone: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
};

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
      "account_owner_user_id, display_name, support_email, support_phone, logo_url, created_at, updated_at",
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