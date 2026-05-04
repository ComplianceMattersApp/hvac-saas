// Platform account entitlement resolver
//
// Domain: platform account entitlement truth
// This is separate from:
//   - tenant billed truth (internal_invoices / internal_invoice_line_items)
//   - collected payment truth (internal_invoice_payments)
//
// Raw Stripe identifiers remain excluded from resolver output. The resolver
// may expose narrow internal billing summary fields derived from entitlement
// Stripe columns without returning the raw identifiers themselves.

export type PlatformPlanKey = "starter" | "professional" | "enterprise";

export type EntitlementStatus =
  | "trial"
  | "active"
  | "grace"
  | "suspended"
  | "cancelled";

export type AccountEntitlementContext = {
  planKey: PlatformPlanKey;
  entitlementStatus: EntitlementStatus;
  isEntitlementActive: boolean;
  isInternalComped: boolean;
  internalCompedSignal: "notes_marker" | "none";
  seatLimit: number | null;
  activeSeatCount: number;
  trialEndsAt: Date | null;
  entitlementValidUntil: Date | null;
  billingCustomerLinked: boolean;
  billingSubscriptionLinked: boolean;
  billingSubscriptionStatus: string | null;
  billingCurrentPeriodEnd: Date | null;
  billingCancelAtPeriodEnd: boolean;
};

export type OperationalMutationEntitlementReason =
  | "allowed_active"
  | "allowed_trial"
  | "allowed_internal_comped"
  | "blocked_missing_account_owner"
  | "blocked_missing_entitlement"
  | "blocked_entitlement_query_error"
  | "blocked_trial_missing_end"
  | "blocked_trial_expired"
  | "blocked_entitlement_status"
  | "blocked_billing_subscription_status";

export type OperationalMutationEntitlementDecision = {
  authorized: boolean;
  reason: OperationalMutationEntitlementReason;
};

const ACTIVE_STATUSES: ReadonlySet<EntitlementStatus> = new Set([
  "trial",
  "active",
  "grace",
]);

export const INTERNAL_COMPED_NOTES_MARKER = "internal_comped_v1";

function isEntitlementStatusActive(status: EntitlementStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

function normalizePlanKey(value: unknown): PlatformPlanKey {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "professional") return "professional";
  if (v === "enterprise") return "enterprise";
  return "starter";
}

function normalizeEntitlementStatus(value: unknown): EntitlementStatus {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "active") return "active";
  if (v === "grace") return "grace";
  if (v === "suspended") return "suspended";
  if (v === "cancelled") return "cancelled";
  return "trial";
}

function normalizeBillingSubscriptionStatus(value: unknown): string | null {
  const v = String(value ?? "").trim().toLowerCase();
  return v || null;
}

const BLOCKED_BILLING_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  "past_due",
  "inactive",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
  "suspended",
  "canceled",
  "cancelled",
]);

async function timeEntitlementPhase<T>(
  timing: ((phase: string, elapsedMs: number) => void) | undefined,
  phase: string,
  work: () => Promise<T>,
): Promise<T> {
  if (!timing) return work();
  const startedAt = Date.now();
  try {
    return await work();
  } finally {
    timing(phase, Date.now() - startedAt);
  }
}

function hasInternalCompedNotesMarker(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes(INTERNAL_COMPED_NOTES_MARKER);
}

export function resolveInternalCompedState(params: {
  entitlementStatus: EntitlementStatus;
  seatLimit: number | null;
  billingCustomerLinked: boolean;
  billingSubscriptionLinked: boolean;
  notes: unknown;
}) {
  const hasApprovedSignal = hasInternalCompedNotesMarker(params.notes);
  const hasUnlimitedUsers = params.seatLimit == null;
  const noStripeLinkage =
    !params.billingCustomerLinked && !params.billingSubscriptionLinked;
  const isActiveComped = params.entitlementStatus === "active";

  const isInternalComped =
    hasApprovedSignal && hasUnlimitedUsers && noStripeLinkage && isActiveComped;

  return {
    isInternalComped,
    internalCompedSignal: isInternalComped
      ? ("notes_marker" as const)
      : ("none" as const),
  };
}

async function deriveActiveSeatCount(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<number> {
  const { count, error } = await params.supabase
    .from("internal_users")
    .select("user_id", { count: "exact", head: true })
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("is_active", true);

  if (error) {
    console.warn("platform-entitlement: failed to count active internal users", {
      accountOwnerUserId: params.accountOwnerUserId,
      error: error.message ?? null,
    });
    return 0;
  }

  return Number.isFinite(count) ? Number(count) : 0;
}

/**
 * Resolve platform account entitlement context for a given account owner.
 *
 * Safe-default rule: when no entitlement row exists for the account, returns
 * a safe default context (trial / starter / active) rather than throwing or
 * returning null.
 *
 * Seat count is always derived live from internal_users at query time.
 * Contractor users (contractor_users) are not counted as platform seats.
 */
export async function resolveAccountEntitlement(
  accountOwnerUserId: string,
  supabase: any,
): Promise<AccountEntitlementContext> {
  const normalizedOwnerId = String(accountOwnerUserId ?? "").trim();

  const activeSeatCount = await deriveActiveSeatCount({
    supabase,
    accountOwnerUserId: normalizedOwnerId,
  });

  if (!normalizedOwnerId) {
    return buildSafeDefault(activeSeatCount);
  }

  const { data, error } = await supabase
    .from("platform_account_entitlements")
    .select(
      [
        "plan_key",
        "entitlement_status",
        "seat_limit",
        "trial_ends_at",
        "entitlement_valid_until",
        "notes",
        "stripe_customer_id",
        "stripe_subscription_id",
        "stripe_subscription_status",
        "stripe_current_period_end",
        "stripe_cancel_at_period_end",
      ].join(", "),
    )
    .eq("account_owner_user_id", normalizedOwnerId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to resolve platform account entitlement: ${error.message ?? "unknown error"}`,
    );
  }

  if (!data) {
    return buildSafeDefault(activeSeatCount);
  }

  const planKey = normalizePlanKey(data.plan_key);
  const entitlementStatus = normalizeEntitlementStatus(data.entitlement_status);
  const seatLimit =
    data.seat_limit != null && Number.isInteger(Number(data.seat_limit))
      ? Number(data.seat_limit)
      : null;
  const trialEndsAt = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
  const entitlementValidUntil = data.entitlement_valid_until
    ? new Date(data.entitlement_valid_until)
    : null;
  const billingCustomerLinked = Boolean(String(data.stripe_customer_id ?? "").trim());
  const billingSubscriptionLinked = Boolean(
    String(data.stripe_subscription_id ?? "").trim(),
  );
  const billingSubscriptionStatus =
    String(data.stripe_subscription_status ?? "").trim() || null;
  const billingCurrentPeriodEnd = data.stripe_current_period_end
    ? new Date(data.stripe_current_period_end)
    : null;
  const billingCancelAtPeriodEnd = Boolean(data.stripe_cancel_at_period_end);
  const internalCompedState = resolveInternalCompedState({
    entitlementStatus,
    seatLimit,
    billingCustomerLinked,
    billingSubscriptionLinked,
    notes: data.notes,
  });

  return {
    planKey,
    entitlementStatus,
    isEntitlementActive: isEntitlementStatusActive(entitlementStatus),
    isInternalComped: internalCompedState.isInternalComped,
    internalCompedSignal: internalCompedState.internalCompedSignal,
    seatLimit,
    activeSeatCount,
    trialEndsAt,
    entitlementValidUntil,
    billingCustomerLinked,
    billingSubscriptionLinked,
    billingSubscriptionStatus,
    billingCurrentPeriodEnd,
    billingCancelAtPeriodEnd,
  };
}

export async function resolveOperationalMutationEntitlementAccess(params: {
  accountOwnerUserId: string;
  supabase: any;
  now?: Date;
  timing?: (phase: string, elapsedMs: number) => void;
}): Promise<OperationalMutationEntitlementDecision> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!accountOwnerUserId) {
    return {
      authorized: false,
      reason: "blocked_missing_account_owner",
    };
  }

  const nowMs = (params.now ?? new Date()).getTime();
  const { data, error } = await timeEntitlementPhase(
    params.timing,
    "entitlementLookup",
    async () =>
      params.supabase
        .from("platform_account_entitlements")
        .select(
          [
            "entitlement_status",
            "seat_limit",
            "trial_ends_at",
            "notes",
            "stripe_customer_id",
            "stripe_subscription_id",
            "stripe_subscription_status",
          ].join(", "),
        )
        .eq("account_owner_user_id", accountOwnerUserId)
        .maybeSingle(),
  );

  if (error) {
    return {
      authorized: false,
      reason: "blocked_entitlement_query_error",
    };
  }

  if (!data) {
    return {
      authorized: false,
      reason: "blocked_missing_entitlement",
    };
  }

  const entitlementStatus = normalizeEntitlementStatus(data.entitlement_status);
  const seatLimit =
    data.seat_limit != null && Number.isInteger(Number(data.seat_limit))
      ? Number(data.seat_limit)
      : null;
  const trialEndsAt = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
  const billingCustomerLinked = Boolean(String(data.stripe_customer_id ?? "").trim());
  const billingSubscriptionLinked = Boolean(
    String(data.stripe_subscription_id ?? "").trim(),
  );
  const internalCompedState = resolveInternalCompedState({
    entitlementStatus,
    seatLimit,
    billingCustomerLinked,
    billingSubscriptionLinked,
    notes: data.notes,
  });

  if (internalCompedState.isInternalComped) {
    return {
      authorized: true,
      reason: "allowed_internal_comped",
    };
  }

  if (entitlementStatus === "active") {
    const billingSubscriptionStatus = normalizeBillingSubscriptionStatus(
      data.stripe_subscription_status,
    );

    if (
      billingSubscriptionStatus &&
      BLOCKED_BILLING_SUBSCRIPTION_STATUSES.has(billingSubscriptionStatus)
    ) {
      return {
        authorized: false,
        reason: "blocked_billing_subscription_status",
      };
    }

    return {
      authorized: true,
      reason: "allowed_active",
    };
  }

  if (entitlementStatus === "trial") {
    if (!trialEndsAt || !Number.isFinite(trialEndsAt.getTime())) {
      return {
        authorized: false,
        reason: "blocked_trial_missing_end",
      };
    }

    if (trialEndsAt.getTime() <= nowMs) {
      return {
        authorized: false,
        reason: "blocked_trial_expired",
      };
    }

    return {
      authorized: true,
      reason: "allowed_trial",
    };
  }

  return {
    authorized: false,
    reason: "blocked_entitlement_status",
  };
}

function buildSafeDefault(activeSeatCount: number): AccountEntitlementContext {
  return {
    planKey: "starter",
    entitlementStatus: "trial",
    isEntitlementActive: true,
    isInternalComped: false,
    internalCompedSignal: "none",
    seatLimit: null,
    activeSeatCount,
    trialEndsAt: null,
    entitlementValidUntil: null,
    billingCustomerLinked: false,
    billingSubscriptionLinked: false,
    billingSubscriptionStatus: null,
    billingCurrentPeriodEnd: null,
    billingCancelAtPeriodEnd: false,
  };
}
