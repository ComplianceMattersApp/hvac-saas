import {
  resolveOperationalMutationEntitlementAccess,
  type OperationalMutationEntitlementReason,
} from "@/lib/business/platform-entitlement";
import { isSessionInvalidError } from "@/lib/auth/session-error";

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

function pickRelatedObject<T extends Record<string, unknown>>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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
      hasPortalAccess: false,
      isDualContextUser: false,
      availableContexts: [],
      preferredLandingContext: "none",
      internalUser: null,
      portal: null,
      appAccessBlockedReason: null,
    };
  }

  const [{ data: internalRow, error: internalErr }, { data: contractorRow, error: contractorErr }] =
    await Promise.all([
      supabase
        .from("internal_users")
        .select("user_id, role, is_active, account_owner_user_id, created_by")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("contractor_users")
        .select("contractor_id, contractors ( id, name, lifecycle_state, owner_user_id )")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  if (internalErr) throw internalErr;
  if (contractorErr) throw contractorErr;

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

  const contractor = pickRelatedObject((contractorRow as any)?.contractors);
  const lifecycleState = normalizeText((contractor as any)?.lifecycle_state).toLowerCase() || null;
  const contractorId = normalizeText((contractorRow as any)?.contractor_id);
  const portalAccountOwnerUserId = normalizeText((contractor as any)?.owner_user_id);
  const portal =
    contractorId && portalAccountOwnerUserId && (!lifecycleState || lifecycleState === "active")
      ? {
          contractorId,
          contractorName: normalizeText((contractor as any)?.name) || null,
          accountOwnerUserId: portalAccountOwnerUserId,
          lifecycleState,
        }
      : null;

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
  const hasPortalAccess = Boolean(portal);
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
    hasPortalAccess,
    isDualContextUser: hasInternalMembership && hasPortalAccess,
    availableContexts,
    preferredLandingContext,
    internalUser,
    portal,
    appAccessBlockedReason,
  };
}
