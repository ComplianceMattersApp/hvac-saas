import type { ProductMode } from "@/lib/business/product-mode-defaults";

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeProductMode(value: unknown): ProductMode | null {
  const normalized = toCleanString(value).toLowerCase();
  if (normalized === "hybrid") return "hybrid";
  if (normalized === "hvac_service") return "hvac_service";
  if (normalized === "ecc_hers") return "ecc_hers";
  return null;
}

type BusinessProfileRow = {
  account_owner_user_id: string;
  display_name: string | null;
  billing_mode: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AccountSettingsRow = {
  account_owner_user_id: string;
  product_mode: string | null;
};

type EntitlementRow = {
  account_owner_user_id: string;
  plan_key: string | null;
  entitlement_status: string | null;
  trial_ends_at: string | null;
};

type InternalUserRow = {
  account_owner_user_id: string | null;
  user_id: string;
  is_active: boolean | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type AuthOwnerRow = {
  id: string;
  email: string | null;
  invited_at: string | null;
  email_confirmed_at: string | null;
  confirmed_at: string | null;
};

export type PlatformOwnerDashboardSummary = {
  totalAccounts: number;
  hvacServiceAccounts: number;
  eccAccounts: number;
  hybridAccounts: number;
  unknownModeAccounts: number;
  trialAccounts: number;
  activeAccounts: number;
  expiredSuspendedCancelledAccounts: number;
  totalInternalUsers: number;
  activeInternalUsers: number;
};

export type PlatformOwnerDashboardRow = {
  company: string;
  ownerEmail: string | null;
  ownerName: string | null;
  accountOwnerUserId: string;
  productMode: ProductMode | null;
  billingMode: string | null;
  planKey: string | null;
  entitlementStatus: string | null;
  trialEnd: string | null;
  activeUsers: number;
  totalUsers: number;
  createdAt: string | null;
  updatedAt: string | null;
  setupInviteState: string;
};

export type PlatformOwnerDashboardModel = {
  summary: PlatformOwnerDashboardSummary;
  rows: PlatformOwnerDashboardRow[];
};

function resolveInviteState(authOwner: AuthOwnerRow | null) {
  if (!authOwner) return "unknown";
  if (toCleanString(authOwner.email_confirmed_at || authOwner.confirmed_at)) return "confirmed";
  if (toCleanString(authOwner.invited_at)) return "invite_pending";
  return "created_no_invite";
}

function statusInSet(status: string | null, values: string[]) {
  const normalized = toCleanString(status).toLowerCase();
  return values.includes(normalized);
}

export function buildPlatformOwnerDashboardModel(input: {
  businessProfiles: BusinessProfileRow[];
  accountSettings: AccountSettingsRow[];
  entitlements: EntitlementRow[];
  internalUsers: InternalUserRow[];
  ownerProfiles: ProfileRow[];
  ownerAuthUsers: AuthOwnerRow[];
}): PlatformOwnerDashboardModel {
  const settingsByOwner = new Map(
    input.accountSettings.map((row) => [toCleanString(row.account_owner_user_id), row]),
  );
  const entitlementsByOwner = new Map(
    input.entitlements.map((row) => [toCleanString(row.account_owner_user_id), row]),
  );
  const ownerProfilesById = new Map(
    input.ownerProfiles.map((row) => [toCleanString(row.id), row]),
  );
  const ownerAuthUsersById = new Map(
    input.ownerAuthUsers.map((row) => [toCleanString(row.id), row]),
  );

  const userCountsByOwner = new Map<string, { totalUsers: number; activeUsers: number }>();
  for (const internalUser of input.internalUsers) {
    const ownerId = toCleanString(internalUser.account_owner_user_id);
    if (!ownerId) continue;
    const existing = userCountsByOwner.get(ownerId) ?? { totalUsers: 0, activeUsers: 0 };
    existing.totalUsers += 1;
    if (Boolean(internalUser.is_active)) existing.activeUsers += 1;
    userCountsByOwner.set(ownerId, existing);
  }

  const rows: PlatformOwnerDashboardRow[] = input.businessProfiles
    .map((profile) => {
      const ownerId = toCleanString(profile.account_owner_user_id);
      if (!ownerId) return null;

      const settings = settingsByOwner.get(ownerId) ?? null;
      const entitlement = entitlementsByOwner.get(ownerId) ?? null;
      const ownerProfile = ownerProfilesById.get(ownerId) ?? null;
      const ownerAuthUser = ownerAuthUsersById.get(ownerId) ?? null;
      const userCounts = userCountsByOwner.get(ownerId) ?? { totalUsers: 0, activeUsers: 0 };

      return {
        company: toCleanString(profile.display_name) || "Unnamed account",
        ownerEmail: toCleanString(ownerProfile?.email) || toCleanString(ownerAuthUser?.email) || null,
        ownerName: toCleanString(ownerProfile?.full_name) || null,
        accountOwnerUserId: ownerId,
        productMode: normalizeProductMode(settings?.product_mode),
        billingMode: toCleanString(profile.billing_mode) || null,
        planKey: toCleanString(entitlement?.plan_key) || null,
        entitlementStatus: toCleanString(entitlement?.entitlement_status) || null,
        trialEnd: toCleanString(entitlement?.trial_ends_at) || null,
        activeUsers: userCounts.activeUsers,
        totalUsers: userCounts.totalUsers,
        createdAt: toCleanString(profile.created_at) || null,
        updatedAt: toCleanString(profile.updated_at) || null,
        setupInviteState: resolveInviteState(ownerAuthUser),
      };
    })
    .filter((row): row is PlatformOwnerDashboardRow => Boolean(row))
    .sort((a, b) => a.company.localeCompare(b.company));

  const summary: PlatformOwnerDashboardSummary = {
    totalAccounts: rows.length,
    hvacServiceAccounts: rows.filter((row) => row.productMode === "hvac_service").length,
    eccAccounts: rows.filter((row) => row.productMode === "ecc_hers").length,
    hybridAccounts: rows.filter((row) => row.productMode === "hybrid").length,
    unknownModeAccounts: rows.filter((row) => row.productMode === null).length,
    trialAccounts: rows.filter((row) => statusInSet(row.entitlementStatus, ["trial"])) .length,
    activeAccounts: rows.filter((row) => statusInSet(row.entitlementStatus, ["active", "trial", "grace"])) .length,
    expiredSuspendedCancelledAccounts: rows.filter((row) =>
      statusInSet(row.entitlementStatus, ["expired", "suspended", "cancelled"]),
    ).length,
    totalInternalUsers: rows.reduce((sum, row) => sum + row.totalUsers, 0),
    activeInternalUsers: rows.reduce((sum, row) => sum + row.activeUsers, 0),
  };

  return { summary, rows };
}

async function listAuthUsersByIds(admin: any, userIds: string[]) {
  const wanted = new Set(userIds.filter(Boolean));
  if (wanted.size === 0) return [] as AuthOwnerRow[];

  const matches: AuthOwnerRow[] = [];

  let page = 1;
  while (page <= 15 && wanted.size > 0) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = Array.isArray((data as any)?.users) ? (data as any).users : [];

    for (const user of users) {
      const id = toCleanString(user?.id);
      if (!id || !wanted.has(id)) continue;
      matches.push({
        id,
        email: toCleanString(user?.email) || null,
        invited_at: toCleanString(user?.invited_at) || null,
        email_confirmed_at: toCleanString(user?.email_confirmed_at) || null,
        confirmed_at: toCleanString(user?.confirmed_at) || null,
      });
      wanted.delete(id);
    }

    if (users.length < 200) break;
    page += 1;
  }

  return matches;
}

export async function loadPlatformOwnerDashboardModel(params: { admin: any }) {
  const admin = params.admin;

  const [{ data: businessProfiles, error: businessProfilesError }, { data: accountSettings, error: accountSettingsError }, { data: entitlements, error: entitlementsError }, { data: internalUsers, error: internalUsersError }] = await Promise.all([
    admin
      .from("internal_business_profiles")
      .select("account_owner_user_id, display_name, billing_mode, created_at, updated_at")
      .order("created_at", { ascending: false }),
    admin.from("account_settings").select("account_owner_user_id, product_mode"),
    admin
      .from("platform_account_entitlements")
      .select("account_owner_user_id, plan_key, entitlement_status, trial_ends_at"),
    admin.from("internal_users").select("account_owner_user_id, user_id, is_active"),
  ]);

  if (businessProfilesError) throw businessProfilesError;
  if (accountSettingsError) throw accountSettingsError;
  if (entitlementsError) throw entitlementsError;
  if (internalUsersError) throw internalUsersError;

  const ownerIds = (Array.isArray(businessProfiles) ? businessProfiles : [])
    .map((row: any) => toCleanString(row?.account_owner_user_id))
    .filter(Boolean);

  const { data: ownerProfiles, error: ownerProfilesError } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ownerIds);
  if (ownerProfilesError) throw ownerProfilesError;

  const ownerAuthUsers = await listAuthUsersByIds(admin, ownerIds);

  return buildPlatformOwnerDashboardModel({
    businessProfiles: Array.isArray(businessProfiles) ? businessProfiles : [],
    accountSettings: Array.isArray(accountSettings) ? accountSettings : [],
    entitlements: Array.isArray(entitlements) ? entitlements : [],
    internalUsers: Array.isArray(internalUsers) ? internalUsers : [],
    ownerProfiles: Array.isArray(ownerProfiles) ? ownerProfiles : [],
    ownerAuthUsers,
  });
}
