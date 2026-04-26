import { type BillingMode } from "@/lib/business/internal-business-profile";

const FIRST_OWNER_MARKER_KEY = "first_owner_provisioning_v1";

type RouteTarget = "/portal" | "/ops" | "/ops/admin";

type InternalUserRow = {
  user_id: string | null;
  account_owner_user_id: string | null;
  role: string | null;
  is_active: boolean | null;
};

type OwnerScopedRow = {
  account_owner_user_id: string | null;
};

export type FirstOwnerRoutingDecision = {
  target: RouteTarget | null;
  reason:
    | "CONTRACTOR"
    | "INTERNAL_STANDARD"
    | "ACCOUNT_NOT_CONFIGURED"
    | "FIRST_OWNER_SETUP_INCOMPLETE";
};

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function hasFirstOwnerMarker(userMetadata: unknown): boolean {
  const marker = (userMetadata as any)?.[FIRST_OWNER_MARKER_KEY];
  return marker?.is_first_owner === true;
}

function isOwnerEquivalentInternalRole(role: unknown): boolean {
  const normalized = toCleanString(role).toLowerCase();
  return normalized === "admin" || normalized === "owner";
}

export async function resolveSetPasswordDestinationWithFirstOwnerGate(params: {
  supabase: any;
  userId: string;
  userMetadata: unknown;
  isContractor: boolean;
}): Promise<FirstOwnerRoutingDecision> {
  if (params.isContractor) {
    return {
      target: "/portal",
      reason: "CONTRACTOR",
    };
  }

  const userId = toCleanString(params.userId);
  if (!userId) {
    return {
      target: null,
      reason: "ACCOUNT_NOT_CONFIGURED",
    };
  }

  const { data: internalUser, error: internalUserError } = await params.supabase
    .from("internal_users")
    .select("user_id, account_owner_user_id, role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (internalUserError) throw internalUserError;

  const internal = (internalUser ?? null) as InternalUserRow | null;
  const hasActiveInternalUser = Boolean(internal?.user_id) && Boolean(internal?.is_active);

  if (!hasActiveInternalUser) {
    return {
      target: null,
      reason: "ACCOUNT_NOT_CONFIGURED",
    };
  }

  if (!hasFirstOwnerMarker(params.userMetadata)) {
    return {
      target: "/ops",
      reason: "INTERNAL_STANDARD",
    };
  }

  // Fail closed for marker-tagged users unless owner-anchor + companion rows are valid.
  const ownerAnchor = toCleanString(internal?.account_owner_user_id);
  const ownerRoleValid = isOwnerEquivalentInternalRole(internal?.role);

  if (
    toCleanString(internal?.user_id) !== userId ||
    ownerAnchor !== userId ||
    !ownerRoleValid ||
    !Boolean(internal?.is_active)
  ) {
    return {
      target: null,
      reason: "FIRST_OWNER_SETUP_INCOMPLETE",
    };
  }

  const { data: businessProfile, error: businessProfileError } = await params.supabase
    .from("internal_business_profiles")
    .select("account_owner_user_id")
    .eq("account_owner_user_id", ownerAnchor)
    .maybeSingle();

  if (businessProfileError) throw businessProfileError;

  const business = (businessProfile ?? null) as OwnerScopedRow | null;
  if (toCleanString(business?.account_owner_user_id) !== ownerAnchor) {
    return {
      target: null,
      reason: "FIRST_OWNER_SETUP_INCOMPLETE",
    };
  }

  const { data: entitlement, error: entitlementError } = await params.supabase
    .from("platform_account_entitlements")
    .select("account_owner_user_id")
    .eq("account_owner_user_id", ownerAnchor)
    .maybeSingle();

  if (entitlementError) throw entitlementError;

  const entitlementRow = (entitlement ?? null) as OwnerScopedRow | null;
  if (toCleanString(entitlementRow?.account_owner_user_id) !== ownerAnchor) {
    return {
      target: null,
      reason: "FIRST_OWNER_SETUP_INCOMPLETE",
    };
  }

  return {
    target: "/ops/admin",
    reason: "INTERNAL_STANDARD",
  };
}
