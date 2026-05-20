import type { AccountEntitlementContext } from "@/lib/business/platform-entitlement";

export type PlatformSeatAuditPreviewCounts = {
  inactiveInternalUserCount: number | null;
  contractorDirectoryCount: number | null;
  pendingInviteCount: number | null;
};

type CountResult = {
  count: number | null;
  error: { message?: string | null } | null;
};

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCount(value: unknown) {
  const count = Number(value);
  if (!Number.isFinite(count)) return null;
  return Math.max(0, Math.trunc(count));
}

async function countExactRows(params: {
  supabase: any;
  table: string;
  selectColumn: string;
  filters: Array<[string, unknown]>;
}): Promise<CountResult> {
  let query = params.supabase.from(params.table).select(params.selectColumn, {
    count: "exact",
    head: true,
  });

  for (const [column, value] of params.filters) {
    query = query.eq(column, value);
  }

  const { count, error } = await query;

  if (error) {
    console.warn("platform-seat-audit-preview: count query failed", {
      table: params.table,
      error: error.message ?? null,
    });

    return {
      count: null,
      error,
    };
  }

  return {
    count: normalizeCount(count),
    error: null,
  };
}

export function formatSeatAuditSeatLimitLabel(entitlement: AccountEntitlementContext) {
  if (entitlement.isInternalComped) return "Comped";
  if (entitlement.seatLimit == null) return "Unlimited";
  return String(entitlement.seatLimit);
}

export function formatSeatAuditBillingModeLabel(entitlement: AccountEntitlementContext) {
  if (entitlement.isInternalComped) return "Comped internal account";
  if (entitlement.seatLimit == null) return "Flat subscription billing / unlimited";
  return "Flat subscription billing / limited";
}

export function formatSeatAuditBillingExplanation() {
  return [
    "This preview is read-only.",
    "It is platform subscription billing, not customer invoice payment collection.",
    "It does not update Stripe quantity, enforce seat limits, or change portal quantity rules.",
  ].join(" ");
}

export function formatSeatAuditPendingInviteLabel() {
  return "Not separately modeled in current read-only data.";
}

export function formatSeatAuditKnownGapNote() {
  return "Known gap: hidden/system/platform-owner active internal users still count here until a billing exclusion rule is added.";
}

export async function resolvePlatformSeatAuditPreviewCounts(params: {
  accountOwnerUserId: string;
  supabase: any;
}): Promise<PlatformSeatAuditPreviewCounts> {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);

  if (!accountOwnerUserId) {
    return {
      inactiveInternalUserCount: null,
      contractorDirectoryCount: null,
      pendingInviteCount: null,
    };
  }

  const [inactiveInternalUsersResult, contractorDirectoryResult] = await Promise.all([
    countExactRows({
      supabase: params.supabase,
      table: "internal_users",
      selectColumn: "user_id",
      filters: [
        ["account_owner_user_id", accountOwnerUserId],
        ["is_active", false],
      ],
    }),
    countExactRows({
      supabase: params.supabase,
      table: "contractors",
      selectColumn: "id",
      filters: [["owner_user_id", accountOwnerUserId]],
    }),
  ]);

  return {
    inactiveInternalUserCount: inactiveInternalUsersResult.count,
    contractorDirectoryCount: contractorDirectoryResult.count,
    pendingInviteCount: null,
  };
}
