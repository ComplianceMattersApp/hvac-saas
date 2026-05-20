import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import {
  getStripeServerClient,
  resolvePlatformBillingAppUrl,
} from "@/lib/business/platform-billing-stripe";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";

type InternalBusinessProfileConnectRow = {
  account_owner_user_id: string;
  display_name: string | null;
  stripe_connected_account_id: string | null;
};

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function deriveOnboardingStatusFromStripeAccount(account: Stripe.Account) {
  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const detailsSubmitted = Boolean(account.details_submitted);

  if (chargesEnabled && payoutsEnabled && detailsSubmitted) {
    return "complete";
  }

  const disabledReason = toCleanString(account.requirements?.disabled_reason);
  if (disabledReason) {
    return "restricted";
  }

  return "pending";
}

async function getOrCreateInternalBusinessProfileRow(params: {
  admin: any;
  accountOwnerUserId: string;
}) {
  const ownerId = toCleanString(params.accountOwnerUserId);

  const { data, error } = await params.admin
    .from("internal_business_profiles")
    .select("account_owner_user_id, display_name, stripe_connected_account_id")
    .eq("account_owner_user_id", ownerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load internal business profile: ${error.message ?? "unknown error"}`);
  }

  if (data?.account_owner_user_id) {
    return data as InternalBusinessProfileConnectRow;
  }

  const { data: inserted, error: insertError } = await params.admin
    .from("internal_business_profiles")
    .upsert(
      {
        account_owner_user_id: ownerId,
        display_name: "Compliance Matters",
      },
      {
        onConflict: "account_owner_user_id",
      },
    )
    .select("account_owner_user_id, display_name, stripe_connected_account_id")
    .single();

  if (insertError) {
    throw new Error(
      `Failed to create internal business profile for Stripe Connect: ${insertError.message ?? "unknown error"}`,
    );
  }

  return inserted as InternalBusinessProfileConnectRow;
}

async function updateInternalBusinessProfileConnectFields(params: {
  admin: any;
  accountOwnerUserId: string;
  patch: Record<string, unknown>;
}) {
  const ownerId = toCleanString(params.accountOwnerUserId);

  const { error } = await params.admin
    .from("internal_business_profiles")
    .update(params.patch)
    .eq("account_owner_user_id", ownerId);

  if (error) {
    throw new Error(`Failed to update Stripe Connect readiness: ${error.message ?? "unknown error"}`);
  }
}

export async function ensureTenantStripeConnectedAccount(params: {
  accountOwnerUserId: string;
  admin?: any;
  stripe?: Stripe;
}) {
  const ownerId = toCleanString(params.accountOwnerUserId);
  if (!ownerId) {
    throw new Error("Account owner user id is required.");
  }

  const admin = params.admin ?? createAdminClient();
  const stripe = params.stripe ?? getStripeServerClient();

  const profile = await getOrCreateInternalBusinessProfileRow({
    admin,
    accountOwnerUserId: ownerId,
  });

  const existingConnectedAccountId = toCleanString(profile.stripe_connected_account_id);
  if (existingConnectedAccountId) {
    return {
      connectedAccountId: existingConnectedAccountId,
      created: false,
    };
  }

  const account = await stripe.accounts.create({
    type: "express",
    metadata: {
      account_owner_user_id: ownerId,
      tenant_payments_model: "direct_charge_connected_account",
    },
  });

  await updateInternalBusinessProfileConnectFields({
    admin,
    accountOwnerUserId: ownerId,
    patch: {
      stripe_connected_account_id: account.id,
      stripe_connect_onboarding_status: "pending",
      stripe_connect_last_synced_at: new Date().toISOString(),
    },
  });

  return {
    connectedAccountId: account.id,
    created: true,
  };
}

export async function createTenantStripeConnectOnboardingLink(params: {
  accountOwnerUserId: string;
  admin?: any;
  stripe?: Stripe;
}) {
  const ownerId = toCleanString(params.accountOwnerUserId);
  if (!ownerId) {
    throw new Error("Account owner user id is required.");
  }

  const admin = params.admin ?? createAdminClient();
  const stripe = params.stripe ?? getStripeServerClient();
  const appUrl = resolvePlatformBillingAppUrl();

  if (!appUrl) {
    throw new Error("APP_URL is not configured.");
  }

  const ensured = await ensureTenantStripeConnectedAccount({
    accountOwnerUserId: ownerId,
    admin,
    stripe,
  });

  const accountLink = await stripe.accountLinks.create({
    account: ensured.connectedAccountId,
    type: "account_onboarding",
    refresh_url: `${appUrl}/ops/admin/company-profile?notice=stripe_connect_onboarding_refresh`,
    return_url: `${appUrl}/ops/admin/company-profile?notice=stripe_connect_onboarding_returned`,
  });

  return {
    url: accountLink.url,
    connectedAccountId: ensured.connectedAccountId,
    createdConnectedAccount: ensured.created,
  };
}

export async function syncTenantStripeConnectReadinessForAccountOwner(params: {
  accountOwnerUserId: string;
  admin?: any;
  stripe?: Stripe;
}) {
  const ownerId = toCleanString(params.accountOwnerUserId);
  if (!ownerId) {
    throw new Error("Account owner user id is required.");
  }

  const admin = params.admin ?? createAdminClient();
  const stripe = params.stripe ?? getStripeServerClient();

  const profile = await getOrCreateInternalBusinessProfileRow({
    admin,
    accountOwnerUserId: ownerId,
  });

  const connectedAccountId = toCleanString(profile.stripe_connected_account_id);
  if (!connectedAccountId) {
    await updateInternalBusinessProfileConnectFields({
      admin,
      accountOwnerUserId: ownerId,
      patch: {
        stripe_connect_onboarding_status: "not_started",
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_details_submitted: false,
        stripe_connect_disabled_reason: null,
        stripe_connect_last_synced_at: new Date().toISOString(),
      },
    });

    return resolveTenantStripeConnectReadiness(ownerId, admin);
  }

  const account = await stripe.accounts.retrieve(connectedAccountId);
  const disabledReason = toCleanString(account.requirements?.disabled_reason) || null;

  await updateInternalBusinessProfileConnectFields({
    admin,
    accountOwnerUserId: ownerId,
    patch: {
      stripe_charges_enabled: Boolean(account.charges_enabled),
      stripe_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_details_submitted: Boolean(account.details_submitted),
      stripe_connect_onboarding_status: deriveOnboardingStatusFromStripeAccount(account),
      stripe_connect_disabled_reason: disabledReason,
      stripe_connect_last_synced_at: new Date().toISOString(),
    },
  });

  return resolveTenantStripeConnectReadiness(ownerId, admin);
}
