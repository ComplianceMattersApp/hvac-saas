import {
  resolveOperationalMutationEntitlementAccess,
  type OperationalMutationEntitlementReason,
} from "@/lib/business/platform-entitlement";
import { isSessionInvalidError } from "@/lib/auth/session-error";
import { resolveActiveContractorPortalMembership } from "@/lib/portal/current-portal-membership";

export type DualContextInternalRole = "admin" | "office" | "tech" | "billing";
export type DualContextLandingContext = "app" | "portal" | "inactive_app" | "none";
export type DualContextAvailableContext = "app" | "portal";

export type DualContextInternalIdentity = {
  userId: string;
  role: DualContextInternalRole;
  isActive: boolean;
  accountOwnerUserId: string;
  createdBy: string | null;
};

export type DualContextPortalIdentity = {
  contractorId: string;
  contractorName: string | null;
  accountOwnerUserId: string;
  lifecycleState: string | null;
};

export type DualContextAccess = {
  user: any | null;
  hasInternalMembership: boolean;
  hasActiveAppAccess: boolean;
  hasExpiredOrInactiveAppAccess: boolean;
  hasExistingPortalAccess: boolean;
  hasPortalAccess: boolean;
  isDualContextUser: boolean;
  availableContexts: DualContextAvailableContext[];
  preferredLandingContext: DualContextLandingContext;
  internalUser: DualContextInternalIdentity | null;
  portal: DualContextPortalIdentity | null;
  appAccessBlockedReason: OperationalMutationEntitlementReason | "inactive_internal_user" | null;
};

function parseInternalRole(value: unknown): DualContextInternalRole | null {
  if (value === "admin" || value === "office" || value === "tech" || value === "billing") {
    return value;
  }
  return null;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function landingPathForDualContextAccess(access: DualContextAccess) {
  if (access.preferredLandingContext === "app") return "/today";
  if (access.preferredLandingContext === "portal") return "/portal";
  if (access.preferredLandingContext === "inactive_app") return "/access-inactive";
  return "/login";
}

export async function resolveDualContextAccess(input: {
  supabase: any;
  user?: any | null;
}): Promise<DualContextAccess> {
  const supabase = input.supabase;
  let user = input.user ?? null;

  if (!user) {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (isSessionInvalidError(error)) {
        user = null;
      } else {
        throw error;
      }
    } else {
      user = data?.user ?? null;
    }
  }

  if (!user?.id) {
    return {
      user: null,
      hasInternalMembership: false,
      hasActiveAppAccess: false,
      hasExpiredOrInactiveAppAccess: false,
      hasExistingPortalAccess: false,
      hasPortalAccess: false,
      isDualContextUser: false,
      availableContexts: [],
      preferredLandingContext: "none",
      internalUser: null,
      portal: null,
      appAccessBlockedReason: null,
    };
  }

  const { data: internalRow, error: internalErr } = await supabase
    .from("internal_users")
    .select("user_id, role, is_active, account_owner_user_id, created_by")
    .eq("user_id", user.id)
    .maybeSingle();

  if (internalErr) throw internalErr;

  const role = parseInternalRole(internalRow?.role);
  const internalUser =
    internalRow?.user_id && internalRow?.account_owner_user_id && role
      ? {
          userId: String(internalRow.user_id),
          role,
          isActive: Boolean(internalRow.is_active),
          accountOwnerUserId: String(internalRow.account_owner_user_id),
          createdBy: internalRow.created_by ?? null,
        }
      : null;

  const portal = await resolveActiveContractorPortalMembership({
    supabase,
    userId: user.id,
  });

  let hasActiveAppAccess = false;
  let appAccessBlockedReason: DualContextAccess["appAccessBlockedReason"] = null;

  if (internalUser?.isActive) {
    const access = await resolveOperationalMutationEntitlementAccess({
      accountOwnerUserId: internalUser.accountOwnerUserId,
      supabase,
    });
    hasActiveAppAccess = access.authorized;
    appAccessBlockedReason = access.authorized ? null : access.reason;
  } else if (internalUser) {
    appAccessBlockedReason = "inactive_internal_user";
  }

  const hasInternalMembership = Boolean(internalUser);
  const hasExistingPortalAccess = Boolean(portal);
  const hasPortalAccess = hasExistingPortalAccess;
  const availableContexts: DualContextAvailableContext[] = [];
  if (hasActiveAppAccess) availableContexts.push("app");
  if (hasPortalAccess) availableContexts.push("portal");

  const preferredLandingContext: DualContextLandingContext = hasActiveAppAccess
    ? "app"
    : hasPortalAccess
      ? "portal"
      : hasInternalMembership
        ? "inactive_app"
        : "none";

  return {
    user,
    hasInternalMembership,
    hasActiveAppAccess,
    hasExpiredOrInactiveAppAccess: hasInternalMembership && !hasActiveAppAccess,
    hasExistingPortalAccess,
    hasPortalAccess,
    isDualContextUser: hasInternalMembership && hasPortalAccess,
    availableContexts,
    preferredLandingContext,
    internalUser,
    portal,
    appAccessBlockedReason,
  };
}
