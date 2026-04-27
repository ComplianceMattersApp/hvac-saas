import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import type { EntitlementStatus, PlatformPlanKey } from "@/lib/business/platform-entitlement";

type PlatformEntitlementStripeRow = {
  account_owner_user_id: string;
  plan_key: string | null;
  entitlement_status: string | null;
  trial_ends_at: string | null;
  entitlement_valid_until: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_subscription_status: string | null;
  stripe_current_period_end: string | null;
  stripe_cancel_at_period_end: boolean | null;
  stripe_last_webhook_event_id: string | null;
  stripe_last_synced_at: string | null;
};

type PlatformStripeSubscriptionLike = {
  id?: string | null;
  customer?: string | Stripe.Customer | Stripe.DeletedCustomer | null;
  status?: string | null;
  current_period_end?: number | null;
  trial_end?: number | null;
  cancel_at_period_end?: boolean | null;
  items?: {
    data?: Array<{
      current_period_end?: number | null;
      price?: {
        id?: string | null;
      } | null;
    }>;
  } | null;
};

export type PlatformBillingAvailability = {
  checkoutAvailable: boolean;
  portalAvailable: boolean;
  webhookAvailable: boolean;
  missingKeys: string[];
};

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePlanKey(value: unknown): PlatformPlanKey {
  const normalized = toCleanString(value).toLowerCase();
  if (normalized === "professional") return "professional";
  if (normalized === "enterprise") return "enterprise";
  return "starter";
}

function normalizeEntitlementStatus(value: unknown): EntitlementStatus {
  const normalized = toCleanString(value).toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "grace") return "grace";
  if (normalized === "suspended") return "suspended";
  if (normalized === "cancelled") return "cancelled";
  return "trial";
}

function toIsoFromUnix(value: number | null | undefined) {
  if (!Number.isFinite(value)) return null;
  return new Date(Number(value) * 1000).toISOString();
}

function resolveSubscriptionCurrentPeriodEnd(subscription: PlatformStripeSubscriptionLike) {
  const itemPeriodEnds = (subscription.items?.data ?? [])
    .map((item) => item.current_period_end)
    .filter((value): value is number => Number.isFinite(value));

  if (itemPeriodEnds.length > 0) {
    return Math.min(...itemPeriodEnds);
  }

  // Backward compatibility for older Stripe API payloads.
  return Number.isFinite(subscription.current_period_end)
    ? Number(subscription.current_period_end)
    : null;
}

function extractStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
) {
  if (typeof customer === "string") return toCleanString(customer) || null;
  return toCleanString(customer?.id) || null;
}

export function mapStripeSubscriptionStatusToEntitlementStatus(
  status: string | null | undefined,
): EntitlementStatus {
  const normalized = toCleanString(status).toLowerCase();
  if (normalized === "trialing") return "trial";
  if (normalized === "active") return "active";
  if (normalized === "past_due") return "grace";
  if (normalized === "canceled") return "cancelled";
  if (
    normalized === "incomplete" ||
    normalized === "incomplete_expired" ||
    normalized === "unpaid" ||
    normalized === "paused"
  ) {
    return "suspended";
  }
  return "trial";
}

export function resolvePlatformBillingAppUrl() {
  const candidates = [
    String(process.env.APP_URL ?? "").trim(),
    String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim(),
    String(process.env.SITE_URL ?? "").trim(),
    process.env.VERCEL_URL ? `https://${String(process.env.VERCEL_URL).trim()}` : "",
  ].filter(Boolean);

  for (const raw of candidates) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      return raw.replace(/\/$/, "");
    } catch {
      // Ignore invalid app URL values and continue scanning.
    }
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  return null;
}

export function getPlatformBillingAvailability(): PlatformBillingAvailability {
  const hasSecretKey = Boolean(toCleanString(process.env.STRIPE_SECRET_KEY));
  const hasWebhookSecret = Boolean(toCleanString(process.env.STRIPE_WEBHOOK_SECRET));
  const hasPriceId = Boolean(toCleanString(process.env.STRIPE_PRICE_ID));
  const hasAppUrl = Boolean(resolvePlatformBillingAppUrl());

  const missingKeys = [
    hasSecretKey ? "" : "STRIPE_SECRET_KEY",
    hasWebhookSecret ? "" : "STRIPE_WEBHOOK_SECRET",
    hasPriceId ? "" : "STRIPE_PRICE_ID",
    hasAppUrl ? "" : "APP_URL|NEXT_PUBLIC_APP_URL|SITE_URL|VERCEL_URL",
  ].filter(Boolean);

  return {
    checkoutAvailable: hasSecretKey && hasPriceId && hasAppUrl,
    portalAvailable: hasSecretKey && hasAppUrl,
    webhookAvailable: hasSecretKey && hasWebhookSecret,
    missingKeys,
  };
}

function requireStripeSecretKey() {
  const key = toCleanString(process.env.STRIPE_SECRET_KEY);
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return key;
}

export function requireStripeWebhookSecret() {
  const secret = toCleanString(process.env.STRIPE_WEBHOOK_SECRET);
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  return secret;
}

export function requireStripePriceId() {
  const priceId = toCleanString(process.env.STRIPE_PRICE_ID);
  if (!priceId) throw new Error("STRIPE_PRICE_ID is not configured.");
  return priceId;
}

export function getStripeServerClient() {
  return new Stripe(requireStripeSecretKey(), {
    apiVersion: "2026-04-22.dahlia",
  });
}

async function getPlatformEntitlementByOwnerId(admin: any, accountOwnerUserId: string) {
  const { data, error } = await admin
    .from("platform_account_entitlements")
    .select(
      [
        "account_owner_user_id",
        "plan_key",
        "entitlement_status",
        "trial_ends_at",
        "entitlement_valid_until",
        "stripe_customer_id",
        "stripe_subscription_id",
        "stripe_price_id",
        "stripe_subscription_status",
        "stripe_current_period_end",
        "stripe_cancel_at_period_end",
        "stripe_last_webhook_event_id",
        "stripe_last_synced_at",
      ].join(", "),
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as PlatformEntitlementStripeRow | null;
}

async function getPlatformEntitlementByStripeCustomerId(admin: any, stripeCustomerId: string) {
  const { data, error } = await admin
    .from("platform_account_entitlements")
    .select(
      [
        "account_owner_user_id",
        "plan_key",
        "entitlement_status",
        "trial_ends_at",
        "entitlement_valid_until",
        "stripe_customer_id",
        "stripe_subscription_id",
        "stripe_price_id",
        "stripe_subscription_status",
        "stripe_current_period_end",
        "stripe_cancel_at_period_end",
        "stripe_last_webhook_event_id",
        "stripe_last_synced_at",
      ].join(", "),
    )
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as PlatformEntitlementStripeRow | null;
}

async function getPlatformEntitlementByStripeSubscriptionId(admin: any, stripeSubscriptionId: string) {
  const { data, error } = await admin
    .from("platform_account_entitlements")
    .select(
      [
        "account_owner_user_id",
        "plan_key",
        "entitlement_status",
        "trial_ends_at",
        "entitlement_valid_until",
        "stripe_customer_id",
        "stripe_subscription_id",
        "stripe_price_id",
        "stripe_subscription_status",
        "stripe_current_period_end",
        "stripe_cancel_at_period_end",
        "stripe_last_webhook_event_id",
        "stripe_last_synced_at",
      ].join(", "),
    )
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as PlatformEntitlementStripeRow | null;
}

async function ensurePlatformEntitlementRow(admin: any, accountOwnerUserId: string) {
  const normalizedOwnerId = toCleanString(accountOwnerUserId);
  if (!normalizedOwnerId) {
    throw new Error("Account owner user id is required.");
  }

  const existing = await getPlatformEntitlementByOwnerId(admin, normalizedOwnerId);
  if (existing) return existing;

  const { data, error } = await admin
    .from("platform_account_entitlements")
    .upsert(
      {
        account_owner_user_id: normalizedOwnerId,
        plan_key: "starter",
        entitlement_status: "trial",
      },
      { onConflict: "account_owner_user_id" },
    )
    .select(
      [
        "account_owner_user_id",
        "plan_key",
        "entitlement_status",
        "trial_ends_at",
        "entitlement_valid_until",
        "stripe_customer_id",
        "stripe_subscription_id",
        "stripe_price_id",
        "stripe_subscription_status",
        "stripe_current_period_end",
        "stripe_cancel_at_period_end",
        "stripe_last_webhook_event_id",
        "stripe_last_synced_at",
      ].join(", "),
    )
    .single();

  if (error) throw error;
  return data as PlatformEntitlementStripeRow;
}

async function resolvePlatformBillingCustomerDetails(admin: any, accountOwnerUserId: string) {
  const [authUserResult, businessProfileResult] = await Promise.all([
    admin.auth.admin.getUserById(accountOwnerUserId),
    admin
      .from("internal_business_profiles")
      .select("display_name")
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle(),
  ]);

  if (authUserResult.error) throw authUserResult.error;
  if (businessProfileResult.error) throw businessProfileResult.error;

  const authUser = (authUserResult.data as any)?.user;
  const email = toCleanString(authUser?.email) || undefined;
  const name =
    toCleanString((businessProfileResult.data as any)?.display_name) || email || "Compliance Matters";

  return { email, name };
}

async function patchPlatformEntitlementRow(
  admin: any,
  row: PlatformEntitlementStripeRow,
  patch: Record<string, unknown>,
) {
  const payload = {
    account_owner_user_id: row.account_owner_user_id,
    plan_key: normalizePlanKey(row.plan_key),
    entitlement_status: normalizeEntitlementStatus(patch.entitlement_status ?? row.entitlement_status),
    trial_ends_at: patch.trial_ends_at ?? row.trial_ends_at,
    entitlement_valid_until: patch.entitlement_valid_until ?? row.entitlement_valid_until,
    stripe_customer_id: patch.stripe_customer_id ?? row.stripe_customer_id,
    stripe_subscription_id: patch.stripe_subscription_id ?? row.stripe_subscription_id,
    stripe_price_id: patch.stripe_price_id ?? row.stripe_price_id,
    stripe_subscription_status:
      patch.stripe_subscription_status ?? row.stripe_subscription_status,
    stripe_current_period_end:
      patch.stripe_current_period_end ?? row.stripe_current_period_end,
    stripe_cancel_at_period_end:
      patch.stripe_cancel_at_period_end ?? row.stripe_cancel_at_period_end ?? false,
    stripe_last_webhook_event_id:
      patch.stripe_last_webhook_event_id ?? row.stripe_last_webhook_event_id,
    stripe_last_synced_at: patch.stripe_last_synced_at ?? row.stripe_last_synced_at,
  };

  const { data, error } = await admin
    .from("platform_account_entitlements")
    .upsert(payload, { onConflict: "account_owner_user_id" })
    .select(
      [
        "account_owner_user_id",
        "plan_key",
        "entitlement_status",
        "trial_ends_at",
        "entitlement_valid_until",
        "stripe_customer_id",
        "stripe_subscription_id",
        "stripe_price_id",
        "stripe_subscription_status",
        "stripe_current_period_end",
        "stripe_cancel_at_period_end",
        "stripe_last_webhook_event_id",
        "stripe_last_synced_at",
      ].join(", "),
    )
    .single();

  if (error) throw error;
  return data as PlatformEntitlementStripeRow;
}

export async function ensureStripeCustomerForAccountOwner(params: {
  accountOwnerUserId: string;
  admin?: any;
  stripe?: Stripe;
}) {
  const admin = params.admin ?? createAdminClient();
  const stripe = params.stripe ?? getStripeServerClient();
  const entitlement = await ensurePlatformEntitlementRow(admin, params.accountOwnerUserId);

  if (toCleanString(entitlement.stripe_customer_id)) {
    return {
      entitlement,
      stripeCustomerId: String(entitlement.stripe_customer_id),
    };
  }

  const customerDetails = await resolvePlatformBillingCustomerDetails(
    admin,
    params.accountOwnerUserId,
  );

  const customer = await stripe.customers.create({
    email: customerDetails.email,
    name: customerDetails.name,
    metadata: {
      account_owner_user_id: params.accountOwnerUserId,
    },
  });

  const updated = await patchPlatformEntitlementRow(admin, entitlement, {
    stripe_customer_id: customer.id,
    stripe_last_synced_at: new Date().toISOString(),
  });

  return {
    entitlement: updated,
    stripeCustomerId: customer.id,
  };
}

export async function createPlatformSubscriptionCheckoutSession(params: {
  accountOwnerUserId: string;
  successUrl?: string;
  cancelUrl?: string;
}) {
  const appUrl = resolvePlatformBillingAppUrl();
  if (!appUrl) throw new Error("Platform billing app URL is not configured.");

  const stripe = getStripeServerClient();
  const admin = createAdminClient();
  const priceId = requireStripePriceId();

  const { stripeCustomerId } = await ensureStripeCustomerForAccountOwner({
    accountOwnerUserId: params.accountOwnerUserId,
    admin,
    stripe,
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      account_owner_user_id: params.accountOwnerUserId,
    },
    subscription_data: {
      metadata: {
        account_owner_user_id: params.accountOwnerUserId,
      },
    },
    success_url:
      params.successUrl ??
      `${appUrl}/ops/admin/company-profile?notice=platform_billing_checkout_return`,
    cancel_url:
      params.cancelUrl ??
      `${appUrl}/ops/admin/company-profile?notice=platform_billing_checkout_cancelled`,
  });

  if (!session.url) throw new Error("Stripe Checkout session did not return a URL.");

  return {
    session,
    url: session.url,
  };
}

export async function createPlatformBillingPortalSession(params: {
  accountOwnerUserId: string;
  returnUrl?: string;
}) {
  const appUrl = resolvePlatformBillingAppUrl();
  if (!appUrl) throw new Error("Platform billing app URL is not configured.");

  const stripe = getStripeServerClient();
  const admin = createAdminClient();
  const { stripeCustomerId } = await ensureStripeCustomerForAccountOwner({
    accountOwnerUserId: params.accountOwnerUserId,
    admin,
    stripe,
  });

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url:
      params.returnUrl ??
      `${appUrl}/ops/admin/company-profile?notice=platform_billing_portal_return`,
  });

  return {
    session,
    url: session.url,
  };
}

export function buildPlatformEntitlementStripePatch(params: {
  subscription: PlatformStripeSubscriptionLike;
  eventId: string;
}) {
  const subscription = params.subscription;
  const stripeCustomerId = extractStripeCustomerId(subscription.customer);
  const stripeSubscriptionId = toCleanString(subscription.id) || null;
  const stripePriceId =
    toCleanString(subscription.items?.data?.[0]?.price?.id) || null;
  const stripeSubscriptionStatus = toCleanString(subscription.status) || null;
  const stripeCurrentPeriodEnd = toIsoFromUnix(
    resolveSubscriptionCurrentPeriodEnd(subscription),
  );
  const trialEndsAt = toIsoFromUnix(subscription.trial_end);

  return {
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    stripe_price_id: stripePriceId,
    stripe_subscription_status: stripeSubscriptionStatus,
    stripe_current_period_end: stripeCurrentPeriodEnd,
    stripe_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    stripe_last_webhook_event_id: params.eventId,
    stripe_last_synced_at: new Date().toISOString(),
    entitlement_status: mapStripeSubscriptionStatusToEntitlementStatus(subscription.status),
    entitlement_valid_until: stripeCurrentPeriodEnd,
    trial_ends_at: trialEndsAt,
  };
}

export async function syncPlatformEntitlementFromStripeSubscriptionEvent(params: {
  subscription: Stripe.Subscription;
  eventId: string;
  admin?: any;
}) {
  const admin = params.admin ?? createAdminClient();
  const subscription = params.subscription;
  const subscriptionId = toCleanString(subscription.id);
  const customerId = extractStripeCustomerId(subscription.customer);
  const metadataOwnerId = toCleanString(subscription.metadata?.account_owner_user_id);

  let entitlement = subscriptionId
    ? await getPlatformEntitlementByStripeSubscriptionId(admin, subscriptionId)
    : null;

  if (!entitlement && customerId) {
    entitlement = await getPlatformEntitlementByStripeCustomerId(admin, customerId);
  }

  if (!entitlement && metadataOwnerId) {
    entitlement = await ensurePlatformEntitlementRow(admin, metadataOwnerId);
  }

  if (!entitlement) {
    throw new Error("Could not resolve platform entitlement row for Stripe subscription event.");
  }

  if (toCleanString(entitlement.stripe_last_webhook_event_id) === params.eventId) {
    return {
      skipped: true,
      entitlement,
    };
  }

  const patch = buildPlatformEntitlementStripePatch({
    subscription,
    eventId: params.eventId,
  });

  const updated = await patchPlatformEntitlementRow(admin, entitlement, patch);

  return {
    skipped: false,
    entitlement: updated,
  };
}

export async function syncPlatformEntitlementFromCheckoutSession(params: {
  session: Stripe.Checkout.Session;
  eventId: string;
  admin?: any;
  stripe?: Stripe;
}) {
  const admin = params.admin ?? createAdminClient();
  const stripe = params.stripe ?? getStripeServerClient();
  const metadataOwnerId = toCleanString(params.session.metadata?.account_owner_user_id);
  const customerId = extractStripeCustomerId(params.session.customer as any);
  const subscriptionId = toCleanString(params.session.subscription) || null;

  if (!metadataOwnerId && !customerId && !subscriptionId) {
    throw new Error("Checkout session does not identify a platform entitlement owner.");
  }

  let entitlement = metadataOwnerId
    ? await ensurePlatformEntitlementRow(admin, metadataOwnerId)
    : null;

  if (!entitlement && customerId) {
    entitlement = await getPlatformEntitlementByStripeCustomerId(admin, customerId);
  }

  if (!entitlement && subscriptionId) {
    entitlement = await getPlatformEntitlementByStripeSubscriptionId(admin, subscriptionId);
  }

  if (!entitlement) {
    throw new Error("Could not resolve platform entitlement row for checkout session event.");
  }

  if (toCleanString(entitlement.stripe_last_webhook_event_id) === params.eventId) {
    return {
      skipped: true,
      entitlement,
    };
  }

  let patch: Record<string, unknown> = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_price_id: requireStripePriceId(),
    stripe_last_webhook_event_id: params.eventId,
    stripe_last_synced_at: new Date().toISOString(),
  };

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    patch = {
      ...patch,
      ...buildPlatformEntitlementStripePatch({
        subscription,
        eventId: params.eventId,
      }),
    };
  }

  const updated = await patchPlatformEntitlementRow(admin, entitlement, patch);

  return {
    skipped: false,
    entitlement: updated,
  };
}
