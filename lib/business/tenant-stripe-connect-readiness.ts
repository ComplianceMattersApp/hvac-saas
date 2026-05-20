import type { SupabaseClient } from "@supabase/supabase-js";

type InternalBusinessStripeConnectRow = {
  stripe_connected_account_id: string | null;
  stripe_connect_onboarding_status: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  stripe_details_submitted: boolean | null;
  stripe_connect_disabled_reason: string | null;
  stripe_connect_last_synced_at: string | null;
};

export type TenantStripeConnectReadiness = {
  connectedAccountId: string | null;
  onboardingStatus: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  lastSyncedAt: string | null;
  isReady: boolean;
};

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeOnboardingStatus(value: unknown) {
  const normalized = toCleanString(value).toLowerCase();
  return normalized || "not_started";
}

function isOnboardingComplete(status: string) {
  const normalized = normalizeOnboardingStatus(status);
  return normalized === "complete" || normalized === "completed" || normalized === "ready";
}

export function isTenantStripePaymentReady(readiness: {
  connectedAccountId?: string | null;
  onboardingStatus?: string | null;
  chargesEnabled?: boolean | null;
  payoutsEnabled?: boolean | null;
  detailsSubmitted?: boolean | null;
}) {
  const connectedAccountId = toCleanString(readiness.connectedAccountId);
  const onboardingStatus = normalizeOnboardingStatus(readiness.onboardingStatus);

  return (
    Boolean(connectedAccountId) &&
    Boolean(readiness.chargesEnabled) &&
    Boolean(readiness.payoutsEnabled) &&
    Boolean(readiness.detailsSubmitted) &&
    isOnboardingComplete(onboardingStatus)
  );
}

export async function resolveTenantStripeConnectReadiness(
  accountOwnerUserId: string,
  supabase: SupabaseClient | any,
): Promise<TenantStripeConnectReadiness> {
  const ownerId = toCleanString(accountOwnerUserId);

  if (!ownerId) {
    return {
      connectedAccountId: null,
      onboardingStatus: "not_started",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      disabledReason: null,
      lastSyncedAt: null,
      isReady: false,
    };
  }

  const { data, error } = await supabase
    .from("internal_business_profiles")
    .select(
      [
        "stripe_connected_account_id",
        "stripe_connect_onboarding_status",
        "stripe_charges_enabled",
        "stripe_payouts_enabled",
        "stripe_details_submitted",
        "stripe_connect_disabled_reason",
        "stripe_connect_last_synced_at",
      ].join(", "),
    )
    .eq("account_owner_user_id", ownerId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to resolve tenant Stripe Connect readiness: ${error.message ?? "unknown error"}`,
    );
  }

  const row = (data ?? null) as InternalBusinessStripeConnectRow | null;

  const connectedAccountId = toCleanString(row?.stripe_connected_account_id) || null;
  const onboardingStatus = normalizeOnboardingStatus(row?.stripe_connect_onboarding_status);
  const chargesEnabled = Boolean(row?.stripe_charges_enabled);
  const payoutsEnabled = Boolean(row?.stripe_payouts_enabled);
  const detailsSubmitted = Boolean(row?.stripe_details_submitted);
  const disabledReason = toCleanString(row?.stripe_connect_disabled_reason) || null;
  const lastSyncedAt = toCleanString(row?.stripe_connect_last_synced_at) || null;

  return {
    connectedAccountId,
    onboardingStatus,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    disabledReason,
    lastSyncedAt,
    isReady: isTenantStripePaymentReady({
      connectedAccountId,
      onboardingStatus,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
    }),
  };
}
