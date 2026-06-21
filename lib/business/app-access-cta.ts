import type { DualContextAccess } from "@/lib/auth/dual-context-access";
import type { EntitlementStatus } from "@/lib/business/platform-entitlement";

export type AppAccessCtaKind =
  | "open_app"
  | "start_trial"
  | "resume_app_access"
  | "reactivate_app_access"
  | "manage_billing"
  | "none";

export type AppAccessCtaTarget =
  | { mode: "link"; href: string }
  | { mode: "post"; action: string }
  | null;

export type AppAccessCta = {
  kind: AppAccessCtaKind;
  heading: string | null;
  helper: string | null;
  buttonLabel: string | null;
  target: AppAccessCtaTarget;
};

export type AppAccessCtaEntitlementSnapshot = {
  entitlementStatus: EntitlementStatus | string | null;
  trialEndsAt: string | Date | null;
  billingSubscriptionStatus?: string | null;
  billingCustomerLinked?: boolean;
  billingSubscriptionLinked?: boolean;
};

export type AppAccessCtaBillingAvailability = {
  checkoutAvailable?: boolean;
  portalAvailable?: boolean;
};

const NO_CTA: AppAccessCta = {
  kind: "none",
  heading: null,
  helper: null,
  buttonLabel: null,
  target: null,
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeEntitlementStatus(value: unknown): EntitlementStatus | null {
  const normalized = clean(value).toLowerCase();
  if (normalized === "trial") return "trial";
  if (normalized === "active") return "active";
  if (normalized === "grace") return "grace";
  if (normalized === "suspended") return "suspended";
  if (normalized === "cancelled") return "cancelled";
  return null;
}

function isPastDate(value: string | Date | null | undefined, now: Date) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) && time <= now.getTime();
}

function hasActiveInternalAdmin(access: DualContextAccess) {
  return access.internalUser?.isActive === true && access.internalUser.role === "admin";
}

export function resolveAppAccessCta(input: {
  access: DualContextAccess;
  entitlement?: AppAccessCtaEntitlementSnapshot | null;
  billingAvailability?: AppAccessCtaBillingAvailability | null;
  now?: Date;
}): AppAccessCta {
  const { access } = input;
  const billingAvailability = input.billingAvailability ?? {};
  const now = input.now ?? new Date();
  const entitlementStatus = normalizeEntitlementStatus(input.entitlement?.entitlementStatus);
  const internalAdminCanCheckout = hasActiveInternalAdmin(access) && billingAvailability.checkoutAvailable === true;

  if (access.hasActiveAppAccess) {
    return {
      kind: "open_app",
      heading: "App access is active",
      helper: access.hasPortalAccess
        ? "Your full app workspace is available alongside portal work."
        : "Your full app workspace is available.",
      buttonLabel: "Open app",
      target: { mode: "link", href: "/today" },
    };
  }

  if (!access.hasInternalMembership && access.hasPortalAccess) {
    return {
      kind: "start_trial",
      heading: "Want to run your own jobs in EveryStep FieldWorks?",
      helper: "Start with a 30-day trial when you're ready.",
      buttonLabel: "Start 30-day trial",
      target: { mode: "link", href: "/signup/service" },
    };
  }

  if (!internalAdminCanCheckout) {
    return NO_CTA;
  }

  const hasLinkedPlatformBilling =
    Boolean(input.entitlement?.billingSubscriptionLinked) ||
    Boolean(input.entitlement?.billingCustomerLinked);

  if (access.hasExpiredOrInactiveAppAccess && hasLinkedPlatformBilling) {
    return NO_CTA;
  }

  const trialExpired =
    access.appAccessBlockedReason === "blocked_trial_expired" ||
    (entitlementStatus === "trial" && isPastDate(input.entitlement?.trialEndsAt ?? null, now));

  if (trialExpired) {
    return {
      kind: "resume_app_access",
      heading: "App access is inactive",
      helper: access.hasPortalAccess
        ? "Portal work with Compliance Matters is still available. Resume app access when you're ready."
        : "Resume app access when you're ready.",
      buttonLabel: "Resume app access",
      target: { mode: "post", action: "/api/stripe/checkout" },
    };
  }

  const billingBlocked =
    access.appAccessBlockedReason === "blocked_billing_subscription_status" ||
    entitlementStatus === "cancelled" ||
    entitlementStatus === "suspended";

  if (billingBlocked) {
    return {
      kind: "reactivate_app_access",
      heading: "App access is inactive",
      helper: access.hasPortalAccess
        ? "Portal work with Compliance Matters is still available. Reactivate app access when you're ready."
        : "Reactivate app access when you're ready.",
      buttonLabel: "Reactivate app access",
      target: { mode: "post", action: "/api/stripe/checkout" },
    };
  }

  if (
    entitlementStatus === "active" &&
    input.entitlement?.billingSubscriptionLinked &&
    billingAvailability.portalAvailable === true
  ) {
    return {
      kind: "manage_billing",
      heading: "Manage app billing",
      helper: "Review or update your EveryStep FieldWorks subscription.",
      buttonLabel: "Manage billing",
      target: { mode: "post", action: "/api/stripe/portal" },
    };
  }

  return NO_CTA;
}

export async function loadAppAccessCtaEntitlementSnapshot(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
}): Promise<AppAccessCtaEntitlementSnapshot | null> {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  if (!accountOwnerUserId) return null;

  const { data, error } = await params.supabase
    .from("platform_account_entitlements")
    .select(
      [
        "entitlement_status",
        "trial_ends_at",
        "stripe_subscription_status",
        "stripe_customer_id",
        "stripe_subscription_id",
      ].join(", "),
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    entitlementStatus: clean(data.entitlement_status) || null,
    trialEndsAt: clean(data.trial_ends_at) || null,
    billingSubscriptionStatus: clean(data.stripe_subscription_status) || null,
    billingCustomerLinked: Boolean(clean(data.stripe_customer_id)),
    billingSubscriptionLinked: Boolean(clean(data.stripe_subscription_id)),
  };
}
