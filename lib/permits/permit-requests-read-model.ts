import {
  ACTIVE_PERMIT_REQUEST_STATUSES,
  getPermitRequestContractorStatusLabel,
  getPermitRequestInternalStatusLabel,
  isActivePermitRequestStatus,
  isPermitPostPermitRoute,
  type ActivePermitRequestStatus,
  type PermitPostPermitRoute,
  type PermitRequestHoldReason,
} from "./permit-request-contracts";
import { isPermitWorkflowEnabledForAccountOwner } from "./permit-workflow-gate";

type SupabaseLike = {
  from(table: "permit_requests"): {
    select(columns: string): {
      eq(column: string, value: string): unknown;
      in(column: string, values: readonly string[]): unknown;
      order(column: string, options?: { ascending?: boolean }): unknown;
      limit(count: number): Promise<{ data: RawPermitRequestQueueRow[] | null; error: unknown }>;
    };
  };
};

type RawPermitRequestQueueRow = {
  id: string;
  account_owner_user_id: string;
  contractor_id: string;
  job_id: string | null;
  service_case_id: string | null;
  contractor_intake_submission_id: string | null;
  status: string | null;
  hold_reason: PermitRequestHoldReason | null;
  post_permit_route: string | null;
  permit_number: string | null;
  jurisdiction: string | null;
  permit_date: string | null;
  contractor_note: string | null;
  request_label: string | null;
  customer_first_name_snapshot: string | null;
  customer_last_name_snapshot: string | null;
  service_address_text_snapshot: string | null;
  internal_intake_note: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  on_hold_at: string | null;
  completed_at: string | null;
  contractors?: { name: string | null } | { name: string | null }[] | null;
  jobs?: {
    id: string;
    title: string | null;
    customer_first_name: string | null;
    customer_last_name: string | null;
    job_address: string | null;
    city: string | null;
  } | {
    id: string;
    title: string | null;
    customer_first_name: string | null;
    customer_last_name: string | null;
    job_address: string | null;
    city: string | null;
  }[] | null;
};

export type PermitRequestQueueRow = {
  id: string;
  accountOwnerUserId: string;
  contractorId: string;
  contractorName: string | null;
  jobId: string | null;
  serviceCaseId: string | null;
  contractorIntakeSubmissionId: string | null;
  status: ActivePermitRequestStatus;
  internalStatusLabel: string;
  contractorStatusLabel: string;
  holdReason: PermitRequestHoldReason | null;
  postPermitRoute: PermitPostPermitRoute | null;
  permitNumber: string | null;
  jurisdiction: string | null;
  permitDate: string | null;
  contractorNote: string | null;
  requestLabel: string | null;
  customerFirstNameSnapshot: string | null;
  customerLastNameSnapshot: string | null;
  serviceAddressTextSnapshot: string | null;
  internalIntakeNote: string | null;
  jobContext: {
    id: string;
    title: string | null;
    customerName: string | null;
    location: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  onHoldAt: string | null;
  completedAt: string | null;
  submittedAgeDays: number;
};

export async function listActivePermitRequestQueueRows(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  contractorId?: string | null;
  limit?: number;
  now?: Date;
}): Promise<PermitRequestQueueRow[]> {
  if (!isPermitWorkflowEnabledForAccountOwner(params.accountOwnerUserId)) {
    return [];
  }

  const limit = params.limit ?? 100;

  const query = params.supabase
    .from("permit_requests")
    .select(
      [
        "id",
        "account_owner_user_id",
        "contractor_id",
        "job_id",
        "service_case_id",
        "contractor_intake_submission_id",
        "status",
        "hold_reason",
        "post_permit_route",
        "permit_number",
        "jurisdiction",
        "permit_date",
        "contractor_note",
        "request_label",
        "customer_first_name_snapshot",
        "customer_last_name_snapshot",
        "service_address_text_snapshot",
        "internal_intake_note",
        "created_at",
        "updated_at",
        "accepted_at",
        "on_hold_at",
        "completed_at",
        "contractors:contractor_id(name)",
        "jobs:job_id(id, title, customer_first_name, customer_last_name, job_address, city)",
      ].join(", "),
    );

  query.eq("account_owner_user_id", params.accountOwnerUserId);
  if (params.contractorId) {
    query.eq("contractor_id", params.contractorId);
  }
  query.in("status", ACTIVE_PERMIT_REQUEST_STATUSES);
  query.order("created_at", { ascending: true });

  const { data, error } = await query.limit(limit);

  if (error) {
    throw new PermitRequestReadModelError("Failed to load active permit requests.", error);
  }

  return (data ?? [])
    .filter(isRawActivePermitRequestRow)
    .map((row) => toPermitRequestQueueRow(row, params.now ?? new Date()));
}

export type ActivePermitRequestQueueReadResult = {
  schemaAvailable: boolean;
  rows: PermitRequestQueueRow[];
};

export class PermitRequestReadModelError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "PermitRequestReadModelError";
    this.cause = cause;
  }
}

export async function listActivePermitRequestQueueRowsIfAvailable(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  contractorId?: string | null;
  limit?: number;
  now?: Date;
}): Promise<ActivePermitRequestQueueReadResult> {
  if (!isPermitWorkflowEnabledForAccountOwner(params.accountOwnerUserId)) {
    return { schemaAvailable: false, rows: [] };
  }

  try {
    return {
      schemaAvailable: true,
      rows: await listActivePermitRequestQueueRows(params),
    };
  } catch (error) {
    if (isPermitRequestSchemaUnavailableError(error)) {
      return { schemaAvailable: false, rows: [] };
    }

    throw error;
  }
}

export function isPermitRequestSchemaUnavailableError(error: unknown): boolean {
  const cause = error instanceof PermitRequestReadModelError ? error.cause : error;
  const maybeError = cause as { code?: unknown; message?: unknown; details?: unknown } | null;
  const code = String(maybeError?.code ?? "").trim();
  const message = `${String(maybeError?.message ?? "")} ${String(maybeError?.details ?? "")}`.toLowerCase();

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST204" ||
    (message.includes("permit_requests") &&
      (message.includes("does not exist") || message.includes("could not find")))
  );
}

function isRawActivePermitRequestRow(
  row: RawPermitRequestQueueRow,
): row is RawPermitRequestQueueRow & { status: ActivePermitRequestStatus } {
  return isActivePermitRequestStatus(row.status);
}

function toPermitRequestQueueRow(
  row: RawPermitRequestQueueRow & { status: ActivePermitRequestStatus },
  now: Date,
): PermitRequestQueueRow {
  const postPermitRoute = isPermitPostPermitRoute(row.post_permit_route)
    ? row.post_permit_route
    : null;

  return {
    id: row.id,
    accountOwnerUserId: row.account_owner_user_id,
    contractorId: row.contractor_id,
    contractorName: getContractorName(row.contractors),
    jobId: row.job_id,
    serviceCaseId: row.service_case_id,
    contractorIntakeSubmissionId: row.contractor_intake_submission_id,
    status: row.status,
    internalStatusLabel: getPermitRequestInternalStatusLabel(row.status),
    contractorStatusLabel: getPermitRequestContractorStatusLabel({
      status: row.status,
      postPermitRoute,
    }),
    holdReason: row.hold_reason,
    postPermitRoute,
    permitNumber: row.permit_number,
    jurisdiction: row.jurisdiction,
    permitDate: row.permit_date,
    contractorNote: getTrimmedValue(row.contractor_note),
    requestLabel: getTrimmedValue(row.request_label),
    customerFirstNameSnapshot: getTrimmedValue(row.customer_first_name_snapshot),
    customerLastNameSnapshot: getTrimmedValue(row.customer_last_name_snapshot),
    serviceAddressTextSnapshot: getTrimmedValue(row.service_address_text_snapshot),
    internalIntakeNote: getTrimmedValue(row.internal_intake_note),
    jobContext: getJobContext(row.jobs),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    onHoldAt: row.on_hold_at,
    completedAt: row.completed_at,
    submittedAgeDays: getWholeDaysBetween(new Date(row.created_at), now),
  };
}

function getContractorName(contractor: RawPermitRequestQueueRow["contractors"]): string | null {
  const value = Array.isArray(contractor) ? contractor[0] : contractor;
  return getTrimmedValue(value?.name);
}

function getJobContext(job: RawPermitRequestQueueRow["jobs"]): PermitRequestQueueRow["jobContext"] {
  const value = Array.isArray(job) ? job[0] : job;
  if (!value?.id) return null;

  const customerName = [value.customer_first_name, value.customer_last_name]
    .map(getTrimmedValue)
    .filter(Boolean)
    .join(" ");
  const location = [value.job_address, value.city]
    .map(getTrimmedValue)
    .filter(Boolean)
    .join(", ");

  return {
    id: value.id,
    title: getTrimmedValue(value.title),
    customerName: customerName || null,
    location: location || null,
  };
}

function getTrimmedValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getWholeDaysBetween(start: Date, end: Date): number {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const milliseconds = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(milliseconds / 86_400_000));
}
