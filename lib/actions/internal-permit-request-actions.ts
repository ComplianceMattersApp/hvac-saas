"use server";

import { revalidatePath } from "next/cache";
import { requireInternalUser } from "@/lib/auth/internal-user";
import {
  isActivePermitRequestStatus,
  isPermitPostPermitRoute,
  type ActivePermitRequestStatus,
  type PermitPostPermitRoute,
  type PermitRequestEventType,
  type PermitRequestStatus,
} from "@/lib/permits/permit-request-contracts";
import { isPermitRequestSchemaUnavailableError } from "@/lib/permits/permit-requests-read-model";
import { assertPermitWorkflowEnabledForAccountOwner } from "@/lib/permits/permit-workflow-gate";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { deriveInternalIntakeJobTitle } from "@/lib/utils/contractor-intake-title";

export type InternalManualPermitRequestInput = {
  contractorId: string;
  requestLabel?: string | null;
  intakeNote?: string | null;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  serviceAddressText?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  jurisdiction?: string | null;
};

export type InternalPermitRequestStateActionInput = {
  permitRequestId: string;
};

export type InternalMarkPermitRequestNotNeededInput = InternalPermitRequestStateActionInput & {
  reason: string;
};

export type InternalPermitRequestIntakeInput = {
  permitRequestId: string;
  requestLabel?: string | null;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  serviceAddressText?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  jurisdiction?: string | null;
  internalIntakeNote?: string | null;
  contractorNote?: string | null;
  permitNumber?: string | null;
  permitDate?: string | null;
};

export type InternalMarkPermitCreatedInput = {
  permitRequestId: string;
  postPermitRoute: PermitPostPermitRoute | string;
  permitNumber: string;
  jurisdiction?: string | null;
  permitDate?: string | null;
};

export type PermitRequestJobCustomerLocationMode =
  | "existing_existing"
  | "existing_new"
  | "new_new";

export type InternalCreateJobFromPermitRequestInput = {
  permitRequestId: string;
  postPermitRoute: PermitPostPermitRoute | string;
  permitNumber: string;
  jurisdiction?: string | null;
  permitDate?: string | null;
  projectType?: string | null;
  billingRecipient?: string | null;
  customerLocationMode: PermitRequestJobCustomerLocationMode | string;
  existingCustomerId?: string | null;
  existingLocationId?: string | null;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  locationNickname?: string | null;
  jobTitle?: string | null;
};

const PENDING_INSTALL_REASON = "Permit pulled and waiting for install";

const TERMINAL_JOB_STATUSES = new Set(["completed", "cancelled", "failed", "closed", "archived"]);
const PROTECTED_OPS_STATUSES = new Set([
  "failed",
  "retest_needed",
  "pending_office_review",
  "paperwork_required",
  "invoice_required",
  "closed",
]);

function getTrimmedValue(value: unknown, maxLength: number) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function readManualPermitRequestInput(input: FormData | InternalManualPermitRequestInput) {
  if (input instanceof FormData) {
    return {
      contractorId: getTrimmedValue(input.get("contractor_id"), 120) ?? "",
      requestLabel: getTrimmedValue(input.get("request_label"), 160),
      intakeNote: getTrimmedValue(input.get("intake_note"), 4000),
      customerFirstName: getTrimmedValue(input.get("customer_first_name"), 120),
      customerLastName: getTrimmedValue(input.get("customer_last_name"), 120),
      customerEmail: getTrimmedValue(input.get("customer_email"), 240),
      customerPhone: getTrimmedValue(input.get("customer_phone"), 80),
      serviceAddressText: getTrimmedValue(input.get("service_address_text"), 500),
      addressLine2: getTrimmedValue(input.get("address_line2"), 240),
      city: getTrimmedValue(input.get("city"), 120),
      state: getTrimmedValue(input.get("state"), 40),
      zip: getTrimmedValue(input.get("zip"), 40),
      jurisdiction: getTrimmedValue(input.get("jurisdiction"), 160),
    };
  }

  return {
    contractorId: getTrimmedValue(input.contractorId, 120) ?? "",
    requestLabel: getTrimmedValue(input.requestLabel, 160),
    intakeNote: getTrimmedValue(input.intakeNote, 4000),
    customerFirstName: getTrimmedValue(input.customerFirstName, 120),
    customerLastName: getTrimmedValue(input.customerLastName, 120),
    customerEmail: getTrimmedValue(input.customerEmail, 240),
    customerPhone: getTrimmedValue(input.customerPhone, 80),
    serviceAddressText: getTrimmedValue(input.serviceAddressText, 500),
    addressLine2: getTrimmedValue(input.addressLine2, 240),
    city: getTrimmedValue(input.city, 120),
    state: getTrimmedValue(input.state, 40),
    zip: getTrimmedValue(input.zip, 40),
    jurisdiction: getTrimmedValue(input.jurisdiction, 160),
  };
}

function buildManualPermitRequestNote(input: ReturnType<typeof readManualPermitRequestInput>) {
  const customerName = [input.customerFirstName, input.customerLastName].filter(Boolean).join(" ");
  const lines = [
    input.requestLabel ? `Request: ${input.requestLabel}` : null,
    input.intakeNote ? `Note: ${input.intakeNote}` : null,
    customerName ? `Customer: ${customerName}` : null,
    input.serviceAddressText ? `Service address: ${input.serviceAddressText}` : null,
  ].filter(Boolean);

  return lines.length ? lines.join("\n").slice(0, 4000) : null;
}

function buildNoteSnippet(value: string | null) {
  return value ? value.slice(0, 240) : null;
}

function readPermitRequestStateActionInput(input: FormData | InternalPermitRequestStateActionInput) {
  if (input instanceof FormData) {
    return {
      permitRequestId: getTrimmedValue(input.get("permit_request_id"), 120) ?? "",
    };
  }

  return {
    permitRequestId: getTrimmedValue(input.permitRequestId, 120) ?? "",
  };
}

function readMarkPermitRequestNotNeededInput(input: FormData | InternalMarkPermitRequestNotNeededInput) {
  if (input instanceof FormData) {
    return {
      permitRequestId: getTrimmedValue(input.get("permit_request_id"), 120) ?? "",
      reason: getTrimmedValue(input.get("reason"), 500) ?? "",
    };
  }

  return {
    permitRequestId: getTrimmedValue(input.permitRequestId, 120) ?? "",
    reason: getTrimmedValue(input.reason, 500) ?? "",
  };
}

function readPermitRequestIntakeInput(input: FormData | InternalPermitRequestIntakeInput) {
  if (input instanceof FormData) {
    return {
      permitRequestId: getTrimmedValue(input.get("permit_request_id"), 120) ?? "",
      requestLabel: getTrimmedValue(input.get("request_label"), 160),
      customerFirstName: getTrimmedValue(input.get("customer_first_name_snapshot"), 120),
      customerLastName: getTrimmedValue(input.get("customer_last_name_snapshot"), 120),
      customerEmail: getTrimmedValue(input.get("customer_email_snapshot"), 240),
      customerPhone: getTrimmedValue(input.get("customer_phone_snapshot"), 80),
      serviceAddressText: getTrimmedValue(input.get("service_address_text_snapshot"), 500),
      addressLine2: getTrimmedValue(input.get("address_line2_snapshot"), 240),
      city: getTrimmedValue(input.get("city_snapshot"), 120),
      state: getTrimmedValue(input.get("state_snapshot"), 40),
      zip: getTrimmedValue(input.get("zip_snapshot"), 40),
      jurisdiction: getTrimmedValue(input.get("jurisdiction"), 160),
      internalIntakeNote: getTrimmedValue(input.get("internal_intake_note"), 4000),
      contractorNote: getTrimmedValue(input.get("contractor_note"), 4000),
      permitNumber: getTrimmedValue(input.get("permit_number"), 160),
      permitDate: getNormalizedPermitDate(input.get("permit_date")),
    };
  }

  return {
    permitRequestId: getTrimmedValue(input.permitRequestId, 120) ?? "",
    requestLabel: getTrimmedValue(input.requestLabel, 160),
    customerFirstName: getTrimmedValue(input.customerFirstName, 120),
    customerLastName: getTrimmedValue(input.customerLastName, 120),
    customerEmail: getTrimmedValue(input.customerEmail, 240),
    customerPhone: getTrimmedValue(input.customerPhone, 80),
    serviceAddressText: getTrimmedValue(input.serviceAddressText, 500),
    addressLine2: getTrimmedValue(input.addressLine2, 240),
    city: getTrimmedValue(input.city, 120),
    state: getTrimmedValue(input.state, 40),
    zip: getTrimmedValue(input.zip, 40),
    jurisdiction: getTrimmedValue(input.jurisdiction, 160),
    internalIntakeNote: getTrimmedValue(input.internalIntakeNote, 4000),
    contractorNote: getTrimmedValue(input.contractorNote, 4000),
    permitNumber: getTrimmedValue(input.permitNumber, 160),
    permitDate: getNormalizedPermitDate(input.permitDate),
  };
}

function readMarkPermitCreatedInput(input: FormData | InternalMarkPermitCreatedInput) {
  if (input instanceof FormData) {
    return {
      permitRequestId: getTrimmedValue(input.get("permit_request_id"), 120) ?? "",
      postPermitRoute: getTrimmedValue(input.get("post_permit_route"), 80) ?? "",
      permitNumber: getTrimmedValue(input.get("permit_number"), 160) ?? "",
      jurisdiction: getTrimmedValue(input.get("jurisdiction"), 160),
      permitDate: getNormalizedPermitDate(input.get("permit_date")),
    };
  }

  return {
    permitRequestId: getTrimmedValue(input.permitRequestId, 120) ?? "",
    postPermitRoute: getTrimmedValue(input.postPermitRoute, 80) ?? "",
    permitNumber: getTrimmedValue(input.permitNumber, 160) ?? "",
    jurisdiction: getTrimmedValue(input.jurisdiction, 160),
    permitDate: getNormalizedPermitDate(input.permitDate),
  };
}

function normalizeCustomerLocationMode(value: unknown): PermitRequestJobCustomerLocationMode | "" {
  const mode = getTrimmedValue(value, 80);
  if (mode === "existing_existing" || mode === "existing_new" || mode === "new_new") {
    return mode;
  }

  return "";
}

function normalizePermitJobProjectType(value: unknown): "alteration" | "all_new" {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "all_new" || normalized === "new_construction" ? "all_new" : "alteration";
}

function normalizePermitJobBillingRecipient(value: unknown): "contractor" | "customer" {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "customer" ? "customer" : "contractor";
}

function readCreateJobFromPermitRequestInput(input: FormData | InternalCreateJobFromPermitRequestInput) {
  if (input instanceof FormData) {
    return {
      permitRequestId: getTrimmedValue(input.get("permit_request_id"), 120) ?? "",
      postPermitRoute: getTrimmedValue(input.get("post_permit_route"), 80) ?? "",
      permitNumber: getTrimmedValue(input.get("permit_number"), 160) ?? "",
      jurisdiction: getTrimmedValue(input.get("jurisdiction"), 160),
      permitDate: getNormalizedPermitDate(input.get("permit_date")),
      projectType: normalizePermitJobProjectType(input.get("project_type")),
      billingRecipient: normalizePermitJobBillingRecipient(input.get("billing_recipient")),
      customerLocationMode: normalizeCustomerLocationMode(input.get("customer_location_mode")),
      existingCustomerId: getTrimmedValue(input.get("existing_customer_id"), 120),
      existingLocationId: getTrimmedValue(input.get("existing_location_id"), 120),
      customerFirstName: getTrimmedValue(input.get("customer_first_name"), 120),
      customerLastName: getTrimmedValue(input.get("customer_last_name"), 120),
      customerEmail: getTrimmedValue(input.get("customer_email"), 240),
      customerPhone: getTrimmedValue(input.get("customer_phone"), 80),
      addressLine1: getTrimmedValue(input.get("address_line1"), 240),
      addressLine2: getTrimmedValue(input.get("address_line2"), 240),
      city: getTrimmedValue(input.get("city"), 120),
      state: getTrimmedValue(input.get("state"), 40),
      zip: getTrimmedValue(input.get("zip"), 40),
      locationNickname: getTrimmedValue(input.get("location_nickname"), 160),
      jobTitle: getTrimmedValue(input.get("job_title"), 160),
    };
  }

  return {
    permitRequestId: getTrimmedValue(input.permitRequestId, 120) ?? "",
    postPermitRoute: getTrimmedValue(input.postPermitRoute, 80) ?? "",
    permitNumber: getTrimmedValue(input.permitNumber, 160) ?? "",
    jurisdiction: getTrimmedValue(input.jurisdiction, 160),
    permitDate: getNormalizedPermitDate(input.permitDate),
    projectType: normalizePermitJobProjectType(input.projectType),
    billingRecipient: normalizePermitJobBillingRecipient(input.billingRecipient),
    customerLocationMode: normalizeCustomerLocationMode(input.customerLocationMode),
    existingCustomerId: getTrimmedValue(input.existingCustomerId, 120),
    existingLocationId: getTrimmedValue(input.existingLocationId, 120),
    customerFirstName: getTrimmedValue(input.customerFirstName, 120),
    customerLastName: getTrimmedValue(input.customerLastName, 120),
    customerEmail: getTrimmedValue(input.customerEmail, 240),
    customerPhone: getTrimmedValue(input.customerPhone, 80),
    addressLine1: getTrimmedValue(input.addressLine1, 240),
    addressLine2: getTrimmedValue(input.addressLine2, 240),
    city: getTrimmedValue(input.city, 120),
    state: getTrimmedValue(input.state, 40),
    zip: getTrimmedValue(input.zip, 40),
    locationNickname: getTrimmedValue(input.locationNickname, 160),
    jobTitle: getTrimmedValue(input.jobTitle, 160),
  };
}

function getNormalizedPermitDate(value: unknown) {
  const normalized = getTrimmedValue(value, 40);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Permit date must use YYYY-MM-DD format.");
  }

  return normalized;
}

async function assertPermitRequestSchemaAvailable(admin: any) {
  const { error } = await admin
    .from("permit_requests")
    .select("id, request_label", { count: "exact", head: true })
    .limit(1);

  if (!error) return;
  if (isPermitRequestSchemaUnavailableError(error)) {
    throw new Error("Permit requests are temporarily unavailable.");
  }

  throw error;
}

async function loadAccountScopedContractor(admin: any, input: {
  contractorId: string;
  accountOwnerUserId: string;
}) {
  const { data, error } = await admin
    .from("contractors")
    .select("id, owner_user_id, name")
    .eq("id", input.contractorId)
    .maybeSingle();

  if (error) throw error;

  const contractor = data as { id?: unknown; owner_user_id?: unknown; name?: unknown } | null;
  if (
    String(contractor?.id ?? "").trim() !== input.contractorId ||
    String(contractor?.owner_user_id ?? "").trim() !== input.accountOwnerUserId
  ) {
    throw new Error("Contractor not found in your account.");
  }

  return {
    id: input.contractorId,
    name: getTrimmedValue(contractor?.name, 160),
  };
}

type ActivePermitRequestForMutation = {
  id: string;
  account_owner_user_id: string;
  contractor_id: string;
  status: ActivePermitRequestStatus;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  request_label: string | null;
  customer_first_name_snapshot: string | null;
  customer_last_name_snapshot: string | null;
  customer_email_snapshot: string | null;
  customer_phone_snapshot: string | null;
  service_address_text_snapshot: string | null;
  address_line1_snapshot: string | null;
  address_line2_snapshot: string | null;
  city_snapshot: string | null;
  state_snapshot: string | null;
  zip_snapshot: string | null;
  jurisdiction: string | null;
  internal_intake_note: string | null;
  contractor_note: string | null;
  permit_number: string | null;
  permit_date: string | null;
  job_id: string | null;
  service_case_id: string | null;
};

async function loadAccountScopedActivePermitRequest(admin: any, input: {
  permitRequestId: string;
  accountOwnerUserId: string;
}) {
  const { data, error } = await admin
    .from("permit_requests")
    .select([
      "id",
      "account_owner_user_id",
      "contractor_id",
      "status",
      "accepted_by_user_id",
      "accepted_at",
      "request_label",
      "customer_first_name_snapshot",
      "customer_last_name_snapshot",
      "customer_email_snapshot",
      "customer_phone_snapshot",
      "service_address_text_snapshot",
      "address_line1_snapshot",
      "address_line2_snapshot",
      "city_snapshot",
      "state_snapshot",
      "zip_snapshot",
      "jurisdiction",
      "internal_intake_note",
      "contractor_note",
      "permit_number",
      "permit_date",
      "job_id",
      "service_case_id",
    ].join(", "))
    .eq("id", input.permitRequestId)
    .maybeSingle();

  if (error) throw error;

  const row = data as {
    id?: unknown;
    account_owner_user_id?: unknown;
    contractor_id?: unknown;
    status?: unknown;
    accepted_by_user_id?: unknown;
    accepted_at?: unknown;
    request_label?: unknown;
    customer_first_name_snapshot?: unknown;
    customer_last_name_snapshot?: unknown;
    customer_email_snapshot?: unknown;
    customer_phone_snapshot?: unknown;
    service_address_text_snapshot?: unknown;
    address_line1_snapshot?: unknown;
    address_line2_snapshot?: unknown;
    city_snapshot?: unknown;
    state_snapshot?: unknown;
    zip_snapshot?: unknown;
    jurisdiction?: unknown;
    internal_intake_note?: unknown;
    contractor_note?: unknown;
    permit_number?: unknown;
    permit_date?: unknown;
    job_id?: unknown;
    service_case_id?: unknown;
  } | null;

  if (
    String(row?.id ?? "").trim() !== input.permitRequestId ||
    String(row?.account_owner_user_id ?? "").trim() !== input.accountOwnerUserId
  ) {
    throw new Error("Permit request not found in your account.");
  }

  if (!isActivePermitRequestStatus(row?.status)) {
    throw new Error("Permit request is not active.");
  }

  const activeRow = row as {
    id: unknown;
    account_owner_user_id: unknown;
    contractor_id: unknown;
    status: ActivePermitRequestStatus;
    accepted_by_user_id?: unknown;
    accepted_at?: unknown;
    request_label?: unknown;
    customer_first_name_snapshot?: unknown;
    customer_last_name_snapshot?: unknown;
    customer_email_snapshot?: unknown;
    customer_phone_snapshot?: unknown;
    service_address_text_snapshot?: unknown;
    address_line1_snapshot?: unknown;
    address_line2_snapshot?: unknown;
    city_snapshot?: unknown;
    state_snapshot?: unknown;
    zip_snapshot?: unknown;
    jurisdiction?: unknown;
    internal_intake_note?: unknown;
    contractor_note?: unknown;
    permit_number?: unknown;
    permit_date?: unknown;
    job_id?: unknown;
    service_case_id?: unknown;
  };

  return {
    id: input.permitRequestId,
    account_owner_user_id: input.accountOwnerUserId,
    contractor_id: String(activeRow.contractor_id ?? "").trim(),
    status: activeRow.status,
    accepted_by_user_id: getTrimmedValue(activeRow.accepted_by_user_id, 120),
    accepted_at: getTrimmedValue(activeRow.accepted_at, 80),
    request_label: getTrimmedValue(activeRow.request_label, 160),
    customer_first_name_snapshot: getTrimmedValue(activeRow.customer_first_name_snapshot, 120),
    customer_last_name_snapshot: getTrimmedValue(activeRow.customer_last_name_snapshot, 120),
    customer_email_snapshot: getTrimmedValue(activeRow.customer_email_snapshot, 240),
    customer_phone_snapshot: getTrimmedValue(activeRow.customer_phone_snapshot, 80),
    service_address_text_snapshot: getTrimmedValue(activeRow.service_address_text_snapshot, 500),
    address_line1_snapshot: getTrimmedValue(activeRow.address_line1_snapshot, 240),
    address_line2_snapshot: getTrimmedValue(activeRow.address_line2_snapshot, 240),
    city_snapshot: getTrimmedValue(activeRow.city_snapshot, 120),
    state_snapshot: getTrimmedValue(activeRow.state_snapshot, 40),
    zip_snapshot: getTrimmedValue(activeRow.zip_snapshot, 40),
    jurisdiction: getTrimmedValue(activeRow.jurisdiction, 160),
    internal_intake_note: getTrimmedValue(activeRow.internal_intake_note, 4000),
    contractor_note: getTrimmedValue(activeRow.contractor_note, 4000),
    permit_number: getTrimmedValue(activeRow.permit_number, 160),
    permit_date: getTrimmedValue(activeRow.permit_date, 40),
    job_id: getTrimmedValue(activeRow.job_id, 120),
    service_case_id: getTrimmedValue(activeRow.service_case_id, 120),
  } satisfies ActivePermitRequestForMutation;
}

async function insertPermitRequestTransitionEvent(admin: any, input: {
  accountOwnerUserId: string;
  permitRequestId: string;
  actorUserId: string;
  eventType: PermitRequestEventType;
  fromStatus: PermitRequestStatus;
  toStatus: PermitRequestStatus;
  postPermitRoute?: PermitPostPermitRoute | null;
  jobId?: string | null;
  serviceCaseId?: string | null;
  meta?: Record<string, unknown>;
}) {
  const { error } = await admin
    .from("permit_request_events")
    .insert({
      account_owner_user_id: input.accountOwnerUserId,
      permit_request_id: input.permitRequestId,
      job_id: input.jobId ?? null,
      service_case_id: input.serviceCaseId ?? null,
      event_type: input.eventType,
      actor_user_id: input.actorUserId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      post_permit_route: input.postPermitRoute ?? null,
      meta: {
        source: "internal_ops",
        permit_request_id: input.permitRequestId,
        job_id: input.jobId ?? null,
        service_case_id: input.serviceCaseId ?? null,
        from_status: input.fromStatus,
        to_status: input.toStatus,
        post_permit_route: input.postPermitRoute ?? null,
        ...input.meta,
      },
    });

  if (error) throw error;
}

type LinkedPermitJobForMutation = {
  id: string;
  customer_id: string | null;
  status: string | null;
  ops_status: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  field_complete: boolean | null;
  deleted_at: string | null;
  service_case_id: string | null;
  permit_number: string | null;
  jurisdiction: string | null;
  permit_date: string | null;
  pending_info_reason: string | null;
  on_hold_reason: string | null;
};

async function loadLinkedPermitJobForMutation(admin: any, input: {
  permitRequest: ActivePermitRequestForMutation;
  accountOwnerUserId: string;
}) {
  if (!input.permitRequest.job_id) {
    throw new Error("Link a job before marking the permit created.");
  }

  const job = await loadScopedInternalJobForMutation({
    admin,
    accountOwnerUserId: input.accountOwnerUserId,
    jobId: input.permitRequest.job_id,
    select: [
      "status",
      "ops_status",
      "scheduled_date",
      "window_start",
      "window_end",
      "field_complete",
      "deleted_at",
      "permit_number",
      "jurisdiction",
      "permit_date",
      "pending_info_reason",
      "on_hold_reason",
    ].join(", "),
  });

  if (!job?.id) {
    throw new Error("Linked job not found in your account.");
  }

  const linkedJob = job as LinkedPermitJobForMutation;
  if (String(linkedJob.deleted_at ?? "").trim()) {
    throw new Error("Linked job is no longer active.");
  }

  return linkedJob;
}

function hasScheduledTime(job: Pick<LinkedPermitJobForMutation, "scheduled_date" | "window_start" | "window_end">) {
  return Boolean(
    String(job.scheduled_date ?? "").trim() ||
    String(job.window_start ?? "").trim() ||
    String(job.window_end ?? "").trim()
  );
}

function assertLinkedJobCanReceivePermitRoute(input: {
  job: LinkedPermitJobForMutation;
  route: PermitPostPermitRoute;
}) {
  const status = String(input.job.status ?? "").trim().toLowerCase();
  const opsStatus = String(input.job.ops_status ?? "").trim().toLowerCase();
  const pendingInfoReason = String(input.job.pending_info_reason ?? "").trim();
  const onHoldReason = String(input.job.on_hold_reason ?? "").trim();

  if (TERMINAL_JOB_STATUSES.has(status) || Boolean(input.job.field_complete)) {
    throw new Error("Linked job is not eligible for permit routing.");
  }

  if (PROTECTED_OPS_STATUSES.has(opsStatus)) {
    throw new Error("Linked job has a protected operational state.");
  }

  if (
    opsStatus === "pending_info" &&
    pendingInfoReason &&
    pendingInfoReason !== "Permit Needed" &&
    pendingInfoReason !== PENDING_INSTALL_REASON
  ) {
    throw new Error("Linked job has an unrelated pending information blocker.");
  }

  if (
    opsStatus === "on_hold" &&
    onHoldReason &&
    onHoldReason !== PENDING_INSTALL_REASON &&
    onHoldReason !== "Permit Needed"
  ) {
    throw new Error("Linked job has an unrelated on-hold blocker.");
  }

  if (input.route === "pending_install" && hasScheduledTime(input.job)) {
    throw new Error("Pending install cannot be selected for an already scheduled job.");
  }
}

function buildLinkedJobUpdatePayload(input: {
  job: LinkedPermitJobForMutation;
  route: PermitPostPermitRoute;
  permitNumber: string;
  jurisdiction: string | null;
  permitDate: string | null;
}) {
  const scheduled = hasScheduledTime(input.job);
  const payload: Record<string, unknown> = {
    permit_number: input.permitNumber,
    jurisdiction: input.jurisdiction,
    permit_date: input.permitDate,
  };

  if (input.route === "ready_for_testing") {
    if (!scheduled && String(input.job.status ?? "").trim().toLowerCase() === "open") {
      payload.ops_status = "need_to_schedule";
    } else if (
      scheduled &&
      ["pending_info", "on_hold"].includes(String(input.job.ops_status ?? "").trim().toLowerCase())
    ) {
      payload.ops_status = "scheduled";
    }

    if (String(input.job.pending_info_reason ?? "").trim() === "Permit Needed") {
      payload.pending_info_reason = null;
    }
    if (String(input.job.on_hold_reason ?? "").trim() === PENDING_INSTALL_REASON) {
      payload.on_hold_reason = null;
    }

    return payload;
  }

  payload.ops_status = "on_hold";
  payload.on_hold_reason = PENDING_INSTALL_REASON;
  payload.pending_info_reason = null;

  return payload;
}

async function insertLinkedJobPermitCreatedEvent(admin: any, input: {
  jobId: string;
  actorUserId: string;
  permitRequestId: string;
  postPermitRoute: PermitPostPermitRoute;
  permitNumber: string;
  jurisdiction: string | null;
  permitDate: string | null;
  jobOpsStatusBefore: string | null;
  jobOpsStatusAfter: string | null;
  sourceAction?: string | null;
  createdJobId?: string | null;
  customerLocationMode?: PermitRequestJobCustomerLocationMode | null;
}) {
  const { error } = await admin
    .from("job_events")
    .insert({
      job_id: input.jobId,
      event_type: "permit_created",
      user_id: input.actorUserId,
      message: "Permit created.",
      meta: {
        event_family: "permit_workflow",
        permit_request_id: input.permitRequestId,
        post_permit_route: input.postPermitRoute,
        permit_number: input.permitNumber,
        jurisdiction: input.jurisdiction,
        permit_date: input.permitDate,
        job_ops_status_before: input.jobOpsStatusBefore,
        job_ops_status_after: input.jobOpsStatusAfter,
        source_action: input.sourceAction ?? null,
        created_job_id: input.createdJobId ?? null,
        customer_location_mode: input.customerLocationMode ?? null,
        timeline_v: 1,
      },
    });

  if (error) throw error;
}

type PermitJobCustomer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type PermitJobLocation = {
  id: string;
  customer_id: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  postal_code: string | null;
  nickname: string | null;
};

function requireStructuredAddress(input: ReturnType<typeof readCreateJobFromPermitRequestInput>) {
  if (!input.addressLine1 || !input.city || !input.state || !input.zip) {
    throw new Error("Street address, city, state, and ZIP are required to create a job.");
  }

  return {
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    state: input.state,
    zip: input.zip,
    nickname: input.locationNickname,
  };
}

function normalizeCustomerRow(row: any, fallbackId: string): PermitJobCustomer {
  return {
    id: fallbackId,
    first_name: getTrimmedValue(row?.first_name, 120),
    last_name: getTrimmedValue(row?.last_name, 120),
    full_name: getTrimmedValue(row?.full_name, 240),
    email: getTrimmedValue(row?.email, 240),
    phone: getTrimmedValue(row?.phone, 80),
  };
}

function normalizeLocationRow(row: any, fallbackId: string): PermitJobLocation {
  return {
    id: fallbackId,
    customer_id: getTrimmedValue(row?.customer_id, 120) ?? "",
    address_line1: getTrimmedValue(row?.address_line1, 240),
    address_line2: getTrimmedValue(row?.address_line2, 240),
    city: getTrimmedValue(row?.city, 120),
    state: getTrimmedValue(row?.state, 40),
    zip: getTrimmedValue(row?.zip, 40),
    postal_code: getTrimmedValue(row?.postal_code, 40),
    nickname: getTrimmedValue(row?.nickname, 160),
  };
}

async function loadExistingPermitJobCustomer(admin: any, input: {
  customerId: string;
  accountOwnerUserId: string;
}) {
  const { data, error } = await admin
    .from("customers")
    .select("id, owner_user_id, first_name, last_name, full_name, email, phone")
    .eq("id", input.customerId)
    .maybeSingle();

  if (error) throw error;

  const row = data as { id?: unknown; owner_user_id?: unknown } | null;
  if (
    String(row?.id ?? "").trim() !== input.customerId ||
    String(row?.owner_user_id ?? "").trim() !== input.accountOwnerUserId
  ) {
    throw new Error("Customer not found in your account.");
  }

  return normalizeCustomerRow(data, input.customerId);
}

async function loadExistingPermitJobLocation(admin: any, input: {
  locationId: string;
  customerId: string;
  accountOwnerUserId: string;
}) {
  const { data, error } = await admin
    .from("locations")
    .select("id, customer_id, owner_user_id, address_line1, address_line2, city, state, zip, postal_code, nickname")
    .eq("id", input.locationId)
    .maybeSingle();

  if (error) throw error;

  const row = data as { id?: unknown; customer_id?: unknown; owner_user_id?: unknown } | null;
  if (
    String(row?.id ?? "").trim() !== input.locationId ||
    String(row?.owner_user_id ?? "").trim() !== input.accountOwnerUserId
  ) {
    throw new Error("Location not found in your account.");
  }

  if (String(row?.customer_id ?? "").trim() !== input.customerId) {
    throw new Error("Location does not belong to the selected customer.");
  }

  return normalizeLocationRow(data, input.locationId);
}

async function createPermitJobCustomer(admin: any, input: {
  accountOwnerUserId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}) {
  if (!input.firstName && !input.lastName) {
    throw new Error("Customer first or last name is required to create a job.");
  }

  const fullName = [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || null;
  const { data, error } = await admin
    .from("customers")
    .insert({
      first_name: input.firstName,
      last_name: input.lastName,
      full_name: fullName,
      email: input.email,
      phone: input.phone,
      owner_user_id: input.accountOwnerUserId,
    })
    .select("id, first_name, last_name, full_name, email, phone")
    .single();

  if (error) throw error;

  const customerId = getTrimmedValue((data as any)?.id, 120);
  if (!customerId) throw new Error("Customer could not be created.");

  return normalizeCustomerRow(data, customerId);
}

async function createPermitJobLocation(admin: any, input: {
  accountOwnerUserId: string;
  customerId: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string | null;
  zip: string | null;
  nickname: string | null;
}) {
  const { data, error } = await admin
    .from("locations")
    .insert({
      customer_id: input.customerId,
      owner_user_id: input.accountOwnerUserId,
      address_line1: input.addressLine1,
      address_line2: input.addressLine2,
      city: input.city,
      state: input.state,
      zip: input.zip,
      postal_code: input.zip,
      nickname: input.nickname,
    })
    .select("id, customer_id, address_line1, address_line2, city, state, zip, postal_code, nickname")
    .single();

  if (error) throw error;

  const locationId = getTrimmedValue((data as any)?.id, 120);
  if (!locationId) throw new Error("Location could not be created.");

  return normalizeLocationRow(data, locationId);
}

async function resolvePermitJobCustomerLocation(admin: any, input: {
  parsed: ReturnType<typeof readCreateJobFromPermitRequestInput>;
  accountOwnerUserId: string;
}) {
  if (!input.parsed.customerLocationMode) {
    throw new Error("Choose how the job customer and location should be created.");
  }

  if (input.parsed.customerLocationMode === "existing_existing") {
    if (!input.parsed.existingCustomerId || !input.parsed.existingLocationId) {
      throw new Error("Select an existing customer and location.");
    }

    const customer = await loadExistingPermitJobCustomer(admin, {
      customerId: input.parsed.existingCustomerId,
      accountOwnerUserId: input.accountOwnerUserId,
    });
    const location = await loadExistingPermitJobLocation(admin, {
      locationId: input.parsed.existingLocationId,
      customerId: customer.id,
      accountOwnerUserId: input.accountOwnerUserId,
    });

    return {
      mode: input.parsed.customerLocationMode,
      customer,
      location,
    };
  }

  if (input.parsed.customerLocationMode === "existing_new") {
    if (!input.parsed.existingCustomerId) {
      throw new Error("Select an existing customer.");
    }

    const address = requireStructuredAddress(input.parsed);
    const customer = await loadExistingPermitJobCustomer(admin, {
      customerId: input.parsed.existingCustomerId,
      accountOwnerUserId: input.accountOwnerUserId,
    });
    const location = await createPermitJobLocation(admin, {
      accountOwnerUserId: input.accountOwnerUserId,
      customerId: customer.id,
      ...address,
    });

    return {
      mode: input.parsed.customerLocationMode,
      customer,
      location,
    };
  }

  const address = requireStructuredAddress(input.parsed);
  const customer = await createPermitJobCustomer(admin, {
    accountOwnerUserId: input.accountOwnerUserId,
    firstName: input.parsed.customerFirstName,
    lastName: input.parsed.customerLastName,
    email: input.parsed.customerEmail,
    phone: input.parsed.customerPhone,
  });
  const location = await createPermitJobLocation(admin, {
    accountOwnerUserId: input.accountOwnerUserId,
    customerId: customer.id,
    ...address,
  });

  return {
    mode: input.parsed.customerLocationMode,
    customer,
    location,
  };
}

function buildPermitJobTitle(input: {
  parsed: ReturnType<typeof readCreateJobFromPermitRequestInput>;
}) {
  return (
    input.parsed.jobTitle ||
    deriveInternalIntakeJobTitle({
      jobType: "ecc",
      projectType: input.parsed.projectType,
    })
  );
}

function buildPermitJobNotes(permitRequest: ActivePermitRequestForMutation) {
  const lines = [
    `Created from permit request ${permitRequest.id}.`,
    permitRequest.internal_intake_note ? `Internal intake: ${permitRequest.internal_intake_note}` : null,
    permitRequest.contractor_note ? `Contractor note: ${permitRequest.contractor_note}` : null,
    permitRequest.service_address_text_snapshot
      ? `Original permit request address note: ${permitRequest.service_address_text_snapshot}`
      : null,
  ].filter(Boolean);

  return lines.join("\n").slice(0, 4000);
}

async function createRootJobForPermitRequest(admin: any, input: {
  permitRequest: ActivePermitRequestForMutation;
  customer: PermitJobCustomer;
  location: PermitJobLocation;
  contractorId: string;
  route: PermitPostPermitRoute;
  permitNumber: string;
  jurisdiction: string | null;
  permitDate: string | null;
  projectType: "alteration" | "all_new";
  billingRecipient: "contractor" | "customer";
  title: string;
}) {
  const jobOpsStatus = input.route === "pending_install" ? "on_hold" : "need_to_schedule";
  const jobNotes = buildPermitJobNotes(input.permitRequest);
  const { data: jobRow, error: jobInsertErr } = await admin
    .from("jobs")
    .insert({
      parent_job_id: null,
      service_case_id: null,
      job_type: "ecc",
      service_visit_type: null,
      service_visit_reason: null,
      service_visit_outcome: null,
      project_type: input.projectType,
      title: input.title,
      job_address: input.location.address_line1,
      city: input.location.city,
      scheduled_date: null,
      window_start: null,
      window_end: null,
      status: "open",
      lifecycle_state: "active",
      contractor_id: input.contractorId,
      billing_recipient: input.billingRecipient,
      permit_number: input.permitNumber,
      jurisdiction: input.jurisdiction,
      permit_date: input.permitDate,
      customer_id: input.customer.id,
      location_id: input.location.id,
      customer_first_name: input.customer.first_name,
      customer_last_name: input.customer.last_name,
      customer_email: input.customer.email,
      customer_phone: input.customer.phone,
      job_notes: jobNotes,
      visit_scope_summary: null,
      visit_scope_items: [],
      ops_status: jobOpsStatus,
      pending_info_reason: null,
      on_hold_reason: input.route === "pending_install" ? PENDING_INSTALL_REASON : null,
    })
    .select("id, customer_id, location_id, service_case_id, parent_job_id, title, job_notes, job_display_number")
    .single();

  if (jobInsertErr) throw jobInsertErr;

  const jobId = getTrimmedValue((jobRow as any)?.id, 120);
  if (!jobId) throw new Error("Job could not be created.");

  const { data: serviceCaseRow, error: serviceCaseErr } = await admin
    .from("service_cases")
    .insert({
      customer_id: input.customer.id,
      location_id: input.location.id,
      problem_summary: input.title || jobNotes || null,
      case_kind: "reactive",
      status: "open",
    })
    .select("id")
    .single();

  if (serviceCaseErr) throw serviceCaseErr;

  const serviceCaseId = getTrimmedValue((serviceCaseRow as any)?.id, 120);
  if (!serviceCaseId) throw new Error("Service case could not be created.");

  const { error: jobUpdateErr } = await admin
    .from("jobs")
    .update({ service_case_id: serviceCaseId })
    .eq("id", jobId);

  if (jobUpdateErr) throw jobUpdateErr;

  return {
    jobId,
    serviceCaseId,
    jobOpsStatus,
  };
}

async function requireInternalPermitMutationContext(input: {
  permitRequestId: string;
}) {
  if (!input.permitRequestId) {
    throw new Error("Permit request is required.");
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    userId,
    internalUser,
  } = await requireInternalUser({ supabase });
  assertPermitWorkflowEnabledForAccountOwner(internalUser.account_owner_user_id);

  await assertPermitRequestSchemaAvailable(admin);

  const permitRequest = await loadAccountScopedActivePermitRequest(admin, {
    permitRequestId: input.permitRequestId,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  return {
    admin,
    userId,
    accountOwnerUserId: internalUser.account_owner_user_id,
    permitRequest,
  };
}

function buildChangedPermitIntakeFields(
  current: ActivePermitRequestForMutation,
  next: ReturnType<typeof readPermitRequestIntakeInput>,
) {
  const checks: Array<[string, string | null, string | null]> = [
    ["request_label", current.request_label, next.requestLabel],
    ["customer_first_name_snapshot", current.customer_first_name_snapshot, next.customerFirstName],
    ["customer_last_name_snapshot", current.customer_last_name_snapshot, next.customerLastName],
    ["customer_email_snapshot", current.customer_email_snapshot, next.customerEmail],
    ["customer_phone_snapshot", current.customer_phone_snapshot, next.customerPhone],
    ["service_address_text_snapshot", current.service_address_text_snapshot, next.serviceAddressText],
    ["address_line2_snapshot", current.address_line2_snapshot, next.addressLine2],
    ["city_snapshot", current.city_snapshot, next.city],
    ["state_snapshot", current.state_snapshot, next.state],
    ["zip_snapshot", current.zip_snapshot, next.zip],
    ["jurisdiction", current.jurisdiction, next.jurisdiction],
    ["internal_intake_note", current.internal_intake_note, next.internalIntakeNote],
    ["contractor_note", current.contractor_note, next.contractorNote],
    ["permit_number", current.permit_number, next.permitNumber],
    ["permit_date", current.permit_date, next.permitDate],
  ];

  return checks
    .filter(([, before, after]) => String(before ?? "") !== String(after ?? ""))
    .map(([field]) => field);
}

export async function createInternalManualPermitRequest(
  input: FormData | InternalManualPermitRequestInput,
) {
  const parsed = readManualPermitRequestInput(input);
  if (!parsed.contractorId) {
    throw new Error("Select a contractor.");
  }

  if (!parsed.requestLabel && !parsed.intakeNote) {
    throw new Error("Add a short request label or intake note.");
  }
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    userId,
    internalUser,
  } = await requireInternalUser({ supabase });
  assertPermitWorkflowEnabledForAccountOwner(internalUser.account_owner_user_id);

  await assertPermitRequestSchemaAvailable(admin);

  const contractor = await loadAccountScopedContractor(admin, {
    contractorId: parsed.contractorId,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  if (!parsed.serviceAddressText || !parsed.city || !parsed.state || !parsed.zip) {
    throw new Error("Street address, city, state, and ZIP are required.");
  }

  const internalIntakeNote = buildManualPermitRequestNote(parsed);
  const { data: permitRequestRow, error: requestInsertErr } = await admin
    .from("permit_requests")
    .insert({
      account_owner_user_id: internalUser.account_owner_user_id,
      contractor_id: contractor.id,
      status: "permit_request",
      request_label: parsed.requestLabel,
      customer_first_name_snapshot: parsed.customerFirstName,
      customer_last_name_snapshot: parsed.customerLastName,
      customer_email_snapshot: parsed.customerEmail,
      customer_phone_snapshot: parsed.customerPhone,
      service_address_text_snapshot: parsed.serviceAddressText,
      address_line1_snapshot: parsed.serviceAddressText,
      address_line2_snapshot: parsed.addressLine2,
      city_snapshot: parsed.city,
      state_snapshot: parsed.state,
      zip_snapshot: parsed.zip,
      internal_intake_note: internalIntakeNote,
      jurisdiction: parsed.jurisdiction,
      submitted_by_user_id: userId,
    })
    .select("id")
    .single();

  if (requestInsertErr) throw requestInsertErr;

  const permitRequestId = String((permitRequestRow as { id?: unknown } | null)?.id ?? "").trim();
  if (!permitRequestId) throw new Error("Permit request could not be created.");

  const { error: eventInsertErr } = await admin
    .from("permit_request_events")
    .insert({
      account_owner_user_id: internalUser.account_owner_user_id,
      permit_request_id: permitRequestId,
      event_type: "permit_request_received",
      actor_user_id: userId,
      to_status: "permit_request",
      meta: {
        source: "internal_manual",
        contractor_id: contractor.id,
        contractor_name: contractor.name,
        request_label: parsed.requestLabel,
        note_snippet: buildNoteSnippet(parsed.intakeNote),
        customer_first_name: parsed.customerFirstName,
        customer_last_name: parsed.customerLastName,
        customer_email: parsed.customerEmail,
        customer_phone: parsed.customerPhone,
        service_address_text: parsed.serviceAddressText,
        address_line2: parsed.addressLine2,
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
        jurisdiction: parsed.jurisdiction,
      },
    });

  if (eventInsertErr) throw eventInsertErr;

  revalidatePath("/ops");

  return {
    permitRequestId,
  };
}

export async function acceptInternalPermitRequest(
  input: FormData | InternalPermitRequestStateActionInput,
) {
  const parsed = readPermitRequestStateActionInput(input);
  const context = await requireInternalPermitMutationContext({
    permitRequestId: parsed.permitRequestId,
  });

  if (context.permitRequest.status !== "permit_request") {
    throw new Error("Only new permit requests can be accepted.");
  }

  const acceptedAt = new Date().toISOString();
  const { error: updateErr } = await context.admin
    .from("permit_requests")
    .update({
      status: "accepted_in_process",
      accepted_by_user_id: context.userId,
      accepted_at: acceptedAt,
      hold_reason: null,
      on_hold_at: null,
    })
    .eq("id", context.permitRequest.id)
    .eq("account_owner_user_id", context.accountOwnerUserId);

  if (updateErr) throw updateErr;

  await insertPermitRequestTransitionEvent(context.admin, {
    accountOwnerUserId: context.accountOwnerUserId,
    permitRequestId: context.permitRequest.id,
    actorUserId: context.userId,
    eventType: "permit_request_accepted",
    fromStatus: context.permitRequest.status,
    toStatus: "accepted_in_process",
  });

  revalidatePath("/ops");

  return {
    permitRequestId: context.permitRequest.id,
    status: "accepted_in_process" as const,
  };
}

export async function holdInternalPermitRequest(
  input: FormData | InternalPermitRequestStateActionInput,
) {
  const parsed = readPermitRequestStateActionInput(input);
  const context = await requireInternalPermitMutationContext({
    permitRequestId: parsed.permitRequestId,
  });

  if (
    context.permitRequest.status !== "permit_request" &&
    context.permitRequest.status !== "accepted_in_process"
  ) {
    throw new Error("Only active permit requests can be put on hold.");
  }

  const onHoldAt = new Date().toISOString();
  const { error: updateErr } = await context.admin
    .from("permit_requests")
    .update({
      status: "on_hold_additional_info_needed",
      hold_reason: "additional_information_needed",
      on_hold_at: onHoldAt,
    })
    .eq("id", context.permitRequest.id)
    .eq("account_owner_user_id", context.accountOwnerUserId);

  if (updateErr) throw updateErr;

  await insertPermitRequestTransitionEvent(context.admin, {
    accountOwnerUserId: context.accountOwnerUserId,
    permitRequestId: context.permitRequest.id,
    actorUserId: context.userId,
    eventType: "permit_request_on_hold",
    fromStatus: context.permitRequest.status,
    toStatus: "on_hold_additional_info_needed",
    meta: {
      hold_reason: "additional_information_needed",
    },
  });

  revalidatePath("/ops");

  return {
    permitRequestId: context.permitRequest.id,
    status: "on_hold_additional_info_needed" as const,
  };
}

export async function resumeInternalPermitRequest(
  input: FormData | InternalPermitRequestStateActionInput,
) {
  const parsed = readPermitRequestStateActionInput(input);
  const context = await requireInternalPermitMutationContext({
    permitRequestId: parsed.permitRequestId,
  });

  if (context.permitRequest.status !== "on_hold_additional_info_needed") {
    throw new Error("Only on-hold permit requests can be resumed.");
  }

  const acceptedAt = context.permitRequest.accepted_at ?? new Date().toISOString();
  const acceptedByUserId = context.permitRequest.accepted_by_user_id ?? context.userId;
  const { error: updateErr } = await context.admin
    .from("permit_requests")
    .update({
      status: "accepted_in_process",
      accepted_by_user_id: acceptedByUserId,
      accepted_at: acceptedAt,
      hold_reason: null,
      on_hold_at: null,
    })
    .eq("id", context.permitRequest.id)
    .eq("account_owner_user_id", context.accountOwnerUserId);

  if (updateErr) throw updateErr;

  await insertPermitRequestTransitionEvent(context.admin, {
    accountOwnerUserId: context.accountOwnerUserId,
    permitRequestId: context.permitRequest.id,
    actorUserId: context.userId,
    eventType: "permit_request_accepted",
    fromStatus: context.permitRequest.status,
    toStatus: "accepted_in_process",
    meta: {
      transition: "resume_from_hold",
    },
  });

  revalidatePath("/ops");

  return {
    permitRequestId: context.permitRequest.id,
    status: "accepted_in_process" as const,
  };
}

export async function markInternalPermitRequestNotNeeded(
  input: FormData | InternalMarkPermitRequestNotNeededInput,
) {
  const parsed = readMarkPermitRequestNotNeededInput(input);
  if (!parsed.reason) {
    throw new Error("Add a reason before marking the permit request not needed.");
  }

  const context = await requireInternalPermitMutationContext({
    permitRequestId: parsed.permitRequestId,
  });
  const completedAt = new Date().toISOString();
  const { error: updateErr } = await context.admin
    .from("permit_requests")
    .update({
      status: "not_needed",
      hold_reason: null,
      on_hold_at: null,
      completed_by_user_id: context.userId,
      completed_at: completedAt,
    })
    .eq("id", context.permitRequest.id)
    .eq("account_owner_user_id", context.accountOwnerUserId);

  if (updateErr) throw updateErr;

  await insertPermitRequestTransitionEvent(context.admin, {
    accountOwnerUserId: context.accountOwnerUserId,
    permitRequestId: context.permitRequest.id,
    actorUserId: context.userId,
    eventType: "permit_request_not_needed",
    fromStatus: context.permitRequest.status,
    toStatus: "not_needed",
    jobId: context.permitRequest.job_id,
    serviceCaseId: context.permitRequest.service_case_id,
    meta: {
      reason: parsed.reason,
    },
  });

  revalidatePath("/ops");

  return {
    permitRequestId: context.permitRequest.id,
    status: "not_needed" as const,
  };
}

export async function updateInternalPermitRequestIntake(
  input: FormData | InternalPermitRequestIntakeInput,
) {
  const parsed = readPermitRequestIntakeInput(input);
  const context = await requireInternalPermitMutationContext({
    permitRequestId: parsed.permitRequestId,
  });

  const updatePayload = {
    request_label: parsed.requestLabel,
    customer_first_name_snapshot: parsed.customerFirstName,
    customer_last_name_snapshot: parsed.customerLastName,
    customer_email_snapshot: parsed.customerEmail,
    customer_phone_snapshot: parsed.customerPhone,
    service_address_text_snapshot: parsed.serviceAddressText,
    address_line1_snapshot: parsed.serviceAddressText,
    address_line2_snapshot: parsed.addressLine2,
    city_snapshot: parsed.city,
    state_snapshot: parsed.state,
    zip_snapshot: parsed.zip,
    jurisdiction: parsed.jurisdiction,
    internal_intake_note: parsed.internalIntakeNote,
    contractor_note: parsed.contractorNote,
    permit_number: parsed.permitNumber,
    permit_date: parsed.permitDate,
  };
  const changedFields = buildChangedPermitIntakeFields(context.permitRequest, parsed);

  const { error: updateErr } = await context.admin
    .from("permit_requests")
    .update(updatePayload)
    .eq("id", context.permitRequest.id)
    .eq("account_owner_user_id", context.accountOwnerUserId);

  if (updateErr) throw updateErr;

  const { error: eventErr } = await context.admin
    .from("permit_request_events")
    .insert({
      account_owner_user_id: context.accountOwnerUserId,
      permit_request_id: context.permitRequest.id,
      event_type: "permit_request_intake_updated",
      actor_user_id: context.userId,
      from_status: context.permitRequest.status,
      to_status: context.permitRequest.status,
      meta: {
        source: "internal_ops",
        changed_fields: changedFields,
      },
    });

  if (eventErr) throw eventErr;

  revalidatePath("/ops");

  return {
    permitRequestId: context.permitRequest.id,
    status: context.permitRequest.status,
    changedFields,
  };
}

export async function markInternalPermitCreated(
  input: FormData | InternalMarkPermitCreatedInput,
) {
  const parsed = readMarkPermitCreatedInput(input);
  const context = await requireInternalPermitMutationContext({
    permitRequestId: parsed.permitRequestId,
  });

  if (!isPermitPostPermitRoute(parsed.postPermitRoute)) {
    throw new Error("Choose what happens after the permit is created.");
  }

  if (!parsed.permitNumber) {
    throw new Error("Permit number is required.");
  }

  const linkedJob = await loadLinkedPermitJobForMutation(context.admin, {
    permitRequest: context.permitRequest,
    accountOwnerUserId: context.accountOwnerUserId,
  });

  assertLinkedJobCanReceivePermitRoute({
    job: linkedJob,
    route: parsed.postPermitRoute,
  });

  const completedAt = new Date().toISOString();
  const jobOpsStatusBefore = linkedJob.ops_status ?? null;
  const jobUpdatePayload = buildLinkedJobUpdatePayload({
    job: linkedJob,
    route: parsed.postPermitRoute,
    permitNumber: parsed.permitNumber,
    jurisdiction: parsed.jurisdiction,
    permitDate: parsed.permitDate,
  });
  const jobOpsStatusAfter =
    typeof jobUpdatePayload.ops_status === "string"
      ? jobUpdatePayload.ops_status
      : jobOpsStatusBefore;
  const serviceCaseId = context.permitRequest.service_case_id ?? linkedJob.service_case_id ?? null;

  const { error: permitUpdateErr } = await context.admin
    .from("permit_requests")
    .update({
      status: "permit_created",
      post_permit_route: parsed.postPermitRoute,
      permit_number: parsed.permitNumber,
      jurisdiction: parsed.jurisdiction,
      permit_date: parsed.permitDate,
      completed_by_user_id: context.userId,
      completed_at: completedAt,
    })
    .eq("id", context.permitRequest.id)
    .eq("account_owner_user_id", context.accountOwnerUserId);

  if (permitUpdateErr) throw permitUpdateErr;

  const { error: jobUpdateErr } = await context.admin
    .from("jobs")
    .update(jobUpdatePayload)
    .eq("id", linkedJob.id)
    .is("deleted_at", null);

  if (jobUpdateErr) throw jobUpdateErr;

  const terminalMeta = {
    permit_number: parsed.permitNumber,
    jurisdiction: parsed.jurisdiction,
    permit_date: parsed.permitDate,
    job_ops_status_before: jobOpsStatusBefore,
    job_ops_status_after: jobOpsStatusAfter,
  };

  await insertPermitRequestTransitionEvent(context.admin, {
    accountOwnerUserId: context.accountOwnerUserId,
    permitRequestId: context.permitRequest.id,
    actorUserId: context.userId,
    eventType: "permit_created",
    fromStatus: context.permitRequest.status,
    toStatus: "permit_created",
    postPermitRoute: parsed.postPermitRoute,
    jobId: linkedJob.id,
    serviceCaseId,
    meta: terminalMeta,
  });

  await insertPermitRequestTransitionEvent(context.admin, {
    accountOwnerUserId: context.accountOwnerUserId,
    permitRequestId: context.permitRequest.id,
    actorUserId: context.userId,
    eventType: parsed.postPermitRoute === "ready_for_testing"
      ? "permit_ready_for_testing"
      : "permit_pending_install",
    fromStatus: context.permitRequest.status,
    toStatus: "permit_created",
    postPermitRoute: parsed.postPermitRoute,
    jobId: linkedJob.id,
    serviceCaseId,
    meta: terminalMeta,
  });

  await insertLinkedJobPermitCreatedEvent(context.admin, {
    jobId: linkedJob.id,
    actorUserId: context.userId,
    permitRequestId: context.permitRequest.id,
    postPermitRoute: parsed.postPermitRoute,
    permitNumber: parsed.permitNumber,
    jurisdiction: parsed.jurisdiction,
    permitDate: parsed.permitDate,
    jobOpsStatusBefore,
    jobOpsStatusAfter,
  });

  revalidatePath("/ops");
  revalidatePath(`/jobs/${linkedJob.id}`);

  return {
    permitRequestId: context.permitRequest.id,
    status: "permit_created" as const,
    postPermitRoute: parsed.postPermitRoute,
    jobId: linkedJob.id,
    jobOpsStatusBefore,
    jobOpsStatusAfter,
  };
}

export async function createJobFromPermitRequestAndMarkCreated(
  input: FormData | InternalCreateJobFromPermitRequestInput,
) {
  const parsed = readCreateJobFromPermitRequestInput(input);
  const context = await requireInternalPermitMutationContext({
    permitRequestId: parsed.permitRequestId,
  });

  if (!isPermitPostPermitRoute(parsed.postPermitRoute)) {
    throw new Error("Choose what happens after the permit is created.");
  }

  if (!parsed.permitNumber) {
    throw new Error("Permit number is required.");
  }

  if (context.permitRequest.job_id) {
    throw new Error("This permit request is already linked to a job.");
  }

  const contractor = await loadAccountScopedContractor(context.admin, {
    contractorId: context.permitRequest.contractor_id,
    accountOwnerUserId: context.accountOwnerUserId,
  });
  const customerLocation = await resolvePermitJobCustomerLocation(context.admin, {
    parsed,
    accountOwnerUserId: context.accountOwnerUserId,
  });

  const completedAt = new Date().toISOString();
  const jobTitle = buildPermitJobTitle({
    parsed,
  });
  const createdJob = await createRootJobForPermitRequest(context.admin, {
    permitRequest: context.permitRequest,
    customer: customerLocation.customer,
    location: customerLocation.location,
    contractorId: contractor.id,
    route: parsed.postPermitRoute,
    permitNumber: parsed.permitNumber,
    jurisdiction: parsed.jurisdiction,
    permitDate: parsed.permitDate,
    projectType: parsed.projectType,
    billingRecipient: parsed.billingRecipient,
    title: jobTitle,
  });

  const { error: permitUpdateErr } = await context.admin
    .from("permit_requests")
    .update({
      job_id: createdJob.jobId,
      service_case_id: createdJob.serviceCaseId,
      status: "permit_created",
      post_permit_route: parsed.postPermitRoute,
      permit_number: parsed.permitNumber,
      jurisdiction: parsed.jurisdiction,
      permit_date: parsed.permitDate,
      completed_by_user_id: context.userId,
      completed_at: completedAt,
    })
    .eq("id", context.permitRequest.id)
    .eq("account_owner_user_id", context.accountOwnerUserId);

  if (permitUpdateErr) throw permitUpdateErr;

  const terminalMeta = {
    permit_number: parsed.permitNumber,
    jurisdiction: parsed.jurisdiction,
    permit_date: parsed.permitDate,
    job_ops_status_before: null,
    job_ops_status_after: createdJob.jobOpsStatus,
    created_job_id: createdJob.jobId,
    customer_location_mode: customerLocation.mode,
    project_type: parsed.projectType,
    billing_recipient: parsed.billingRecipient,
    source_action: "create_job_from_permit_request_and_mark_created",
  };

  await insertPermitRequestTransitionEvent(context.admin, {
    accountOwnerUserId: context.accountOwnerUserId,
    permitRequestId: context.permitRequest.id,
    actorUserId: context.userId,
    eventType: "permit_created",
    fromStatus: context.permitRequest.status,
    toStatus: "permit_created",
    postPermitRoute: parsed.postPermitRoute,
    jobId: createdJob.jobId,
    serviceCaseId: createdJob.serviceCaseId,
    meta: terminalMeta,
  });

  await insertPermitRequestTransitionEvent(context.admin, {
    accountOwnerUserId: context.accountOwnerUserId,
    permitRequestId: context.permitRequest.id,
    actorUserId: context.userId,
    eventType: parsed.postPermitRoute === "ready_for_testing"
      ? "permit_ready_for_testing"
      : "permit_pending_install",
    fromStatus: context.permitRequest.status,
    toStatus: "permit_created",
    postPermitRoute: parsed.postPermitRoute,
    jobId: createdJob.jobId,
    serviceCaseId: createdJob.serviceCaseId,
    meta: terminalMeta,
  });

  await insertLinkedJobPermitCreatedEvent(context.admin, {
    jobId: createdJob.jobId,
    actorUserId: context.userId,
    permitRequestId: context.permitRequest.id,
    postPermitRoute: parsed.postPermitRoute,
    permitNumber: parsed.permitNumber,
    jurisdiction: parsed.jurisdiction,
    permitDate: parsed.permitDate,
    jobOpsStatusBefore: null,
    jobOpsStatusAfter: createdJob.jobOpsStatus,
    sourceAction: "create_job_from_permit_request_and_mark_created",
    createdJobId: createdJob.jobId,
    customerLocationMode: customerLocation.mode,
  });

  revalidatePath("/ops");
  revalidatePath(`/jobs/${createdJob.jobId}`);

  return {
    permitRequestId: context.permitRequest.id,
    status: "permit_created" as const,
    postPermitRoute: parsed.postPermitRoute,
    jobId: createdJob.jobId,
    serviceCaseId: createdJob.serviceCaseId,
    jobOpsStatusAfter: createdJob.jobOpsStatus,
    customerLocationMode: customerLocation.mode,
  };
}
