import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAccountEntitlement } from "@/lib/business/platform-entitlement";

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
      totalRequiredCount: 5,
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
          label: "Support email",
          description: "Set support email in Company Profile.",
          status: "incomplete",
          href: "/ops/admin/company-profile",
        },
        {
          key: "support_phone",
          label: "Support phone",
          description: "Set support phone in Company Profile.",
          status: "incomplete",
          href: "/ops/admin/company-profile",
        },
        {
          key: "billing_mode",
          label: "Billing mode",
          description: "Select billing mode in Company Profile.",
          status: "incomplete",
          href: "/ops/admin/company-profile",
        },
        {
          key: "active_internal_users",
          label: "Active internal users",
          description: "Add at least one active internal user.",
          status: "incomplete",
          href: "/ops/admin/internal-users",
        },
        {
          key: "company_logo",
          label: "Company logo",
          description: "Optional: upload a logo in Company Profile.",
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
          key: "platform_account_status",
          label: "Platform account status",
          description: "Optional: review platform entitlement status visibility.",
          status: "optional",
          href: "/ops/admin/company-profile",
        },
      ],
    };
  }

  const [profileResult, activeInternalUsersResult, contractorsResult, entitlement] = await Promise.all([
    supabase
      .from("internal_business_profiles")
      .select("display_name, support_email, support_phone, billing_mode, logo_url")
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
  const logoUrl = toCleanString(profile?.logo_url);
  const activeInternalUserCount = normalizeCount(activeInternalUsersResult.count);
  const contractorCount = normalizeCount(contractorsResult.count);

  const requiredItems: AccountReadinessItem[] = [
    {
      key: "company_name",
      label: "Company name",
      description: displayName
        ? "Company name is set."
        : "Set company name in Company Profile.",
      status: displayName ? "complete" : "incomplete",
      href: "/ops/admin/company-profile",
    },
    {
      key: "support_email",
      label: "Support email",
      description: supportEmail
        ? "Support email is set."
        : "Set support email in Company Profile.",
      status: supportEmail ? "complete" : "incomplete",
      href: "/ops/admin/company-profile",
    },
    {
      key: "support_phone",
      label: "Support phone",
      description: supportPhone
        ? "Support phone is set."
        : "Set support phone in Company Profile.",
      status: supportPhone ? "complete" : "incomplete",
      href: "/ops/admin/company-profile",
    },
    {
      key: "billing_mode",
      label: "Billing mode",
      description: billingMode
        ? `Billing mode is set to ${billingMode}.`
        : "Select billing mode in Company Profile.",
      status: billingMode ? "complete" : "incomplete",
      href: "/ops/admin/company-profile",
    },
    {
      key: "active_internal_users",
      label: "Active internal users",
      description:
        activeInternalUserCount > 0
          ? `${activeInternalUserCount} active internal user${activeInternalUserCount === 1 ? "" : "s"} found.`
          : "Add at least one active internal user.",
      status: activeInternalUserCount > 0 ? "complete" : "incomplete",
      href: "/ops/admin/internal-users",
    },
  ];

  const optionalItems: AccountReadinessItem[] = [
    {
      key: "company_logo",
      label: "Company logo",
      description: logoUrl
        ? "Logo is uploaded."
        : "Optional: upload a logo in Company Profile.",
      status: "optional",
      href: "/ops/admin/company-profile",
    },
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
    {
      key: "platform_account_status",
      label: "Platform account status",
      description: `Optional: platform account status is ${entitlement.entitlementStatus}.`,
      status: "optional",
      href: "/ops/admin/company-profile",
    },
  ];

  const completedRequiredCount = requiredItems.filter((item) => item.status === "complete").length;
  const totalRequiredCount = requiredItems.length;

  return {
    completedRequiredCount,
    totalRequiredCount,
    isOperationallyReady: totalRequiredCount > 0 && completedRequiredCount === totalRequiredCount,
    items: [...requiredItems, ...optionalItems],
  };
}