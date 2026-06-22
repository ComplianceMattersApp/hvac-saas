import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAccountEntitlement } from "@/lib/business/platform-entitlement";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";
import { normalizeBillingMode } from "@/lib/business/internal-business-profile";

export type AccountReadinessItem = {
  key: string;
  label: string;
  description: string;
  status: "complete" | "incomplete" | "optional";
  href?: string;
};

export type AccountReadinessSummary = {
  completedRequiredCount: number;
  totalRequiredCount: number;
  isOperationallyReady: boolean;
  items: AccountReadinessItem[];
};

type InternalBusinessProfileRow = {
  display_name: string | null;
  support_email: string | null;
  support_phone: string | null;
  billing_mode: string | null;
  logo_url: string | null;
  profile_reviewed_at: string | null;
};

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

export async function resolveAccountReadiness(
  accountOwnerUserId: string,
  supabase: SupabaseClient | any,
): Promise<AccountReadinessSummary> {
  const ownerId = toCleanString(accountOwnerUserId);

  if (!ownerId) {
    return {
      completedRequiredCount: 0,
      totalRequiredCount: 6,
      isOperationallyReady: false,
      items: [
        {
          key: "company_name",
          label: "Company name",
          description: "Set company name in Company Profile.",
          status: "incomplete",
          href: "/ops/admin/company-profile",
        },
        {
          key: "support_email",
          label: "Business email",
          description: "Set business email in Company Profile.",
          status: "incomplete",
          href: "/ops/admin/company-profile",
        },
        {
          key: "support_phone",
          label: "Business phone",
          description: "Set business phone in Company Profile.",
          status: "incomplete",
          href: "/ops/admin/company-profile",
        },
        {
          key: "billing_mode",
          label: "Invoice settings",
          description: "Choose how invoices are handled in Company Profile.",
          status: "incomplete",
          href: "/ops/admin/company-profile",
        },
        {
          key: "active_internal_users",
          label: "Team access",
          description: "No active internal users found. Add or activate an internal user to finish setup.",
          status: "incomplete",
          href: "/ops/admin/internal-users",
        },
        {
          key: "app_subscription",
          label: "App subscription",
          description: "Set up your Compliance Matters subscription before the trial ends.",
          status: "incomplete",
          href: "/ops/admin/company-profile#account-billing",
        },
        {
          key: "company_logo",
          label: "Company logo",
          description: "Add your logo for branded documents and messages.",
          status: "optional",
          href: "/ops/admin/company-profile",
        },
        {
          key: "contractor_directory",
          label: "Contractor directory",
          description: "Optional: add contractors if your workflow needs them.",
          status: "optional",
          href: "/ops/admin/contractors",
        },
        {
          key: "accept_online_invoice_payments",
          label: "Online Payments",
          description: "Let customers pay invoices online through Compliance Matters.",
          status: "optional",
          href: "/ops/admin/company-profile#accept-payments",
        },
      ],
    };
  }

  const [profileResult, activeInternalUsersResult, contractorsResult, entitlement, tenantStripeReadiness] = await Promise.all([
    supabase
      .from("internal_business_profiles")
      .select("display_name, support_email, support_phone, billing_mode, logo_url, profile_reviewed_at")
      .eq("account_owner_user_id", ownerId)
      .maybeSingle(),
    supabase
      .from("internal_users")
      .select("user_id", { count: "exact", head: true })
      .eq("account_owner_user_id", ownerId)
      .eq("is_active", true),
    supabase
      .from("contractors")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", ownerId),
    resolveAccountEntitlement(ownerId, supabase),
    resolveTenantStripeConnectReadiness(ownerId, supabase),
  ]);

  if (profileResult.error) {
    throw new Error(
      `Failed to resolve account readiness business profile: ${profileResult.error.message ?? "unknown error"}`,
    );
  }

  if (activeInternalUsersResult.error) {
    throw new Error(
      `Failed to resolve account readiness internal users: ${activeInternalUsersResult.error.message ?? "unknown error"}`,
    );
  }

  if (contractorsResult.error) {
    throw new Error(
      `Failed to resolve account readiness contractors: ${contractorsResult.error.message ?? "unknown error"}`,
    );
  }

  const profile = (profileResult.data ?? null) as InternalBusinessProfileRow | null;
  const displayName = toCleanString(profile?.display_name);
  const supportEmail = toCleanString(profile?.support_email);
  const supportPhone = toCleanString(profile?.support_phone);
  const billingMode = toCleanString(profile?.billing_mode);
  const normalizedBillingMode = normalizeBillingMode(billingMode);
  const logoUrl = toCleanString(profile?.logo_url);
  const profileReviewed = Boolean(profile?.profile_reviewed_at);
  const activeInternalUserCount = normalizeCount(activeInternalUsersResult.count);
  const contractorCount = normalizeCount(contractorsResult.count);
  const subscriptionHandledInternally = entitlement.isInternalComped;
  const hasBillingLinks = entitlement.billingCustomerLinked && entitlement.billingSubscriptionLinked;
  const hasActiveSubscriptionStatusWithoutLinks =
    entitlement.entitlementStatus === "active" || entitlement.entitlementStatus === "grace";
  const isAppSubscriptionComplete =
    subscriptionHandledInternally || hasBillingLinks || hasActiveSubscriptionStatusWithoutLinks;

  const requiredItems: AccountReadinessItem[] = [
    {
      key: "company_name",
      label: "Company name",
      description:
        profileReviewed && displayName
          ? "Company name is set."
          : "Save your company profile to confirm company name.",
      status: profileReviewed && displayName ? "complete" : "incomplete",
      href: "/ops/admin/company-profile",
    },
    {
      key: "support_email",
      label: "Business email",
      description:
        profileReviewed && supportEmail
          ? "Business email is set."
          : "Save your company profile to confirm business email.",
      status: profileReviewed && supportEmail ? "complete" : "incomplete",
      href: "/ops/admin/company-profile",
    },
    {
      key: "support_phone",
      label: "Business phone",
      description:
        profileReviewed && supportPhone
          ? "Business phone is set."
          : "Save your company profile to confirm business phone.",
      status: profileReviewed && supportPhone ? "complete" : "incomplete",
      href: "/ops/admin/company-profile",
    },
    {
      key: "billing_mode",
      label: "Invoice settings",
      description:
        profileReviewed && billingMode
          ? `Invoice workflow confirmed as ${billingMode}.`
          : "Save your company profile to confirm how invoices are handled.",
      status: profileReviewed && billingMode ? "complete" : "incomplete",
      href: "/ops/admin/company-profile",
    },
    {
      key: "active_internal_users",
      label: "Team access",
      description:
        activeInternalUserCount > 0
          ? `${activeInternalUserCount} active internal user${activeInternalUserCount === 1 ? "" : "s"}. Add more users later from Internal Users if your team grows.`
          : "No active internal users found. Add or activate an internal user to finish setup.",
      status: activeInternalUserCount > 0 ? "complete" : "incomplete",
      href: "/ops/admin/internal-users",
    },
    {
      key: "app_subscription",
      label: "App subscription",
      description: subscriptionHandledInternally
        ? "Subscription is handled internally."
        : isAppSubscriptionComplete
          ? "Subscription setup is complete."
          : "Set up your Compliance Matters subscription before the trial ends.",
      status: isAppSubscriptionComplete ? "complete" : "incomplete",
      href: "/ops/admin/company-profile#account-billing",
    },
  ];

  if (normalizedBillingMode === "internal_invoicing") {
    requiredItems.push({
      key: "accept_online_invoice_payments",
      label: "Online Payments",
      description: tenantStripeReadiness.isReady
        ? "Online invoice payments are ready."
        : "Let customers pay invoices online through Compliance Matters.",
      status: tenantStripeReadiness.isReady ? "complete" : "incomplete",
      href: "/ops/admin/company-profile#accept-payments",
    });
  }

  const optionalItems: AccountReadinessItem[] = [
    {
      key: "contractor_directory",
      label: "Contractor directory",
      description:
        contractorCount > 0
          ? `${contractorCount} contractor${contractorCount === 1 ? "" : "s"} configured.`
          : "Optional: add contractors if your workflow needs them.",
      status: "optional",
      href: "/ops/admin/contractors",
    },
  ];

  if (normalizedBillingMode !== "internal_invoicing") {
    optionalItems.push({
      key: "online_invoice_payments",
      label: "Online Payments",
      description: "Not used when your company tracks billing outside Compliance Matters.",
      status: "optional",
      href: "/ops/admin/company-profile#accept-payments",
    });
  }

  if (!logoUrl) {
    optionalItems.unshift({
      key: "company_logo",
      label: "Company logo",
      description: "Add your logo for branded documents and messages.",
      status: "optional",
      href: "/ops/admin/company-profile",
    });
  }

  const completedRequiredCount = requiredItems.filter((item) => item.status === "complete").length;
  const totalRequiredCount = requiredItems.length;

  return {
    completedRequiredCount,
    totalRequiredCount,
    isOperationallyReady: totalRequiredCount > 0 && completedRequiredCount === totalRequiredCount,
    items: [...requiredItems, ...optionalItems],
  };
}
