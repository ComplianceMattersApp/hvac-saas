import type { SupabaseClient } from "@supabase/supabase-js";

export const ACCOUNT_WORKSHARE_REQUEST_STATUSES = ["sent", "cancelled", "declined", "accepted"] as const;
export const ACCOUNT_WORKSHARE_REQUEST_TYPES = ["ecc_hers_testing"] as const;

export type AccountWorkshareRequestStatus = (typeof ACCOUNT_WORKSHARE_REQUEST_STATUSES)[number];
export type AccountWorkshareRequestType = (typeof ACCOUNT_WORKSHARE_REQUEST_TYPES)[number];

export type AccountWorkshareRequestRow = {
  id: string;
  connection_id: string;
  sender_account_id: string;
  receiver_account_id: string;
  source_job_id: string;
  receiving_job_id: string | null;
  request_type: AccountWorkshareRequestType;
  status: AccountWorkshareRequestStatus;
  customer_name_snapshot: string | null;
  customer_contact_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  customer_email_snapshot: string | null;
  location_address_snapshot: string | null;
  location_address_line1_snapshot: string | null;
  location_address_line2_snapshot: string | null;
  location_city_snapshot: string | null;
  location_state_snapshot: string | null;
  location_zip_snapshot: string | null;
  source_job_title_snapshot: string | null;
  source_job_reference_snapshot: string | null;
  source_job_type_snapshot: string | null;
  source_job_description_snapshot: string | null;
  permit_number_snapshot: string | null;
  requested_scope_snapshot: Record<string, unknown>;
  sender_notes_snapshot: string | null;
  preferred_date: string | null;
  preferred_window_snapshot: string | null;
  created_by_user_id: string;
  sent_at: string;
  cancelled_at: string | null;
  declined_at: string | null;
  decided_by_user_id: string | null;
  decline_reason: string | null;
  accepted_at: string | null;
  outcome: "passed" | "failed" | null;
  outcome_recorded_at: string | null;
  outcome_note: string | null;
  retest_requested_at: string | null;
  retest_note: string | null;
  retest_count: number;
  created_at: string;
  updated_at: string;
};

type QueryError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullableString(value: unknown) {
  const normalized = cleanString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeStatus(value: unknown): AccountWorkshareRequestStatus | null {
  const normalized = cleanString(value).toLowerCase();
  return ACCOUNT_WORKSHARE_REQUEST_STATUSES.includes(normalized as AccountWorkshareRequestStatus)
    ? (normalized as AccountWorkshareRequestStatus)
    : null;
}

function normalizeOutcome(value: unknown): "passed" | "failed" | null {
  const normalized = cleanString(value).toLowerCase();
  return normalized === "passed" || normalized === "failed" ? normalized : null;
}

function normalizeRequestType(value: unknown): AccountWorkshareRequestType | null {
  const normalized = cleanString(value).toLowerCase();
  return ACCOUNT_WORKSHARE_REQUEST_TYPES.includes(normalized as AccountWorkshareRequestType)
    ? (normalized as AccountWorkshareRequestType)
    : null;
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isMissingAccountWorkshareRequestsTable(error: QueryError | null | undefined): boolean {
  if (!error) return false;

  const message = [error.message, error.details, error.hint]
    .map((entry) => cleanString(entry).toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (!message.includes("account_workshare_requests")) return false;

  return error.code === "42P01"
    || error.code === "PGRST205"
    || message.includes("not found")
    || message.includes("does not exist")
    || message.includes("schema cache");
}

export function normalizeAccountWorkshareRequestRow(value: any): AccountWorkshareRequestRow | null {
  const id = cleanString(value?.id);
  const connectionId = cleanString(value?.connection_id);
  const senderAccountId = cleanString(value?.sender_account_id);
  const receiverAccountId = cleanString(value?.receiver_account_id);
  const sourceJobId = cleanString(value?.source_job_id);
  const requestType = normalizeRequestType(value?.request_type);
  const status = normalizeStatus(value?.status);
  const createdByUserId = cleanString(value?.created_by_user_id);
  const sentAt = cleanString(value?.sent_at);
  const createdAt = cleanString(value?.created_at);
  const updatedAt = cleanString(value?.updated_at);

  if (!id || !connectionId || !senderAccountId || !receiverAccountId || !sourceJobId || !requestType || !status || !createdByUserId || !sentAt || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    connection_id: connectionId,
    sender_account_id: senderAccountId,
    receiver_account_id: receiverAccountId,
    source_job_id: sourceJobId,
    receiving_job_id: cleanNullableString(value?.receiving_job_id),
    request_type: requestType,
    status,
    customer_name_snapshot: cleanNullableString(value?.customer_name_snapshot),
    customer_contact_name_snapshot: cleanNullableString(value?.customer_contact_name_snapshot),
    customer_phone_snapshot: cleanNullableString(value?.customer_phone_snapshot),
    customer_email_snapshot: cleanNullableString(value?.customer_email_snapshot),
    location_address_snapshot: cleanNullableString(value?.location_address_snapshot),
    location_address_line1_snapshot: cleanNullableString(value?.location_address_line1_snapshot),
    location_address_line2_snapshot: cleanNullableString(value?.location_address_line2_snapshot),
    location_city_snapshot: cleanNullableString(value?.location_city_snapshot),
    location_state_snapshot: cleanNullableString(value?.location_state_snapshot),
    location_zip_snapshot: cleanNullableString(value?.location_zip_snapshot),
    source_job_title_snapshot: cleanNullableString(value?.source_job_title_snapshot),
    source_job_reference_snapshot: cleanNullableString(value?.source_job_reference_snapshot),
    source_job_type_snapshot: cleanNullableString(value?.source_job_type_snapshot),
    source_job_description_snapshot: cleanNullableString(value?.source_job_description_snapshot),
    permit_number_snapshot: cleanNullableString(value?.permit_number_snapshot),
    requested_scope_snapshot: normalizeJsonObject(value?.requested_scope_snapshot),
    sender_notes_snapshot: cleanNullableString(value?.sender_notes_snapshot),
    preferred_date: cleanNullableString(value?.preferred_date),
    preferred_window_snapshot: cleanNullableString(value?.preferred_window_snapshot),
    created_by_user_id: createdByUserId,
    sent_at: sentAt,
    cancelled_at: cleanNullableString(value?.cancelled_at),
    declined_at: cleanNullableString(value?.declined_at),
    decided_by_user_id: cleanNullableString(value?.decided_by_user_id),
    decline_reason: cleanNullableString(value?.decline_reason),
    accepted_at: cleanNullableString(value?.accepted_at),
    outcome: normalizeOutcome(value?.outcome),
    outcome_recorded_at: cleanNullableString(value?.outcome_recorded_at),
    outcome_note: cleanNullableString(value?.outcome_note),
    retest_requested_at: cleanNullableString(value?.retest_requested_at),
    retest_note: cleanNullableString(value?.retest_note),
    retest_count: Number.isFinite(Number(value?.retest_count)) ? Number(value?.retest_count) : 0,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function fetchAccountWorkshareRequestRows(
  supabase: SupabaseClient,
  queryBuilder: (client: SupabaseClient) => Promise<{ data: AccountWorkshareRequestRow[] | null; error: QueryError | null }>,
): Promise<AccountWorkshareRequestRow[]> {
  const { data, error } = await queryBuilder(supabase);

  if (error) {
    if (isMissingAccountWorkshareRequestsTable(error)) {
      return [];
    }

    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeAccountWorkshareRequestRow(row))
    .filter((row): row is AccountWorkshareRequestRow => row !== null);
}

export async function listSentAccountWorkshareRequestsForSender(
  supabase: SupabaseClient,
  senderAccountId: string | null | undefined,
  options?: { limit?: number | null },
): Promise<AccountWorkshareRequestRow[]> {
  const normalizedSenderAccountId = cleanString(senderAccountId);
  if (!normalizedSenderAccountId) return [];

  const safeLimit = Math.max(1, Math.min(500, Number(options?.limit ?? 100)));

  return fetchAccountWorkshareRequestRows(supabase, async (client) => {
    const { data, error } = await client
      .from("account_workshare_requests")
      .select("*")
      .eq("sender_account_id", normalizedSenderAccountId)
      .order("sent_at", { ascending: false })
      .limit(safeLimit);

    return { data: (data ?? []) as AccountWorkshareRequestRow[], error };
  });
}

export async function listAccountWorkshareRequestsForSourceJob(
  supabase: SupabaseClient,
  senderAccountId: string | null | undefined,
  sourceJobId: string | null | undefined,
): Promise<AccountWorkshareRequestRow[]> {
  const normalizedSenderAccountId = cleanString(senderAccountId);
  const normalizedSourceJobId = cleanString(sourceJobId);
  if (!normalizedSenderAccountId || !normalizedSourceJobId) return [];

  return fetchAccountWorkshareRequestRows(supabase, async (client) => {
    const { data, error } = await client
      .from("account_workshare_requests")
      .select("*")
      .eq("sender_account_id", normalizedSenderAccountId)
      .eq("source_job_id", normalizedSourceJobId)
      .order("sent_at", { ascending: false });

    return { data: (data ?? []) as AccountWorkshareRequestRow[], error };
  });
}

export async function getWorkshareRequestForReceivingJob(
  supabase: SupabaseClient,
  receiverAccountId: string | null | undefined,
  receivingJobId: string | null | undefined,
): Promise<AccountWorkshareRequestRow | null> {
  const normalizedReceiverAccountId = cleanString(receiverAccountId);
  const normalizedReceivingJobId = cleanString(receivingJobId);
  if (!normalizedReceiverAccountId || !normalizedReceivingJobId) return null;

  const rows = await fetchAccountWorkshareRequestRows(supabase, async (client) => {
    const { data, error } = await client
      .from("account_workshare_requests")
      .select("*")
      .eq("receiver_account_id", normalizedReceiverAccountId)
      .eq("receiving_job_id", normalizedReceivingJobId)
      .limit(1);

    return { data: (data ?? []) as AccountWorkshareRequestRow[], error };
  });

  return rows[0] ?? null;
}

export async function listDecidedAccountWorkshareRequestsForReceiver(
  supabase: SupabaseClient,
  receiverAccountId: string | null | undefined,
  options?: { limit?: number | null },
): Promise<AccountWorkshareRequestRow[]> {
  const normalizedReceiverAccountId = cleanString(receiverAccountId);
  if (!normalizedReceiverAccountId) return [];

  const safeLimit = Math.max(1, Math.min(500, Number(options?.limit ?? 100)));

  // Receiver-side decided/history read model: requests this account has acted on
  // (declined in Slice 1, accepted in Slice 2). Ordered by decision recency
  // (updated_at DESC).
  return fetchAccountWorkshareRequestRows(supabase, async (client) => {
    const { data, error } = await client
      .from("account_workshare_requests")
      .select("*")
      .eq("receiver_account_id", normalizedReceiverAccountId)
      .in("status", ["declined", "accepted"])
      .order("updated_at", { ascending: false })
      .limit(safeLimit);

    return { data: (data ?? []) as AccountWorkshareRequestRow[], error };
  });
}

export async function listIncomingAccountWorkshareRequestsForReceiver(
  supabase: SupabaseClient,
  receiverAccountId: string | null | undefined,
  options?: { limit?: number | null },
): Promise<AccountWorkshareRequestRow[]> {
  const normalizedReceiverAccountId = cleanString(receiverAccountId);
  if (!normalizedReceiverAccountId) return [];

  const safeLimit = Math.max(1, Math.min(500, Number(options?.limit ?? 100)));

  // Receiver-side read model (P1-D1): read-only incoming queue.
  // Only requests still in `sent` status are surfaced — cancelled requests are
  // excluded so the rater never sees a request the sender has withdrawn.
  // Ordered by created_at DESC (newest first).
  return fetchAccountWorkshareRequestRows(supabase, async (client) => {
    const { data, error } = await client
      .from("account_workshare_requests")
      .select("*")
      .eq("receiver_account_id", normalizedReceiverAccountId)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    return { data: (data ?? []) as AccountWorkshareRequestRow[], error };
  });
}
