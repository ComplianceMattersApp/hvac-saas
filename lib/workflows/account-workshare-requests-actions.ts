"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";
import {
  normalizeAccountWorkshareConnectionRow,
  type AccountWorkshareConnectionRow,
} from "@/lib/workflows/account-workshare-connections-read";
import {
  normalizeAccountWorkshareRequestRow,
  type AccountWorkshareRequestRow,
} from "@/lib/workflows/account-workshare-requests-read";

type ActionResult =
  | {
      success: true;
      request: AccountWorkshareRequestRow;
    }
  | {
      success: false;
      error: string;
    };

const REQUEST_TYPE_ECC_HERS_TESTING = "ecc_hers_testing";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullableString(value: unknown) {
  const normalized = cleanString(value);
  return normalized.length > 0 ? normalized : null;
}

function limitString(value: unknown, maxLength: number) {
  const normalized = cleanNullableString(value);
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function isUuid(value: string | null | undefined) {
  return UUID_PATTERN.test(cleanString(value));
}

function failure(error: string): ActionResult {
  return { success: false, error };
}

function normalizeDateOnly(value: unknown) {
  const normalized = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function buildDisplayName(...parts: Array<unknown>) {
  const normalized = parts
    .map((part) => cleanString(part))
    .filter(Boolean)
    .join(" ");
  return normalized || null;
}

function buildAddressSnapshot(input: {
  line1?: unknown;
  line2?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  fallback?: unknown;
}) {
  const line1 = cleanNullableString(input.line1);
  const line2 = cleanNullableString(input.line2);
  const city = cleanNullableString(input.city);
  const state = cleanNullableString(input.state);
  const zip = cleanNullableString(input.zip);
  const cityStateZip = [city, state, zip].filter(Boolean).join(" ");
  const formatted = [line1, line2, cityStateZip].filter(Boolean).join(", ")
    || cleanNullableString(input.fallback);

  return {
    formatted,
    line1,
    line2,
    city,
    state,
    zip,
  };
}

function buildRequestedScopeSnapshot(input: {
  requestedScope?: unknown;
  sourceJob?: any;
}) {
  const requestedScopeText = limitString(input.requestedScope, 4000);
  const visitScopeSummary = limitString(input.sourceJob?.visit_scope_summary, 4000);
  const visitScopeItems = Array.isArray(input.sourceJob?.visit_scope_items)
    ? input.sourceJob.visit_scope_items.slice(0, 50).map((item: any) => ({
        title: limitString(item?.title, 240),
        details: limitString(item?.details, 1000),
        kind: limitString(item?.kind, 80),
      }))
    : [];

  return {
    requested_scope_text: requestedScopeText,
    source_visit_scope_summary: visitScopeSummary,
    source_visit_scope_items: visitScopeItems,
  };
}

function withJobRequestNotice(jobId: string, notice: string) {
  return `/jobs/${encodeURIComponent(jobId)}?notice=${encodeURIComponent(notice)}#account-workshare-requests`;
}

async function resolveInternalContext() {
  const supabase = await createClient();

  try {
    const authz = await requireInternalUser({ supabase });
    const userId = cleanString(authz.userId);
    const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);

    if (!userId || !accountOwnerUserId) {
      return { ok: false as const, error: "Active internal user required." };
    }

    return {
      ok: true as const,
      supabase,
      userId,
      accountOwnerUserId,
    };
  } catch (error) {
    if (isInternalAccessError(error)) {
      return { ok: false as const, error: "Authentication required." };
    }

    throw error;
  }
}

async function readConnectionById(admin: any, connectionId: string): Promise<{
  connection: AccountWorkshareConnectionRow | null;
  error: string | null;
}> {
  const { data, error } = await admin
    .from("account_workshare_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();

  if (error) {
    return { connection: null, error: error.message || "Could not load workshare connection." };
  }

  return { connection: normalizeAccountWorkshareConnectionRow(data), error: null };
}

async function readRequestById(admin: any, requestId: string) {
  const { data, error } = await admin
    .from("account_workshare_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    return { request: null, error: error.message || "Could not load workshare request." };
  }

  return { request: normalizeAccountWorkshareRequestRow(data), error: null };
}

export async function createAccountWorkshareRequestFromJob(input: {
  connectionId: string;
  sourceJobId: string;
  requestedScope?: string | null;
  senderNotes?: string | null;
  preferredDate?: string | null;
  preferredWindow?: string | null;
}): Promise<ActionResult> {
  const authz = await resolveInternalContext();
  if (!authz.ok) return failure(authz.error);

  const connectionId = cleanString(input.connectionId);
  const sourceJobId = cleanString(input.sourceJobId);

  if (!isUuid(connectionId)) return failure("Connection id is required.");
  if (!isUuid(sourceJobId)) return failure("Source job id is required.");

  const admin = createAdminClient();
  const sourceJob = await loadScopedInternalJobForMutation({
    admin,
    accountOwnerUserId: authz.accountOwnerUserId,
    jobId: sourceJobId,
    select: [
      "title",
      "job_type",
      "job_display_number",
      "job_address",
      "city",
      "customer_first_name",
      "customer_last_name",
      "customer_phone",
      "customer_email",
      "job_notes",
      "permit_number",
      "visit_scope_summary",
      "visit_scope_items",
      "location_id",
      "locations:location_id (address_line1, address_line2, city, state, zip)",
    ].join(", "),
  });

  if (!sourceJob?.id) {
    return failure("Source job must belong to the current account.");
  }

  const loadedConnection = await readConnectionById(admin, connectionId);
  if (loadedConnection.error) return failure(loadedConnection.error);
  if (!loadedConnection.connection) return failure("Connection not found.");

  const connection = loadedConnection.connection;
  if (connection.status !== "active") {
    return failure("Only active ECC/HERS rater connections can receive requests.");
  }

  if (connection.service_type !== "ecc_hers") {
    return failure("Only ECC/HERS workshare connections can receive requests.");
  }

  if (connection.sender_account_id !== authz.accountOwnerUserId) {
    return failure("Current account must be the sender account for this connection.");
  }

  const customerId = cleanString((sourceJob as any).customer_id);
  let customer: any = null;
  if (customerId) {
    const { data, error } = await admin
      .from("customers")
      .select("id, full_name, billing_name, first_name, last_name, phone, email")
      .eq("id", customerId)
      .eq("owner_user_id", authz.accountOwnerUserId)
      .maybeSingle();

    if (error) return failure(error.message || "Could not load customer snapshot.");
    customer = data ?? null;
  }

  const sourceLocation = Array.isArray((sourceJob as any).locations)
    ? (sourceJob as any).locations.find((location: any) => location) ?? null
    : (sourceJob as any).locations ?? null;
  const address = buildAddressSnapshot({
    line1: sourceLocation?.address_line1,
    line2: sourceLocation?.address_line2,
    city: sourceLocation?.city ?? (sourceJob as any).city,
    state: sourceLocation?.state,
    zip: sourceLocation?.zip,
    fallback: (sourceJob as any).job_address,
  });
  const nowIso = new Date().toISOString();
  const customerName = buildDisplayName(
    customer?.full_name || customer?.billing_name,
    !customer?.full_name && !customer?.billing_name ? customer?.first_name : null,
    !customer?.full_name && !customer?.billing_name ? customer?.last_name : null,
  ) || buildDisplayName((sourceJob as any).customer_first_name, (sourceJob as any).customer_last_name);
  const jobReference = cleanNullableString((sourceJob as any).job_display_number)
    || cleanNullableString((sourceJob as any).id);

  const payload = {
    connection_id: connection.id,
    sender_account_id: authz.accountOwnerUserId,
    receiver_account_id: connection.receiver_account_id,
    source_job_id: sourceJobId,
    receiving_job_id: null,
    request_type: REQUEST_TYPE_ECC_HERS_TESTING,
    status: "sent",
    customer_name_snapshot: limitString(customerName, 240),
    customer_contact_name_snapshot: limitString(customerName, 240),
    customer_phone_snapshot: limitString(customer?.phone ?? (sourceJob as any).customer_phone, 80),
    customer_email_snapshot: limitString(customer?.email ?? (sourceJob as any).customer_email, 240),
    location_address_snapshot: limitString(address.formatted, 800),
    location_address_line1_snapshot: limitString(address.line1, 240),
    location_address_line2_snapshot: limitString(address.line2, 240),
    location_city_snapshot: limitString(address.city, 120),
    location_state_snapshot: limitString(address.state, 80),
    location_zip_snapshot: limitString(address.zip, 40),
    source_job_title_snapshot: limitString((sourceJob as any).title, 240),
    source_job_reference_snapshot: limitString(jobReference, 120),
    source_job_type_snapshot: limitString((sourceJob as any).job_type, 80),
    source_job_description_snapshot: limitString((sourceJob as any).job_notes, 4000),
    permit_number_snapshot: limitString((sourceJob as any).permit_number, 120),
    requested_scope_snapshot: buildRequestedScopeSnapshot({
      requestedScope: input.requestedScope,
      sourceJob,
    }),
    sender_notes_snapshot: limitString(input.senderNotes, 4000),
    preferred_date: normalizeDateOnly(input.preferredDate),
    preferred_window_snapshot: limitString(input.preferredWindow, 240),
    created_by_user_id: authz.userId,
    sent_at: nowIso,
  };

  const { data, error } = await admin
    .from("account_workshare_requests")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error) return failure(error.message || "Could not send ECC/HERS request.");

  const request = normalizeAccountWorkshareRequestRow(data);
  if (!request) return failure("Could not send ECC/HERS request.");

  return { success: true, request };
}

export async function cancelAccountWorkshareRequest(input: {
  requestId: string;
}): Promise<ActionResult> {
  const authz = await resolveInternalContext();
  if (!authz.ok) return failure(authz.error);

  const requestId = cleanString(input.requestId);
  if (!isUuid(requestId)) return failure("Request id is required.");

  const admin = createAdminClient();
  const loaded = await readRequestById(admin, requestId);
  if (loaded.error) return failure(loaded.error);
  if (!loaded.request) return failure("Request not found.");

  if (loaded.request.sender_account_id !== authz.accountOwnerUserId) {
    return failure("Only the sender account can cancel this request.");
  }

  if (loaded.request.status !== "sent") {
    return failure("Only sent requests can be cancelled.");
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("account_workshare_requests")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", requestId)
    .select("*")
    .maybeSingle();

  if (error) return failure(error.message || "Could not cancel ECC/HERS request.");

  const request = normalizeAccountWorkshareRequestRow(data);
  if (!request) return failure("Could not cancel ECC/HERS request.");

  return { success: true, request };
}

export async function declineAccountWorkshareRequest(input: {
  requestId: string;
  reason: string;
}): Promise<ActionResult> {
  const authz = await resolveInternalContext();
  if (!authz.ok) return failure(authz.error);

  const requestId = cleanString(input.requestId);
  if (!isUuid(requestId)) return failure("Request id is required.");

  const reason = limitString(input.reason, 2000);
  if (!reason) return failure("A decline reason is required.");

  const admin = createAdminClient();
  const loaded = await readRequestById(admin, requestId);
  if (loaded.error) return failure(loaded.error);
  if (!loaded.request) return failure("Request not found.");

  // Decline is a RECEIVER action (cancel is the sender's). Authorize at the app
  // layer before the service-role write; the DB trigger is defense-in-depth.
  if (loaded.request.receiver_account_id !== authz.accountOwnerUserId) {
    return failure("Only the receiver account can decline this request.");
  }

  if (loaded.request.status !== "sent") {
    return failure("Only sent requests can be declined.");
  }

  // Status transition + audit event happen atomically inside the RPC. Use the
  // admin client: the audit table is service-role-write-only, and the RPC is
  // granted to service_role only.
  const { data, error } = await admin.rpc("decline_account_workshare_request", {
    p_request_id: requestId,
    p_reason: reason,
    p_actor_user_id: authz.userId,
  });

  if (error) return failure(error.message || "Could not decline ECC/HERS request.");

  const request = normalizeAccountWorkshareRequestRow(data);
  if (!request) return failure("Could not decline ECC/HERS request.");

  return { success: true, request };
}

export async function createAccountWorkshareRequestFromJobForm(formData: FormData): Promise<void> {
  const sourceJobId = cleanString(formData.get("source_job_id"));
  const result = await createAccountWorkshareRequestFromJob({
    connectionId: cleanString(formData.get("connection_id")),
    sourceJobId,
    requestedScope: cleanNullableString(formData.get("requested_scope")),
    senderNotes: cleanNullableString(formData.get("sender_notes")),
    preferredDate: cleanNullableString(formData.get("preferred_date")),
    preferredWindow: cleanNullableString(formData.get("preferred_window")),
  });

  if (!result.success) {
    redirect(withJobRequestNotice(sourceJobId, "workshare_request_error"));
  }

  revalidatePath(`/jobs/${sourceJobId}`);
  redirect(withJobRequestNotice(sourceJobId, "workshare_request_sent"));
}

export async function cancelAccountWorkshareRequestFromForm(formData: FormData): Promise<void> {
  const sourceJobId = cleanString(formData.get("source_job_id"));
  const result = await cancelAccountWorkshareRequest({
    requestId: cleanString(formData.get("request_id")),
  });

  if (!result.success) {
    redirect(withJobRequestNotice(sourceJobId, "workshare_request_error"));
  }

  revalidatePath(`/jobs/${sourceJobId}`);
  redirect(withJobRequestNotice(sourceJobId, "workshare_request_cancelled"));
}

export async function declineAccountWorkshareRequestFromForm(formData: FormData): Promise<void> {
  const result = await declineAccountWorkshareRequest({
    requestId: cleanString(formData.get("request_id")),
    reason: cleanString(formData.get("decline_reason")),
  });

  // Receiver-side surface: redirect back to the incoming queue (not the job page).
  if (!result.success) {
    redirect("/ops/workshare/incoming?notice=workshare_decline_error");
  }

  revalidatePath("/ops/workshare/incoming");
  revalidatePath("/ops/workshare/decided");
  redirect("/ops/workshare/incoming?notice=workshare_declined");
}
