// Platform account entitlement resolver
//
// Domain: platform account entitlement truth
// This is separate from:
//   - tenant billed truth (internal_invoices / internal_invoice_line_items)
//   - collected payment truth (internal_invoice_payments)
//
// Stripe placeholder fields (stripe_customer_id, stripe_subscription_id,
// stripe_price_id) exist in the DB schema but are intentionally excluded from
// all selects and types here. No application code reads or writes them in
// this slice.

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
  seatLimit: number | null;
  activeSeatCount: number;
  trialEndsAt: Date | null;
  entitlementValidUntil: Date | null;
};

const ACTIVE_STATUSES: ReadonlySet<EntitlementStatus> = new Set([
  "trial",
  "active",
  "grace",
]);

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

  // Stripe placeholder fields are explicitly excluded from the select.
  const { data, error } = await supabase
    .from("platform_account_entitlements")
    .select(
      "plan_key, entitlement_status, seat_limit, trial_ends_at, entitlement_valid_until",
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

  return {
    planKey,
    entitlementStatus,
    isEntitlementActive: isEntitlementStatusActive(entitlementStatus),
    seatLimit,
    activeSeatCount,
    trialEndsAt,
    entitlementValidUntil,
  };
}

function buildSafeDefault(activeSeatCount: number): AccountEntitlementContext {
  return {
    planKey: "starter",
    entitlementStatus: "trial",
    isEntitlementActive: true,
    seatLimit: null,
    activeSeatCount,
    trialEndsAt: null,
    entitlementValidUntil: null,
  };
}
