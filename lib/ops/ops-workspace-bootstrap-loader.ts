import { canViewFinancialRegister } from "@/lib/auth/financial-access";
import {
  resolveFieldBillingCapabilities,
} from "@/lib/auth/field-billing-access";
import type { InternalUserRow } from "@/lib/auth/internal-user";
import { loadFieldBillingExplicitCapabilitiesForUser } from "@/lib/auth/internal-user-access-capabilities";
import { listFieldPaymentCollectionReportsForReconciliation } from "@/lib/business/field-payment-reconciliation-read-model";
import {
  getCachedAccountTimeZone,
  getCachedBillingMode,
  getCachedProductMode,
} from "@/lib/business/tenant-reference-cache";
import { isContractorIntakeQueueAvailableForProductMode } from "@/lib/ops/ops-workspace-queues";
import { isPermitWorkflowEnabledForAccountOwner } from "@/lib/permits/permit-workflow-gate";
import { resolveUserDisplayMap } from "@/lib/staffing/human-layer";
import {
  listTeamClockStatusPreview,
  type TeamClockStatusRow,
} from "@/lib/time-clock/read-model";
import { formatTimestampInAccountTimeZone } from "@/lib/utils/account-time-zone";
import { formatPersonNamePart } from "@/lib/utils/identity-display";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listSenderWorkshareConnectionsForReceiver } from "@/lib/workflows/account-workshare-connections-read";
import { countReturnedWorkshareRequestsForSender } from "@/lib/workflows/account-workshare-requests-read";

type OpsWorkspaceSupabase = SupabaseClient;

export type OpsTeamClockStatusRow = {
  displayName: string;
  elapsed: string;
  internalUserId: string;
  sinceAt: string;
  statusLabel: "Clocked In" | "On Lunch";
};

export type OpsWorkspaceBootstrapSnapshot = {
  accountTimeZone: string;
  canCreateEccBatchInvoice: boolean;
  canViewFieldPaymentVerificationAttention: boolean;
  contractorIntakeQueueAvailable: boolean;
  fieldPaymentReconciliationAttention: Awaited<
    ReturnType<typeof listFieldPaymentCollectionReportsForReconciliation>
  > | null;
  hasActiveIncomingWorkshareConnection: boolean;
  permitWorkflowEnabled: boolean;
  productMode: Awaited<ReturnType<typeof getCachedProductMode>>;
  returnedWorkshareCount: number;
  showContractorFocusSelection: boolean;
  showTeamClockStatusCard: boolean;
  teamClockStatusRows: OpsTeamClockStatusRow[];
};

function formatTeamClockSince(value: string | null | undefined, timeZone: string) {
  return formatTimestampInAccountTimeZone(value, timeZone, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatTeamClockElapsedFromClockIn(
  clockInAt: string | null | undefined,
  nowMs: number,
) {
  const normalized = String(clockInAt ?? "").trim();
  if (!normalized) return "0m";

  const startedAt = new Date(normalized).getTime();
  if (!Number.isFinite(startedAt)) return "0m";

  const totalMinutes = Math.max(0, Math.floor((nowMs - startedAt) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function buildOpsTeamClockStatusRows(params: {
  accountTimeZone: string;
  displayMap: Record<string, string>;
  nowMs: number;
  rows: TeamClockStatusRow[];
}): OpsTeamClockStatusRow[] {
  return params.rows.map((row) => {
    const internalUserId = String(row.internalUserId ?? "").trim();
    const displayName =
      formatPersonNamePart(params.displayMap[internalUserId] ?? "") || "Unknown User";
    const statusLabel = row.status === "on_lunch" ? "On Lunch" : "Clocked In";
    const sinceSource = row.status === "on_lunch"
      ? row.lunchStartAt ?? row.clockInAt
      : row.clockInAt;

    return {
      internalUserId,
      displayName,
      statusLabel,
      sinceAt: formatTeamClockSince(sinceSource, params.accountTimeZone),
      elapsed: formatTeamClockElapsedFromClockIn(row.clockInAt, params.nowMs),
    };
  });
}

export async function loadOpsWorkspaceBootstrap(params: {
  actorUserId: string;
  internalUser: InternalUserRow;
  now?: Date;
  supabase: OpsWorkspaceSupabase;
}): Promise<OpsWorkspaceBootstrapSnapshot> {
  const { actorUserId, internalUser, supabase } = params;
  const accountOwnerUserId = internalUser.account_owner_user_id;
  const showTeamClockStatusCardForRole =
    internalUser.role === "admin" || internalUser.role === "office";

  // Phase one depends only on the authenticated internal actor. Tenant
  // reference reads share the cross-request cache and all independent network
  // reads start together.
  const [
    accountTimeZone,
    explicitFieldBillingCapabilities,
    incomingWorkshareConnectionRows,
    returnedWorkshareCount,
    timeClockAccountSettingsResult,
    productMode,
    billingMode,
  ] = await Promise.all([
    getCachedAccountTimeZone(accountOwnerUserId),
    loadFieldBillingExplicitCapabilitiesForUser({
      supabase: supabase as unknown as Parameters<
        typeof loadFieldBillingExplicitCapabilitiesForUser
      >[0]["supabase"],
      accountOwnerUserId,
      internalUserId: internalUser.user_id,
    }),
    listSenderWorkshareConnectionsForReceiver(supabase, accountOwnerUserId),
    countReturnedWorkshareRequestsForSender(supabase, accountOwnerUserId),
    showTeamClockStatusCardForRole
      ? supabase
          .from("account_settings")
          .select("time_clock_enabled")
          .eq("account_owner_user_id", accountOwnerUserId)
          .maybeSingle()
      : Promise.resolve(null),
    getCachedProductMode(accountOwnerUserId),
    getCachedBillingMode(accountOwnerUserId),
  ]);

  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId,
    internalUser,
    resourceAccountOwnerUserId: accountOwnerUserId,
    explicitCapabilities: explicitFieldBillingCapabilities,
  });
  const canViewFinancialRegisterForAccount = canViewFinancialRegister({
    actorUserId,
    internalUser,
    resourceAccountOwnerUserId: accountOwnerUserId,
  });
  const canViewFieldPaymentVerificationAttention =
    canViewFinancialRegisterForAccount
    || fieldBillingCapabilities.can_verify_non_card_collection;

  if (showTeamClockStatusCardForRole && timeClockAccountSettingsResult?.error) {
    throw timeClockAccountSettingsResult.error;
  }
  const isTimeClockEnabled = Boolean(
    (timeClockAccountSettingsResult?.data as { time_clock_enabled?: boolean | null } | null)
      ?.time_clock_enabled,
  );

  // Phase two starts both reads together after their permission/feature gates
  // are known.
  const [fieldPaymentReconciliationAttention, teamClockPreviewRows] = await Promise.all([
    canViewFieldPaymentVerificationAttention
      ? listFieldPaymentCollectionReportsForReconciliation({
          admin: supabase,
          accountOwnerUserId,
          limit: 1,
        })
      : Promise.resolve(null),
    showTeamClockStatusCardForRole && isTimeClockEnabled
      ? listTeamClockStatusPreview({
          supabase,
          accountOwnerUserId,
        })
      : Promise.resolve(null),
  ]);

  let teamClockStatusRows: OpsTeamClockStatusRow[] = [];
  if (teamClockPreviewRows) {
    const displayMap = await resolveUserDisplayMap({
      supabase,
      userIds: teamClockPreviewRows
        .map((row) => String(row.internalUserId ?? "").trim())
        .filter(Boolean),
    });
    teamClockStatusRows = buildOpsTeamClockStatusRows({
      accountTimeZone,
      displayMap,
      nowMs: (params.now ?? new Date()).getTime(),
      rows: teamClockPreviewRows,
    });
  }

  const showContractorFocusSelection = productMode === "ecc_hers" || productMode === "hybrid";

  return {
    accountTimeZone,
    canCreateEccBatchInvoice:
      canViewFinancialRegisterForAccount
      && billingMode === "internal_invoicing"
      && showContractorFocusSelection,
    canViewFieldPaymentVerificationAttention,
    contractorIntakeQueueAvailable: isContractorIntakeQueueAvailableForProductMode(productMode),
    fieldPaymentReconciliationAttention,
    hasActiveIncomingWorkshareConnection: incomingWorkshareConnectionRows.some(
      (row) => row.status === "active",
    ),
    permitWorkflowEnabled: isPermitWorkflowEnabledForAccountOwner(accountOwnerUserId),
    productMode,
    returnedWorkshareCount,
    showContractorFocusSelection,
    showTeamClockStatusCard: teamClockPreviewRows !== null,
    teamClockStatusRows,
  };
}
