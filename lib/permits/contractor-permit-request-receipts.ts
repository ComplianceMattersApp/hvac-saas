import {
  getPermitRequestContractorStatusLabel,
  isPermitPostPermitRoute,
  isPermitRequestStatus,
  type PermitPostPermitRoute,
  type PermitRequestStatus,
} from "./permit-request-contracts";
import { buildPermitRequestReferenceCode } from "./permit-request-reference";
import { isPermitRequestSchemaUnavailableError } from "./permit-requests-read-model";

type ReceiptQueryResult = { data: unknown; error: unknown };

type ReceiptFilter = {
  eq(column: string, value: string): ReceiptFilter;
  order(column: string, options?: { ascending?: boolean }): ReceiptFilter;
  limit(count: number): PromiseLike<ReceiptQueryResult>;
  in(column: string, values: readonly string[]): PromiseLike<ReceiptQueryResult>;
};

export type ContractorPermitRequestReceiptsClient = {
  from(table: string): { select(columns: string): ReceiptFilter };
};

export type ContractorPermitRequestReceipt = {
  id: string;
  referenceCode: string;
  createdAt: string;
  status: PermitRequestStatus;
  statusLabel: string;
  note: string | null;
  attachmentCount: number;
};

export const CONTRACTOR_PERMIT_REQUEST_RECEIPT_LIMIT = 10;

export { buildPermitRequestReferenceCode };

function normalizeText(value: unknown) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function asRows(data: unknown): Array<Record<string, unknown>> {
  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
}

/**
 * Contractor-facing receipt list for permit requests the contractor submitted.
 *
 * Reads only the foundation columns so a lagging intake-field migration can
 * never blank out a contractor's submission history — the receipt is the only
 * proof the contractor has that a submission landed.
 */
export async function listContractorPermitRequestReceipts(params: {
  admin: ContractorPermitRequestReceiptsClient;
  contractorId: string;
  accountOwnerUserId: string;
  limit?: number;
}): Promise<ContractorPermitRequestReceipt[]> {
  const contractorId = String(params.contractorId ?? "").trim();
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!contractorId || !accountOwnerUserId) return [];

  const limit = params.limit ?? CONTRACTOR_PERMIT_REQUEST_RECEIPT_LIMIT;

  const { data, error } = await params.admin
    .from("permit_requests")
    .select("id, created_at, status, post_permit_route, contractor_note")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("contractor_id", contractorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isPermitRequestSchemaUnavailableError(error)) return [];
    throw error;
  }

  const rows = asRows(data).filter((row) => isPermitRequestStatus(row.status));
  if (!rows.length) return [];

  const attachmentCounts = await countPermitRequestAttachments({
    admin: params.admin,
    permitRequestIds: rows.map((row) => String(row.id)),
  });

  return rows.map((row) => {
    const status = row.status as PermitRequestStatus;
    const postPermitRoute: PermitPostPermitRoute | null = isPermitPostPermitRoute(
      row.post_permit_route,
    )
      ? row.post_permit_route
      : null;
    const id = String(row.id);

    return {
      id,
      referenceCode: buildPermitRequestReferenceCode(id),
      createdAt: String(row.created_at ?? ""),
      status,
      statusLabel: getPermitRequestContractorStatusLabel({ status, postPermitRoute }),
      note: normalizeText(row.contractor_note),
      attachmentCount: attachmentCounts.get(id) ?? 0,
    };
  });
}

async function countPermitRequestAttachments(params: {
  admin: ContractorPermitRequestReceiptsClient;
  permitRequestIds: string[];
}): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!params.permitRequestIds.length) return counts;

  const { data, error } = await params.admin
    .from("attachments")
    .select("entity_id")
    .eq("entity_type", "permit_request")
    .in("entity_id", params.permitRequestIds);

  // A count failure must never hide the request itself.
  if (error) return counts;

  for (const row of asRows(data)) {
    const entityId = String(row.entity_id ?? "").trim();
    if (!entityId) continue;
    counts.set(entityId, (counts.get(entityId) ?? 0) + 1);
  }

  return counts;
}
