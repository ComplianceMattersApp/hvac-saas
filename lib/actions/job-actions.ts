//lib/actions/job-actions

"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { deriveScheduleAndOps } from "@/lib/utils/scheduling";
import { findOrCreateCustomer } from "@/lib/customers/findOrCreateCustomer";
import { evaluateEccOpsStatus } from "@/lib/actions/ecc-status";
import { releasePendingInfoAndRecompute } from "@/lib/actions/job-ops-actions";
import { buildMovementEventMeta, buildStaffingSnapshotMeta } from "@/lib/actions/job-event-meta";
import { insertInternalNotificationForEvent } from "@/lib/actions/notification-actions";
import { resolveCanonicalOwner } from "@/lib/auth/canonical-owner";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { renderSystemEmailLayout, escapeHtml } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/sendEmail";
import { assertAssignableInternalUser } from "@/lib/staffing/human-layer";
import type { JobStatus } from "@/lib/types/job";
import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";

export type { JobStatus } from "@/lib/types/job";

type CreateJobInput = {
  ops_status?: string | null;
  parent_job_id?: string | null;
  service_case_id?: string | null;
  job_type?: string | null;
  customer_id?: string | null;
  location_id?: string | null;
  project_type?: string | null;
  title: string;
  city: string;
  scheduled_date: string | null;
  status: JobStatus;
  contractor_id?: string | null;
  permit_number?: string | null;
  jurisdiction?: string | null;
  permit_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  customer_phone?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_email?: string | null;
  job_notes?: string | null;
  job_address?: string | null;
  billing_recipient?: "contractor" | "customer" | "other" | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  
  };

async function cleanupOrphanSystem(opts: {
  supabase: any;
  jobId: string;
  systemId: string;
}) {
  const { supabase, jobId, systemId } = opts;
  if (!systemId) return;

  // any equipment left on this system?
  const { count: eqCount, error: eqErr } = await supabase
    .from("job_equipment")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("system_id", systemId);

  if (eqErr) throw eqErr;

  // any test runs left on this system?
  const { count: trCount, error: trErr } = await supabase
    .from("ecc_test_runs")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("system_id", systemId);

  if (trErr) throw trErr;

  // orphan rule
  if ((eqCount ?? 0) === 0 && (trCount ?? 0) === 0) {
    const { error: delSysErr } = await supabase
      .from("job_systems")
      .delete()
      .eq("job_id", jobId)
      .eq("id", systemId);

    if (delSysErr) throw delSysErr;
  }
}

async function applyRetestResolution(params: {
  supabase: any;
  childJobId: string;
  parentJobId: string;
  childOpsBefore: string | null;
  childOpsAfter: string | null;
}) {
  const { supabase, childJobId, parentJobId, childOpsBefore, childOpsAfter } = params;

  // Only act on transitions into terminal ECC outcomes
  const becamePassed =
    childOpsAfter === "paperwork_required" && childOpsBefore !== "paperwork_required";
  const becameFailed =
    childOpsAfter === "failed" && childOpsBefore !== "failed";

  if (!becamePassed && !becameFailed) return;

  if (becamePassed) {
    // Child event
    await insertJobEvent({
      supabase,
      jobId: childJobId,
      event_type: "job_passed",
      meta: { via: "ecc_evaluate" },
    });

    // Parent breadcrumb
    await insertJobEvent({
      supabase,
      jobId: parentJobId,
      event_type: "retest_passed",
      meta: { child_job_id: childJobId },
    });

    const { data: parent, error: parentErr } = await supabase
      .from("jobs")
      .select("ops_status")
      .eq("id", parentJobId)
      .maybeSingle();

    if (parentErr) throw parentErr;

    const parentOps = String(parent?.ops_status ?? "").trim() || null;

    // Resolve parent out of failure workflow, but do NOT auto-close
    if (parentOps === "failed" || parentOps === "retest_needed") {
      const { error: updErr } = await supabase
        .from("jobs")
        .update({ ops_status: "paperwork_required" })
        .eq("id", parentJobId);

      if (updErr) throw updErr;
      

      await insertJobEvent({
        supabase,
        jobId: parentJobId,
        event_type: "status_changed",
        meta: {
          from: parentOps,
          to: "paperwork_required",
          reason: "retest_passed",
        },
      });
    }
  }

  if (becameFailed) {
    // Child event
    await insertJobEvent({
      supabase,
      jobId: childJobId,
      event_type: "job_failed",
      meta: { via: "ecc_evaluate" },
    });

    // Parent breadcrumb (no parent status change)
    await insertJobEvent({
      supabase,
      jobId: parentJobId,
      event_type: "retest_failed",
      meta: { child_job_id: childJobId },
    });
  }
}

async function insertJobEvent(params: {
  supabase: any;
  jobId: string;
  event_type: string;
  meta?: Record<string, any> | null;
  userId?: string | null;
}) {
  const { supabase, jobId, event_type } = params;
  const meta = params.meta ?? null;
  const userId = params.userId ?? null;

  const { error } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type,
    meta,
    user_id: userId,
  });

  if (error) throw error;
}

function toTitleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatServiceAddress(job: any) {
  const loc = Array.isArray(job?.locations)
    ? job.locations.find((x: any) => x) ?? null
    : job?.locations ?? null;

  const line1 = String(loc?.address_line1 ?? "").trim() || String(job?.job_address ?? "").trim();
  const line2 = String(loc?.address_line2 ?? "").trim();
  const city = String(loc?.city ?? "").trim() || String(job?.city ?? "").trim();
  const state = String(loc?.state ?? "").trim();
  const zip = String(loc?.zip ?? "").trim();

  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [line1, line2, cityStateZip].filter(Boolean).join(", ");
}

function buildCustomerScheduledEmailHtml(args: {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string;
  serviceAddress: string;
  scheduledDate: string;
  scheduledWindow: string;
  serviceType: string | null;
}) {
  const details: string[] = [
    `<li><strong>Customer:</strong> ${escapeHtml(args.customerName)}</li>`,
    `<li><strong>Service Address:</strong> ${escapeHtml(args.serviceAddress)}</li>`,
    `<li><strong>Scheduled Date:</strong> ${escapeHtml(args.scheduledDate)}</li>`,
    `<li><strong>Time Window:</strong> ${escapeHtml(args.scheduledWindow)}</li>`,
  ];

  if (args.serviceType) {
    details.push(`<li><strong>Service Type:</strong> ${escapeHtml(args.serviceType)}</li>`);
  }

  details.push(`<li><strong>Customer Email:</strong> ${escapeHtml(args.customerEmail)}</li>`);

  if (args.customerPhone) {
    details.push(`<li><strong>Customer Phone:</strong> ${escapeHtml(args.customerPhone)}</li>`);
  }

  return renderSystemEmailLayout({
    title: "Your Job Is Scheduled",
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Your upcoming service has been scheduled.</p>
      <ul style="margin: 0 0 12px 20px; padding: 0;">${details.join("")}</ul>
      <p style="margin: 0 0 12px 0;">Please ensure someone 18+ can provide access to the service location during the scheduled time window.</p>
      <p style="margin: 0;">If you need to make changes, please contact us as soon as possible.</p>
    `,
  });
}

async function sendCustomerScheduledEmailForJob({
  supabase,
  jobId,
}: {
  supabase: any;
  jobId: string;
}): Promise<void> {
  console.log("[CUSTOMER SCHEDULE EMAIL DEBUG] helper start", { jobId });

  const { data: scheduledJob, error: scheduledJobErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      job_type,
      customer_first_name,
      customer_last_name,
      customer_phone,
      customer_email,
      job_address,
      city,
      scheduled_date,
      window_start,
      window_end,
      locations:location_id (address_line1, address_line2, city, state, zip)
      `
    )
    .eq("id", jobId)
    .single();

  if (scheduledJobErr) {
    console.error("[CUSTOMER SCHEDULE EMAIL DEBUG] job snapshot query failed", { jobId, error: scheduledJobErr });
    return;
  }

  const customerEmail = String(scheduledJob?.customer_email ?? "").trim().toLowerCase();
  if (!customerEmail) {
    console.log("[CUSTOMER SCHEDULE EMAIL DEBUG] skipping — no customer_email on job", { jobId, customer_email: scheduledJob?.customer_email ?? null });
    return;
  }

  const customerName =
    [
      String(scheduledJob?.customer_first_name ?? "").trim(),
      String(scheduledJob?.customer_last_name ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" ") || "Customer";

  const customerPhone = String(scheduledJob?.customer_phone ?? "").trim() || null;
  const serviceAddress = formatServiceAddress(scheduledJob) || "Address not available";
  const scheduledDateText = formatBusinessDateUS(String(scheduledJob?.scheduled_date ?? "").trim()) || "Not available";
  const scheduledWindowText =
    displayWindowLA(
      String(scheduledJob?.window_start ?? "").trim() || null,
      String(scheduledJob?.window_end ?? "").trim() || null,
    ) || "Not available";

  const serviceTypeRaw = String(scheduledJob?.job_type ?? "").trim();
  const serviceType = serviceTypeRaw ? toTitleCase(serviceTypeRaw) : null;
  const subjectDate = scheduledDateText && scheduledDateText !== "Not available"
    ? scheduledDateText
    : "Date TBD";
  const subject = `Job Scheduled \u2013 ${customerName} \u2013 ${subjectDate}`;

  console.log("[CUSTOMER SCHEDULE EMAIL DEBUG] pre-send payload", {
    jobId,
    to: customerEmail,
    subject,
    customerName,
    customerPhone,
    serviceAddress,
    scheduledDate: scheduledDateText,
    scheduledWindow: scheduledWindowText,
    serviceType,
  });

  try {
    const result = await sendEmail({
      to: customerEmail,
      subject,
      html: buildCustomerScheduledEmailHtml({
        customerName,
        customerPhone,
        customerEmail,
        serviceAddress,
        scheduledDate: scheduledDateText,
        scheduledWindow: scheduledWindowText,
        serviceType,
      }),
    });
    console.log("[CUSTOMER SCHEDULE EMAIL DEBUG] sendEmail result", { jobId, result });
  } catch (error) {
    console.error("[CUSTOMER SCHEDULE EMAIL DEBUG] sendEmail threw", {
      jobId,
      customerEmail,
      error: error instanceof Error ? error.message : "Unknown send error",
    });
  }
}

// ---------------------------------------------------------------------------
// PH2-B: Staffing helpers — job_assignments table
// All helpers are unexported; wire into server actions directly.
// Structure is intentionally extract-ready: no external dependencies,
// uniform (supabase, ...) signature pattern, self-contained error handling.
// ---------------------------------------------------------------------------

type JobAssignment = {
  id: string;
  job_id: string;
  user_id: string;
  assigned_by: string | null;
  is_active: boolean;
  is_primary: boolean;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
};

/** Returns all currently-active assignment rows for a job. */
async function listActiveJobAssignments(params: {
  supabase: any;
  jobId: string;
}): Promise<JobAssignment[]> {
  const { supabase, jobId } = params;

  const { data, error } = await supabase
    .from("job_assignments")
    .select(
      "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
    )
    .eq("job_id", jobId)
    .eq("is_active", true);

  if (error) throw error;
  return (data ?? []) as JobAssignment[];
}

/**
 * Inserts a new active assignment row.
 * Throws on duplicate active assignment for the same (job_id, user_id) —
 * use ensureActiveAssignmentForUser for the idempotent path.
 * Emits assignment_added on actual insert.
 */
async function addJobAssignment(params: {
  supabase: any;
  jobId: string;
  userId: string;
  assignedBy: string;
  isPrimary?: boolean;
}): Promise<JobAssignment> {
  const { supabase, jobId, userId, assignedBy, isPrimary = false } = params;

  await assertAssignableInternalUser({
    supabase,
    userId,
  });

  const { data, error } = await supabase
    .from("job_assignments")
    .insert({
      job_id: jobId,
      user_id: userId,
      assigned_by: assignedBy,
      is_active: true,
      is_primary: isPrimary,
    })
    .select(
      "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
    )
    .single();

  if (error) throw error;

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "assignment_added",
    meta: {
      actor_user_id: assignedBy,
      affected_user_id: userId,
      is_primary: isPrimary,
      staffing_snapshot: buildStaffingSnapshotMeta(),
      source_action: "add_job_assignment",
    },
    userId: assignedBy,
  });

  return data as JobAssignment;
}

/**
 * Soft-removes an active assignment.
 * Sets is_active = false, removed_at = now(), removed_by = actor.
 * Targets only active rows; no-ops (no event) if the user is already inactive.
 * Emits assignment_removed only on actual row change.
 */
async function softRemoveJobAssignment(params: {
  supabase: any;
  jobId: string;
  userId: string;
  removedBy: string;
}): Promise<void> {
  const { supabase, jobId, userId, removedBy } = params;

  const { data: removed, error } = await supabase
    .from("job_assignments")
    .update({
      is_active: false,
      removed_at: new Date().toISOString(),
      removed_by: removedBy,
    })
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .select("id");

  if (error) throw error;

  // Zero rows updated = user was already inactive; skip event to avoid duplicate
  if (!removed || removed.length === 0) return;

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "assignment_removed",
    meta: {
      actor_user_id: removedBy,
      affected_user_id: userId,
      staffing_snapshot: buildStaffingSnapshotMeta(),
      source_action: "soft_remove_job_assignment",
    },
    userId: removedBy,
  });
}

/**
 * Makes userId the sole primary assignment on the job.
 * Verifies the target has an active row before acting (hardening).
 * No-ops (and emits no event) if the target is already primary.
 * Clears is_primary on all other active rows first, then sets the target.
 * Only acts on active rows; does NOT activate an inactive assignment.
 * Emits assignment_primary_set on actual change only.
 */
async function setPrimaryJobAssignment(params: {
  supabase: any;
  jobId: string;
  userId: string;
  actorUserId: string;
}): Promise<void> {
  const { supabase, jobId, userId, actorUserId } = params;

  // Hardening: verify the target user has an active assignment.
  // Also detect no-op: if already primary, skip everything.
  const { data: targetRow, error: readErr } = await supabase
    .from("job_assignments")
    .select("id, is_primary")
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (readErr) throw readErr;

  if (!targetRow) {
    throw new Error(
      `Cannot set primary: no active assignment found for user ${userId} on job ${jobId}`
    );
  }

  // Already primary — no change, no event
  if (targetRow.is_primary) return;

  // Clear existing primary on all active rows for this job
  const { error: clearErr } = await supabase
    .from("job_assignments")
    .update({ is_primary: false })
    .eq("job_id", jobId)
    .eq("is_active", true)
    .eq("is_primary", true);

  if (clearErr) throw clearErr;

  // Promote the target user
  const { error: setErr } = await supabase
    .from("job_assignments")
    .update({ is_primary: true })
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .eq("is_active", true);

  if (setErr) throw setErr;

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "assignment_primary_set",
    meta: {
      actor_user_id: actorUserId,
      affected_user_id: userId,
      staffing_snapshot: buildStaffingSnapshotMeta(),
      source_action: "set_primary_job_assignment",
    },
    userId: actorUserId,
  });
}

/**
 * Returns the existing active assignment for userId, or creates one.
 * Concurrency-safe: on a 23505 unique-violation (parallel insert race),
 * re-selects and returns the surviving active row instead of throwing.
 */
async function ensureActiveAssignmentForUser(params: {
  supabase: any;
  jobId: string;
  userId: string;
  actorUserId: string;
}): Promise<JobAssignment> {
  const { supabase, jobId, userId, actorUserId } = params;

  // Fast path: active row already exists
  const { data: existing, error: selectErr } = await supabase
    .from("job_assignments")
    .select(
      "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
    )
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (selectErr) throw selectErr;
  if (existing) return existing as JobAssignment;

  // Slow path: create via addJobAssignment so assignment_added fires.
  // On 23505 unique-violation (parallel insert race), the winning call already
  // emitted assignment_added — re-select the surviving row without re-emitting.
  try {
    return await addJobAssignment({
      supabase,
      jobId,
      userId,
      assignedBy: actorUserId,
      isPrimary: false,
    });
  } catch (addErr: any) {
    if (addErr?.code === "23505") {
      const { data: raced, error: racedErr } = await supabase
        .from("job_assignments")
        .select(
          "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
        )
        .eq("job_id", jobId)
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (racedErr) throw racedErr;
      if (!raced) {
        throw new Error(
          "Concurrent assignment insert detected but no active row found after race"
        );
      }
      return raced as JobAssignment;
    }
    throw addErr;
  }
}

/** Returns the current primary active assignment, or null if none is set. */
async function getPrimaryActiveAssignment(params: {
  supabase: any;
  jobId: string;
}): Promise<JobAssignment | null> {
  const { supabase, jobId } = params;

  const { data, error } = await supabase
    .from("job_assignments")
    .select(
      "id, job_id, user_id, assigned_by, is_active, is_primary, created_at, removed_at, removed_by"
    )
    .eq("job_id", jobId)
    .eq("is_active", true)
    .eq("is_primary", true)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as JobAssignment | null;
}

// ---------------------------------------------------------------------------


type OpsSnapshot = {
  ops_status: string | null;
  pending_info_reason: string | null;
  follow_up_date: string | null; // keep as string for diffing
  next_action_note: string | null;
  action_required_by: string | null;
};

  function buildInitialProblemSummary(input: {
  job_notes?: string | null;
  title?: string | null;
}) {
  const notes = String(input.job_notes ?? "").trim();
  if (notes) return notes;

  const title = String(input.title ?? "").trim();
  if (title) return title;

  return null;
}

async function createServiceCaseForRootJob(params: {
  supabase: any;
  customerId: string;
  locationId: string;
  problemSummary?: string | null;
}) {
  const { supabase, customerId, locationId, problemSummary } = params;

  const { data, error } = await supabase
    .from("service_cases")
    .insert({
      customer_id: customerId,
      location_id: locationId,
      problem_summary: problemSummary ?? null,
      status: "open",
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Failed to create service case");

  return String(data.id);
}

async function ensureServiceCaseForJob(params: {
  supabase: any;
  jobId: string;
}) {
  const { supabase, jobId } = params;

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, customer_id, location_id, service_case_id, job_notes, title")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job?.id) throw new Error("Job not found while ensuring service case");

  if (job.service_case_id) {
    return String(job.service_case_id);
  }

  if (!job.customer_id || !job.location_id) {
    throw new Error("Cannot create service case: job missing customer_id or location_id");
  }

  const serviceCaseId = await createServiceCaseForRootJob({
    supabase,
    customerId: String(job.customer_id),
    locationId: String(job.location_id),
    problemSummary: buildInitialProblemSummary({
      job_notes: job.job_notes,
      title: job.title,
    }),
  });

  const { error: updErr } = await supabase
    .from("jobs")
    .update({ service_case_id: serviceCaseId })
    .eq("id", jobId);

  if (updErr) throw updErr;

  return serviceCaseId;
}

async function resolveServiceCaseIdForNewJob(params: {
  supabase: any;
  parentJobId?: string | null;
  customerId?: string | null;
  locationId?: string | null;
  title?: string | null;
  jobNotes?: string | null;
}) {
  const {
    supabase,
    parentJobId,
    customerId,
    locationId,
    title,
    jobNotes,
  } = params;

  const parentId = String(parentJobId ?? "").trim();

  // Child job path: inherit from parent
  if (parentId) {
    const { data: parent, error: parentErr } = await supabase
      .from("jobs")
      .select("id, service_case_id")
      .eq("id", parentId)
      .maybeSingle();

    if (parentErr) throw parentErr;
    if (!parent?.id) throw new Error("Parent job not found");

    if (parent.service_case_id) {
      return String(parent.service_case_id);
    }

    // Repair path during rollout/backfill transition
    return await ensureServiceCaseForJob({
      supabase,
      jobId: parentId,
    });
  }

  // Root job path: no service_case_id yet; create after job insert
  if (!customerId || !locationId) {
    throw new Error("Cannot resolve root service case without customer_id and location_id");
  }

  return await createServiceCaseForRootJob({
    supabase,
    customerId,
    locationId,
    problemSummary: buildInitialProblemSummary({
      job_notes: jobNotes,
      title,
    }),
  });
}

function buildOpsChanges(before: OpsSnapshot, after: OpsSnapshot) {
  const keys = Object.keys(after) as (keyof OpsSnapshot)[];
  const changes: Array<{ field: keyof OpsSnapshot; from: any; to: any }> = [];

  for (const k of keys) {
    const from = before[k] ?? null;
    const to = after[k] ?? null;
    if (from !== to) changes.push({ field: k, from, to });
  }

  return changes;
}

/** ✅ Single source of truth for redirects back to /tests (NEVER writes s= when empty) */
function redirectToTests(opts: {
  jobId: string;
  testType?: string | null;
  systemId?: string | null;
}) {
  const { jobId } = opts;
  const testType = String(opts.testType ?? "").trim();
  const systemId = String(opts.systemId ?? "").trim();

  const q = new URLSearchParams();
  if (testType) q.set("t", testType);
  if (systemId) q.set("s", systemId);

  const qs = q.toString();
  redirect(qs ? `/jobs/${jobId}/tests?${qs}` : `/jobs/${jobId}/tests`);
}

/** ✅ Defensive resolver: if form is missing system_id, fall back to run.system_id */
async function resolveSystemIdForRun(params: {
  supabase: any;
  jobId: string;
  testRunId: string;
  systemIdFromForm?: string | null;
}): Promise<string | null> {
  const fromForm = String(params.systemIdFromForm ?? "").trim();
  if (fromForm) return fromForm;

  const { data, error } = await params.supabase
    .from("ecc_test_runs")
    .select("system_id")
    .eq("id", params.testRunId)
    .eq("job_id", params.jobId)
    .maybeSingle();

  if (error) throw error;

  const fromRun = String(data?.system_id ?? "").trim();
  return fromRun || null;
}

export async function updateJobTypeFromForm(formData: FormData) {
  const supabase = await createClient();

  const jobId = String(formData.get("job_id") ?? "").trim();
  const rawType = String(formData.get("job_type") ?? "").trim().toLowerCase();

  if (!jobId) {
    throw new Error("Missing job_id");
  }

  const allowed = ["ecc", "service"];

  if (!allowed.includes(rawType)) {
    throw new Error("Invalid job type");
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      job_type: rawType,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error("Job type update failed", error);
    throw new Error("Unable to update job type");
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
}

export async function getContractors() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contractors")
    .select("id, name, phone, email")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function notifyInternalNextActionChanged(params: {
  supabase: any;
  jobId: string;
  eventType: string;
  meta?: Record<string, any> | null;
}) {
  const { jobId } = params;
  return { jobId };
}

export async function requestRetestReadyFromPortal(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  if (!jobId) throw new Error("Missing job_id");

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
  if (!user) redirect("/login");

  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (cuErr) throw cuErr;
  if (!cu?.contractor_id) {
    throw new Error("Only contractor users can request retest readiness.");
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, contractor_id, ops_status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job?.id) throw new Error("Job not found.");

  if (String(job.contractor_id ?? "") !== String(cu.contractor_id ?? "")) {
    throw new Error("You do not have access to this job.");
  }

  if (String(job.ops_status ?? "").toLowerCase() !== "failed") {
    redirect(`/portal/jobs/${jobId}`);
  }

  const { data: openRetestChild, error: childErr } = await supabase
    .from("jobs")
    .select("id, ops_status")
    .eq("parent_job_id", jobId)
    .is("deleted_at", null)
    .neq("ops_status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (childErr) throw childErr;
  if (openRetestChild?.id) {
    redirect(`/portal/jobs/${jobId}`);
  }

  const { data: existingRequest, error: reqErr } = await supabase
    .from("job_events")
    .select("id")
    .eq("job_id", jobId)
    .eq("event_type", "retest_ready_requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reqErr) throw reqErr;

  if (!existingRequest?.id) {
    await insertJobEvent({
      supabase,
      jobId,
      event_type: "retest_ready_requested",
      meta: {
        source: "contractor_portal",
        requested_by: "contractor",
        next_action: "create_retest_job",
      },
      userId: user.id,
    });

    await insertInternalNotificationForEvent({
      supabase,
      jobId,
      eventType: "retest_ready_requested",
      actorUserId: user.id,
    });

    await notifyInternalNextActionChanged({
      supabase,
      jobId,
      eventType: "retest_ready_requested",
      meta: {
        next_action: "create_retest_job",
      },
    });
  }

  revalidatePath("/ops");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/portal/jobs/${jobId}`);
  revalidatePath("/portal");

  redirect(`/portal/jobs/${jobId}?banner=retest_ready_requested`);
}

export async function archiveJobFromForm(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const job_id = String(formData.get("job_id") ?? "").trim();
  if (!job_id) throw new Error("Missing job_id");

  // Confirm we have an authenticated user
  const { data: u, error: ue } = await supabase.auth.getUser();
  const actingUserId = u?.user?.id ?? null;
  console.error("ARCHIVE AUTH", { uid: actingUserId, err: ue?.message ?? null });
  if (ue) throw ue;
  if (!actingUserId) redirect("/login");

  try {
    await requireInternalUser({ supabase, userId: actingUserId });
    console.error("ARCHIVE INTERNAL", {
      ok: true,
      uid: actingUserId,
      iuErr: null,
    });
  } catch (error) {
    console.error("ARCHIVE INTERNAL", {
      ok: false,
      uid: actingUserId,
      iuErr:
        error instanceof Error
          ? error.message
          : "UNKNOWN_INTERNAL_ACCESS_ERROR",
    });
    throw error;
  }

  // Do the archive and REQUIRE a returned row (proves success)
  const ts = new Date().toISOString();

  const { data: updated, error: upErr } = await supabase
    .from("jobs")
    .update({ deleted_at: ts })
    .eq("id", job_id)
    .is("deleted_at", null)
    .select("id, deleted_at")
    .maybeSingle();

  console.error("ARCHIVE UPDATE", { updated, upErr });

  if (upErr) throw upErr;
  if (!updated?.id) {
    throw new Error("Archive failed (no row updated). Job may already be archived or RLS blocked the update.");
  }

  revalidatePath("/ops");
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${job_id}`);

  redirect(`/ops?saved=job_archived`);
}

export async function addJobEquipmentFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const equipmentRole = String(formData.get("equipment_role") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!equipmentRole) throw new Error("Missing equipment_role");

  const systemChoice = String(formData.get("system_location") || "").trim();
  const systemCustom = String(formData.get("system_location_custom") || "").trim();

  if (systemChoice === "__new__" && !systemCustom) {
    throw new Error("Please type a new System Location name.");
  }

  const systemLocationRaw =
    systemChoice === "__new__" ? systemCustom : systemChoice;

  if (!systemLocationRaw) throw new Error("Missing system_location");

  // Keep the user's casing for display, but use exact match for now.
  const systemLocation = systemLocationRaw;

  const manufacturer = String(formData.get("manufacturer") || "").trim() || null;
  const model = String(formData.get("model") || "").trim() || null;
  const serial = String(formData.get("serial") || "").trim() || null;

  const tonnageRaw = String(formData.get("tonnage") || "").trim();
  const tonnage = tonnageRaw ? Number(tonnageRaw) : null;

  const refrigerantType =
    String(formData.get("refrigerant_type") || "").trim() || null;

  const notes = String(formData.get("notes") || "").trim() || null;

  const supabase = await createClient();

  // 1) Resolve/Create system for this job + location
  const { data: existingSystem, error: sysFindErr } = await supabase
    .from("job_systems")
    .select("id")
    .eq("job_id", jobId)
    .eq("name", systemLocation)
    .maybeSingle();

  if (sysFindErr) throw sysFindErr;

  let systemId = existingSystem?.id ?? null;

  if (!systemId) {
    const { data: newSystem, error: sysCreateErr } = await supabase
      .from("job_systems")
      .insert({ job_id: jobId, name: systemLocation })
      .select("id")
      .single();

    if (sysCreateErr) throw sysCreateErr;
    systemId = newSystem.id;
  }

  if (!systemId) throw new Error("Unable to resolve system_id");

  // 2) Insert equipment tied to system_id
  const { error: eqErr } = await supabase.from("job_equipment").insert({
    job_id: jobId,
    system_id: systemId,
    equipment_role: equipmentRole,
    system_location: systemLocation,
    manufacturer,
    model,
    serial,
    tonnage,
    refrigerant_type: refrigerantType,
    notes,
  });

  if (eqErr) throw eqErr;

  revalidatePath(`/jobs/${jobId}/info`);
  revalidatePath(`/jobs/${jobId}/tests`);
  redirect(`/jobs/${jobId}/info?f=equipment`);
}

export async function updateJobEquipmentFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const equipmentId = String(formData.get("equipment_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!equipmentId) throw new Error("Missing equipment_id");

  const equipmentRole =
    String(formData.get("equipment_role") || "").trim() || null;

  const systemLocation =
    String(formData.get("system_location") || "").trim() || null;

  const manufacturer = String(formData.get("manufacturer") || "").trim() || null;
  const model = String(formData.get("model") || "").trim() || null;
  const serial = String(formData.get("serial") || "").trim() || null;

  const tonnageRaw = String(formData.get("tonnage") || "").trim();
  const tonnage = tonnageRaw ? Number(tonnageRaw) : null;

  const refrigerantType =
    String(formData.get("refrigerant_type") || "").trim() || null;

  const notes = String(formData.get("notes") || "").trim() || null;

  const supabase = await createClient();

  const { error } = await supabase
    .from("job_equipment")
    .update({
      equipment_role: equipmentRole,
      system_location: systemLocation,
      manufacturer,
      model,
      serial,
      tonnage,
      refrigerant_type: refrigerantType,
      notes,
    })
    .eq("id", equipmentId)
    .eq("job_id", jobId);

  if (error) throw error;

  revalidatePath(`/jobs/${jobId}/info`);
  revalidatePath(`/jobs/${jobId}/tests`);
  redirect(`/jobs/${jobId}/info?f=equipment`);
}

export async function deleteJobEquipmentFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const equipmentId = String(formData.get("equipment_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!equipmentId) throw new Error("Missing equipment_id");

  const supabase = await createClient();

 const { data: deleted, error: delErr } = await supabase
  .from("job_equipment")
  .delete()
  .eq("id", equipmentId)
  .eq("job_id", jobId)
  .select("system_id")
  .maybeSingle();

if (delErr) throw delErr;

const systemId = String(deleted?.system_id ?? "").trim();
await cleanupOrphanSystem({ supabase, jobId, systemId });

revalidatePath(`/jobs/${jobId}`);
revalidatePath(`/jobs/${jobId}/tests`);
}

export async function saveEccTestOverrideFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  // hardening: these must be provided by the form
  const systemIdRaw = String(formData.get("system_id") || "").trim();
  const testTypeRaw = String(formData.get("test_type") || "").trim();

  const override = String(formData.get("override") || "none").trim(); // "pass" | "fail" | "none"
  const reasonRaw = String(formData.get("override_reason") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  let override_pass: boolean | null = null;
  let override_reason: string | null = null;

  if (override === "pass") override_pass = true;
  else if (override === "fail") override_pass = false;
  else override_pass = null;

 // Smoke Test only: reason is optional
if (override_pass !== null) {
  override_reason = reasonRaw || "Smoke Test";
} else {
  override_reason = null;
}

  // ✅ validate testType against allowed pills
  const allowed = new Set(["duct_leakage", "airflow", "refrigerant_charge", "custom"]);
  const testType = allowed.has(testTypeRaw) ? testTypeRaw : "";

  const supabase = await createClient();

  const { data: updated, error } = await supabase
  .from("ecc_test_runs")
  .update({
    override_pass,
    override_reason,
    updated_at: new Date().toISOString(),
  })
  .eq("id", testRunId)
  .eq("job_id", jobId)
  .select("id, job_id, test_type, override_pass, override_reason")
  .maybeSingle();

if (error) throw error;

// 🔎 Force visibility if nothing matched
if (!updated?.id) {
  throw new Error(
    `Override update matched 0 rows. job_id=${jobId} test_run_id=${testRunId}`
  );
}

    await evaluateEccOpsStatus(jobId);
    revalidatePath(`/jobs/${jobId}`);

  // Re-render tests page
  revalidatePath(`/jobs/${jobId}/tests`);

  /**
   * 🔒 HARD RULE: never redirect with &s=
   * - if systemId missing, redirect without s (or throw)
   */
  // 🔒 Resolve system_id from the run (authoritative), fallback to form

const { data: run, error: runErr } = await supabase
  .from("ecc_test_runs")
  .select("system_id")
  .eq("id", testRunId)
  .eq("job_id", jobId)
  .single();

if (runErr) throw runErr;

const systemId =
  (run?.system_id ? String(run.system_id).trim() : "") ||
  (systemIdRaw ? String(systemIdRaw).trim() : "") ||
  "";


  if (!testType) {
    // preserve system if present, but don't emit blank s=
    if (systemId) redirectToTests({ jobId, systemId });
    redirectToTests({ jobId });
  }

  if (!systemId) {
    // explicit error OR redirect without s; pick one:
    // throw new Error("Missing system_id");
    redirectToTests({ jobId, testType });
  }

  redirectToTests({ jobId, testType, systemId });
  
  
}


export async function addEccTestRunFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const systemId = String(formData.get("system_id") || "").trim();
  const testType = String(formData.get("test_type") || "").trim();
  const equipmentId = String(formData.get("equipment_id") || "").trim(); // optional

  if (!jobId) throw new Error("Missing job_id");
  if (!systemId) throw new Error("Missing system_id");
  if (!testType) throw new Error("Missing test_type");

  const supabase = await createClient();

  // Attach to Visit #1 (create it if missing)
  const { data: visitExisting, error: visitFindErr } = await supabase
    .from("job_visits")
    .select("id, visit_number")
    .eq("job_id", jobId)
    .eq("visit_number", 1)
    .maybeSingle();

  if (visitFindErr) throw visitFindErr;

  let visitId = visitExisting?.id;

  if (!visitId) {
    const { data: visitNew, error: visitCreateErr } = await supabase
      .from("job_visits")
      .insert({ job_id: jobId, visit_number: 1 })
      .select("id")
      .single();

    if (visitCreateErr) throw visitCreateErr;
    visitId = visitNew.id;
  }

  if (!visitId) throw new Error("Unable to resolve Visit #1");

  // 🔒 Duplicate prevention: job + system + test_type
  const { data: existing, error: existErr } = await supabase
    .from("ecc_test_runs")
    .select("id")
    .eq("job_id", jobId)
    .eq("system_id", systemId)
    .eq("test_type", testType)
    .limit(1);

  if (existErr) throw existErr;

  if ((existing ?? []).length) {
    revalidatePath(`/jobs/${jobId}/tests`);
    redirectToTests({ jobId, testType, systemId });
  }

  const payload: any = {
    job_id: jobId,
    visit_id: visitId,
    test_type: testType,

    // ✅ canonical anchor
    system_id: systemId,

    // keep legacy for now
    system_key: systemId,

    is_completed: false,
    data: {},
    computed: {},
    computed_pass: null,
    override_pass: null,
    override_reason: null,
  };

  if (equipmentId) payload.equipment_id = equipmentId;

  const { error: insErr } = await supabase.from("ecc_test_runs").insert(payload);

  if (insErr) throw insErr;

  revalidatePath(`/jobs/${jobId}/tests`);
  redirectToTests({ jobId, testType, systemId });
}

export async function deleteEccTestRunFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const supabase = await createClient();

const { data: deletedRun, error: delRunErr } = await supabase
  .from("ecc_test_runs")
  .delete()
  .eq("id", testRunId)
  .eq("job_id", jobId)
  .select("system_id")
  .maybeSingle();

if (delRunErr) throw delRunErr;

const systemId = String(deletedRun?.system_id ?? "").trim();
await cleanupOrphanSystem({ supabase, jobId, systemId });

revalidatePath(`/jobs/${jobId}/tests`);
revalidatePath(`/jobs/${jobId}`);
}

export async function createContractorFromForm(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const returnPath = String(formData.get("return_path") || "").trim();

  if (!name) throw new Error("Contractor name is required");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contractors")
    .insert({ name, phone, email, notes })
    .select("id, name, phone, email")
    .single();

  if (error) throw error;

  // Revalidate common views where contractors appear
  revalidatePath("/jobs");
  if (returnPath) revalidatePath(returnPath);

  return data;
}

export async function updateJobContractorFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const contractorIdRaw = String(formData.get("contractor_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");

  // empty string means "clear"
  const contractor_id = contractorIdRaw ? contractorIdRaw : null;

  const supabase = await createClient();

  const { data: beforeJob, error: beforeErr } = await supabase
    .from("jobs")
    .select("contractor_id")
    .eq("id", jobId)
    .single();

  if (beforeErr) throw beforeErr;

  // Hardening: contractor changes are jobs.contractor_id-only and must not
  // mutate staffing history in job_assignments. Also skip no-op rewrites.
  const currentContractorId = beforeJob?.contractor_id ? String(beforeJob.contractor_id) : null;
  if (currentContractorId === contractor_id) {
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/jobs");
    return;
  }

  const { error } = await supabase
    .from("jobs")
    .update({ contractor_id })
    .eq("id", jobId);

  if (error) throw error;

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
}

/** =========================
 * SAVE: REFRIGERANT CHARGE
 * - merges existing data
 * - revalidates /tests
 * - redirects back preserving t & s (never blank s=)
 * ========================= */

export async function markRefrigerantChargeExemptFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  const exemptPackageUnit = formData.get("rc_exempt_package_unit") === "on";
  const exemptConditions = formData.get("rc_exempt_conditions") === "on";
  const details = String(formData.get("rc_override_details") || "").trim() || null;

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  // Choose reason (package_unit wins if both checked)
  const exemptReason = exemptPackageUnit
    ? "package_unit"
    : exemptConditions
      ? "conditions_not_met"
      : null;

  const supabase = await createClient();

  if (!exemptReason) {
    const systemId = await resolveSystemIdForRun({
      supabase,
      jobId,
      testRunId,
      systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
    });

    const q = new URLSearchParams();
    q.set("t", "refrigerant_charge");
    if (systemId) q.set("s", systemId);
    q.set("notice", "rc_exempt_reason_required");

    redirect(`/jobs/${jobId}/tests?${q.toString()}`);
  }

  const reasonLabel =
    exemptReason === "package_unit"
      ? "Package unit — charge verification not required"
      : "Conditions not met / weather — charge verification override";

  const fullReason = details ? `${reasonLabel}: ${details}` : reasonLabel;

  // merge into data for persistence/UI defaults
  const { data: existingRun, error: loadErr } = await supabase
    .from("ecc_test_runs")
    .select("data")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (loadErr) throw loadErr;

  const existingData = (existingRun?.data ?? {}) as Record<string, any>;
  const mergedData = {
    ...existingData,
    charge_exempt_reason: exemptReason,
    charge_exempt_details: details,
  };

  const computed = {
    status: "exempt",
    exempt_reason: exemptReason,
    exempt_details: details,
    note: "Marked exempt (auto-pass) by technician",
  };

  const { error: upErr } = await supabase
    .from("ecc_test_runs")
    .update({
      data: mergedData,
      computed,
      computed_pass: true,
      override_pass: true,
      override_reason: fullReason,
      is_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (upErr) throw upErr;

  await evaluateEccOpsStatus(jobId);

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  revalidatePath(`/jobs/${jobId}/tests`);
  revalidatePath(`/jobs/${jobId}`);
  redirectToTests({ jobId, testType: "refrigerant_charge", systemId });
}

export async function saveRefrigerantChargeDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

    // Override / exemption flags (no schema change; stored + enforced via override_pass)
  const exemptPackageUnit = formData.get("rc_exempt_package_unit") === "on";
  const exemptConditions = formData.get("rc_exempt_conditions") === "on";
  const overrideDetails = String(formData.get("rc_override_details") || "").trim() || null;

  // If both checked, treat as package unit (and record a warning)
  const isChargeExempt = exemptPackageUnit || exemptConditions;

  const chargeExemptReason = exemptPackageUnit
    ? "package_unit"
    : exemptConditions
      ? "conditions_not_met"
      : null;

  const chargeOverrideReasonText = exemptPackageUnit
    ? "Package unit — charge verification not required"
    : exemptConditions
      ? "Conditions not met / weather — charge verification override"
      : null;

  const fullOverrideReason =
    isChargeExempt
      ? (overrideDetails
          ? `${chargeOverrideReasonText}: ${overrideDetails}`
          : chargeOverrideReasonText)
      : null;

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const num = (key: string) => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) ? val : null;
  };

  const data = {
    // CHEERS F2
    lowest_return_air_db_f: num("lowest_return_air_db_f"),
    condenser_air_entering_db_f: num("condenser_air_entering_db_f"),
    liquid_line_temp_f: num("liquid_line_temp_f"),
    liquid_line_pressure_psig: num("liquid_line_pressure_psig"),
    condenser_sat_temp_f: num("condenser_sat_temp_f"),
    target_subcool_f: num("target_subcool_f"),

    // CHEERS G
    suction_line_temp_f: num("suction_line_temp_f"),
    suction_line_pressure_psig: num("suction_line_pressure_psig"),
    evaporator_sat_temp_f: num("evaporator_sat_temp_f"),

    // Your workflow extras
    outdoor_temp_f: num("outdoor_temp_f"),
    refrigerant_type: String(formData.get("refrigerant_type") || "").trim() || null,
    filter_drier_installed: formData.get("filter_drier_installed") === "on",
    notes: String(formData.get("notes") || "").trim() || null,
  };

  const measuredSubcool =
    data.condenser_sat_temp_f != null && data.liquid_line_temp_f != null
      ? data.condenser_sat_temp_f - data.liquid_line_temp_f
      : null;

  const measuredSuperheat =
    data.suction_line_temp_f != null && data.evaporator_sat_temp_f != null
      ? data.suction_line_temp_f - data.evaporator_sat_temp_f
      : null;

  const subcoolDelta =
    measuredSubcool != null && data.target_subcool_f != null
      ? measuredSubcool - data.target_subcool_f
      : null;

  // Rules (your current spec)
  const rules = {
    indoor_min_f: 70, // we will use lowest_return_air_db_f as indoor proxy
    outdoor_min_f: 55,
    subcool_tolerance_f: 2,
    superheat_max_f: 25,
    filter_drier_required: true,
  };

  const failures: string[] = [];
  const warnings: string[] = [];
  const blocked: string[] = [];

  // Temperature gating (doesn't block saving; affects computed_pass)
  if (data.lowest_return_air_db_f != null && data.lowest_return_air_db_f < rules.indoor_min_f) {
    blocked.push(`Indoor temp below ${rules.indoor_min_f}F`);
  } else if (data.lowest_return_air_db_f == null) {
    warnings.push("Missing lowest return air dry bulb");
  }

  if (data.outdoor_temp_f != null && data.outdoor_temp_f < rules.outdoor_min_f) {
    blocked.push(`Outdoor temp below ${rules.outdoor_min_f}F`);
  } else if (data.outdoor_temp_f == null) {
    warnings.push("Missing outdoor temp");
  }

  // Filter drier required
  if (rules.filter_drier_required && !data.filter_drier_installed) {
    failures.push("Filter drier not confirmed");
  }

  // Superheat rule
  if (measuredSuperheat != null) {
    if (measuredSuperheat >= rules.superheat_max_f) {
      failures.push(`Superheat >= ${rules.superheat_max_f}F`);
    }
  } else {
    warnings.push("Missing superheat inputs");
  }

  // Subcool rule (needs target)
  if (data.target_subcool_f == null) {
    warnings.push("Missing target subcool");
  }
  if (measuredSubcool != null && data.target_subcool_f != null) {
    if (Math.abs(measuredSubcool - data.target_subcool_f) > rules.subcool_tolerance_f) {
      failures.push(`Subcool not within ±${rules.subcool_tolerance_f}F of target`);
    }
  } else {
    warnings.push("Missing subcool inputs");
  }

  // Decide computed_pass
  const hasCoreCompute =
    measuredSubcool != null &&
    measuredSuperheat != null &&
    data.target_subcool_f != null;

  const isBlocked = blocked.length > 0;

  // ✅ Exemption/override path: counts as PASS and should not block job resolution
  const computedPass = isChargeExempt
    ? true
    : isBlocked
      ? null
      : hasCoreCompute
        ? failures.length === 0
        : null;

  if (isChargeExempt) {
    // keep a breadcrumb inside computed for auditing
    warnings.push(
      exemptPackageUnit
        ? "Charge verification exempt: package unit"
        : "Charge verification override: conditions not met"
    );
    if (overrideDetails) warnings.push(`Override details: ${overrideDetails}`);
  }

  const computed = {
    status: isChargeExempt ? "exempt" : isBlocked ? "blocked" : "computed",
    blocked: isChargeExempt ? [] : blocked,
    measured_subcool_f: measuredSubcool,
    measured_superheat_f: measuredSuperheat,
    subcool_delta_f: subcoolDelta,
    rules,
    failures: isChargeExempt ? [] : failures,
    warnings,
  };

  const supabase = await createClient();

  // 1) Load existing data so we don't wipe fields
  const { data: existingRun, error: loadErr } = await supabase
    .from("ecc_test_runs")
    .select("data")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (loadErr) throw loadErr;

  const existingData = (existingRun?.data ?? {}) as Record<string, any>;

  // 2) Merge: new values override old; untouched fields remain
  const mergedData = { ...existingData, ...data };

  const { error: upErr } = await supabase
    .from("ecc_test_runs")
      .update({
    data: {
      ...mergedData,
      // store exemption info for reporting/audit
      charge_exempt: isChargeExempt || undefined,
      charge_exempt_reason: chargeExemptReason || undefined,
      charge_exempt_details: overrideDetails || undefined,
    },
    computed,
    computed_pass: computedPass,
    // ✅ this is the key that makes evaluateEccOpsStatus treat it as PASS
    override_pass: isChargeExempt ? true : null,
    override_reason: isChargeExempt ? fullOverrideReason : null,
    updated_at: new Date().toISOString(),
  })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (upErr) throw upErr;

  // ✅ preserve system selection reliably
  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  await evaluateEccOpsStatus(jobId);
  revalidatePath(`/jobs/${jobId}/tests`);
  revalidatePath(`/jobs/${jobId}`);
  redirectToTests({ jobId, testType: "refrigerant_charge", systemId });
}

/** =========================
 * SAVE: AIRFLOW
 * - revalidates /tests
 * - redirects back preserving t & s
 * ========================= */
export async function saveAirflowDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();
  const projectType = String(formData.get("project_type") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const num = (key: string) => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) ? val : null;
  };

  const measuredTotalCfm = num("measured_total_cfm");
  const tonnage = num("tonnage");

  // Existing simple rule for now; later we can swap this to rule-profiles helper
  const cfmPerTon = projectType === "all_new" ? 350 : 300;
  const requiredTotalCfm = tonnage != null ? tonnage * cfmPerTon : null;

  const failures: string[] = [];
  const warnings: string[] = [];

  if (tonnage == null) warnings.push("Missing tonnage");
  if (measuredTotalCfm == null) warnings.push("Missing measured total airflow");

  let computedPass: boolean | null = null;

  if (measuredTotalCfm != null && requiredTotalCfm != null) {
    computedPass = measuredTotalCfm < requiredTotalCfm ? false : true;
    if (computedPass === false) {
      failures.push(`Airflow below required (${requiredTotalCfm} CFM)`);
    }
  } else {
    computedPass = null;
  }

  // NEW: airflow pass override
  const airflowOverridePass = String(formData.get("airflow_override_pass") || "").trim() === "true";
  const airflowOverrideReason = String(formData.get("airflow_override_reason") || "").trim();

  if (airflowOverridePass && !airflowOverrideReason) {
    throw new Error("Airflow override reason is required when override is enabled.");
  }

  const data = {
    measured_total_cfm: measuredTotalCfm,
    tonnage,
    cfm_per_ton_required: cfmPerTon,
    notes: String(formData.get("notes") || "").trim() || null,

    // breadcrumb for reporting/audit
    airflow_override_applied: airflowOverridePass || undefined,
    airflow_override_reason: airflowOverridePass ? airflowOverrideReason : undefined,
  };

  const computed = {
    cfm_per_ton_required: cfmPerTon,
    required_total_cfm: requiredTotalCfm,
    measured_total_cfm: measuredTotalCfm,
    failures,
    warnings,

    // breadcrumb for reporting/audit
    override_mode: airflowOverridePass ? "pass_override" : null,
  };

  const supabase = await createClient();

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      override_pass: airflowOverridePass ? true : null,
      override_reason: airflowOverridePass ? airflowOverrideReason : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  await evaluateEccOpsStatus(jobId);

  revalidatePath(`/jobs/${jobId}/tests`);
  revalidatePath(`/jobs/${jobId}`);
  redirectToTests({ jobId, testType: "airflow", systemId });
}

/** =========================
 * SAVE: DUCT LEAKAGE
 * - revalidates /tests
 * - redirects back preserving t & s
 * ========================= */
export async function saveDuctLeakageDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();
  const projectType = String(formData.get("project_type") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const num = (key: string) => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) ? val : null;
  };

  const measuredLeakageCfm = num("measured_duct_leakage_cfm");
  const tonnage = num("tonnage");

  // Locked duct leakage basis:
  // base airflow = tonnage * 400
  // alteration = 10%
  // new/all_new = 5%
  const normalizedProjectType = projectType.toLowerCase();

  const leakagePercentAllowed =
    normalizedProjectType === "all_new" ||
    normalizedProjectType === "allnew" ||
    normalizedProjectType === "new" ||
    normalizedProjectType === "new_construction" ||
    normalizedProjectType === "new_prescriptive"
      ? 0.05
      : normalizedProjectType === "alteration"
      ? 0.10
      : null;

  const baseAirflowCfm = tonnage != null ? tonnage * 400 : null;
  const maxLeakageCfm =
    baseAirflowCfm != null && leakagePercentAllowed != null
      ? baseAirflowCfm * leakagePercentAllowed
      : null;

  const failures: string[] = [];
  const warnings: string[] = [];

  if (tonnage == null) warnings.push("Missing tonnage");
  if (measuredLeakageCfm == null) warnings.push("Missing measured duct leakage");
  if (leakagePercentAllowed == null) warnings.push("No leakage rule profile found for project type");

  let computedPass: boolean | null = null;

  if (measuredLeakageCfm != null && maxLeakageCfm != null) {
    computedPass = measuredLeakageCfm <= maxLeakageCfm;
    if (computedPass === false) {
      failures.push(`Duct leakage above max (${maxLeakageCfm} CFM)`);
    }
  } else {
    computedPass = null;
  }

  const data = {
    measured_duct_leakage_cfm: measuredLeakageCfm,
    tonnage,
    notes: String(formData.get("notes") || "").trim() || null,
  };

  const computed = {
    base_airflow_cfm: baseAirflowCfm,
    leakage_percent_allowed: leakagePercentAllowed,
    leakage_percent_allowed_display:
      leakagePercentAllowed != null ? leakagePercentAllowed * 100 : null,
    max_leakage_cfm: maxLeakageCfm,
    measured_duct_leakage_cfm: measuredLeakageCfm,
    failures,
    warnings,
  };

  const supabase = await createClient();

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      updated_at: new Date().toISOString(),
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  await evaluateEccOpsStatus(jobId);

  revalidatePath(`/jobs/${jobId}/tests`);
  revalidatePath(`/jobs/${jobId}`);
  redirectToTests({ jobId, testType: "duct_leakage", systemId });
}

/** =========================
 * COMPLETE TEST RUN
 * ✅ FIXES System 2 collision by scoping conflict check to (visit + test_type + system_id)
 * ✅ Always redirects preserving t & s (never blank s=)
 * ========================= */
export async function completeEccTestRunFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const supabase = await createClient();

  // 1) Load the run we are completing (this is the one we must KEEP)
  const { data: run, error: runErr } = await supabase
    .from("ecc_test_runs")
    .select("id, job_id, test_type, visit_id, is_completed, system_id, computed_pass, override_pass, data")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (runErr) throw runErr;
  if (!run) throw new Error("Test run not found");

  // Resolve system_id: prefer form, fallback to run.system_id
  const systemId =
    String(formData.get("system_id") || "").trim() ||
    String(run.system_id || "").trim() ||
    null;


    
  // 2) Ensure visit_id exists (fallback to earliest visit)
  let visitId: string | null = run.visit_id ?? null;

  if (!visitId) {
    const { data: v, error: vErr } = await supabase
      .from("job_visits")
      .select("id")
      .eq("job_id", jobId)
      .order("visit_number", { ascending: true })
      .limit(1)
      .single();

    if (vErr) throw vErr;
    if (!v?.id) throw new Error("No visit exists for this job");
    visitId = v.id;

    // --- AUTO-SAVE ON COMPLETE (duct_leakage) ---
// If user skipped Save, we compute + persist so a run can never be "completed" blank.
const hasPassFail =
  run.override_pass === true ||
  run.override_pass === false ||
  run.computed_pass === true ||
  run.computed_pass === false;

const hasAnyData =
  run.data && typeof run.data === "object" && Object.keys(run.data).length > 0;

if (!hasPassFail && !hasAnyData && run.test_type === "duct_leakage") {
  const projectType = String(formData.get("project_type") || "").trim(); // "alteration" | "all_new"

  const num = (key: string) => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) ? val : null;
  };

  const measuredLeakageCfm = num("measured_duct_leakage_cfm");
  const tonnage = num("tonnage");

  const leakagePerTonMax = projectType === "all_new" ? 20 : 40;
  const maxLeakageCfm = tonnage != null ? tonnage * leakagePerTonMax : null;

  const failures: string[] = [];
  const warnings: string[] = [];

  if (tonnage == null) warnings.push("Missing tonnage");
  if (measuredLeakageCfm == null) warnings.push("Missing measured duct leakage");

  let computedPass: boolean | null = null;

  if (measuredLeakageCfm != null && maxLeakageCfm != null) {
    computedPass = measuredLeakageCfm > maxLeakageCfm ? false : true;
    if (computedPass === false) failures.push(`Duct leakage above max (${maxLeakageCfm} CFM)`);
  }

  const data = {
    measured_duct_leakage_cfm: measuredLeakageCfm,
    tonnage,
    max_cfm_per_ton: leakagePerTonMax,
    notes: String(formData.get("notes") || "").trim() || null,
  };

  const computed = {
    max_cfm_per_ton: leakagePerTonMax,
    max_leakage_cfm: maxLeakageCfm,
    measured_duct_leakage_cfm: measuredLeakageCfm,
    failures,
    warnings,
  };

  // Persist compute before allowing completion
  const { error: saveErr } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      updated_at: new Date().toISOString(),
      visit_id: visitId,        // also ensure visit_id is stamped
      system_id: systemId,      // ensure system_id is stamped
    })
    .eq("id", run.id)
    .eq("job_id", jobId);

  if (saveErr) throw saveErr;

  // refresh our local run values for later logic (optional but helps)
  run.computed_pass = computedPass as any;
  run.data = data as any;
}

    // stamp visit_id on the run we're keeping
    const { error: stampErr } = await supabase
      .from("ecc_test_runs")
      .update({ visit_id: visitId })
      .eq("id", run.id)
      .eq("job_id", jobId);

    if (stampErr) throw stampErr;
  }

  // 3) Find any duplicate for same visit + test_type (+ system_id if present)
const baseConflictQuery = supabase
  .from("ecc_test_runs")
  .select("id, computed_pass, override_pass, data, updated_at")
  .eq("job_id", jobId)
  .eq("visit_id", visitId)
  .eq("test_type", run.test_type)
  .neq("id", run.id)
  .order("updated_at", { ascending: false })
  .limit(1);

  const { data: existing, error: existErr } = systemId
    ? await baseConflictQuery.eq("system_id", systemId)
    : await baseConflictQuery;

  if (existErr) throw existErr;

  const conflict = (existing ?? [])[0] ?? null;
  const conflictHasPassFail =
  conflict?.override_pass === true ||
  conflict?.override_pass === false ||
  conflict?.computed_pass === true ||
  conflict?.computed_pass === false;

const conflictHasAnyData =
  conflict?.data && typeof conflict.data === "object" && Object.keys(conflict.data).length > 0;

// pick keeper: prefer the row that actually has pass/fail or data
const clickedIsGoodNow =
  run.override_pass === true ||
  run.override_pass === false ||
  run.computed_pass === true ||
  run.computed_pass === false ||
  (run.data && typeof run.data === "object" && Object.keys(run.data).length > 0);

const keepId = !clickedIsGoodNow && (conflictHasPassFail || conflictHasAnyData) ? conflict.id : run.id;
const deleteId = keepId === run.id ? conflict?.id : run.id;


  // 4) Mark THIS run completed (the one the user clicked)
  const { error: completeErr } = await supabase
    .from("ecc_test_runs")
    .update({ is_completed: true, updated_at: new Date().toISOString() })
    .eq("id", keepId)
    .eq("job_id", jobId);

  if (completeErr) throw completeErr;

  // 5) If there was a conflict, delete the OTHER row (never delete the clicked one)
  if (deleteId) {
    const { error: delErr } = await supabase
      .from("ecc_test_runs")
      .delete()
      .eq("id", deleteId)
      .eq("job_id", jobId);

    if (delErr) throw delErr;
  }

  // 6) Update ECC ops_status based on completed test outcomes (failed vs paperwork_required)

// BEFORE snapshot: child ops_status + parent link
const { data: childBefore, error: childBeforeErr } = await supabase
  .from("jobs")
  .select("ops_status, parent_job_id")
  .eq("id", jobId)
  .maybeSingle();

if (childBeforeErr) throw childBeforeErr;

const childOpsBefore = (childBefore?.ops_status ?? null) as string | null;
const parentJobId = (childBefore?.parent_job_id ?? null) as string | null;

// Existing behavior (keep)
await evaluateEccOpsStatus(jobId);

// AFTER snapshot: child ops_status
const { data: childAfter, error: childAfterErr } = await supabase
  .from("jobs")
  .select("ops_status")
  .eq("id", jobId)
  .maybeSingle();

if (childAfterErr) throw childAfterErr;

const childOpsAfter = (childAfter?.ops_status ?? null) as string | null;

// Retest resolution (only if linked)
if (parentJobId) {
  await applyRetestResolution({
    supabase,
    childJobId: jobId,
    parentJobId,
    childOpsBefore,
    childOpsAfter,
  });
}


  revalidatePath(`/jobs/${jobId}/tests`);
  revalidatePath(`/jobs/${jobId}`);
  redirectToTests({ jobId, testType: run.test_type, systemId });
}


export async function addAlterationCoreTestsFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const systemId = String(formData.get("system_id") || "").trim();
  const equipmentId = String(formData.get("equipment_id") || "").trim(); // optional

  if (!jobId) throw new Error("Missing job_id");
  if (!systemId) throw new Error("Missing system_id");

  const supabase = await createClient();

  // Attach to Visit #1 for now
  const { data: visit, error: visitErr } = await supabase
    .from("job_visits")
    .select("id, visit_number")
    .eq("job_id", jobId)
    .order("visit_number", { ascending: true })
    .limit(1)
    .single();

  if (visitErr) throw visitErr;
  if (!visit?.id) throw new Error("No visit found for job");

  // Find existing core tests for THIS job + THIS system
  const { data: existing, error: existingError } = await supabase
    .from("ecc_test_runs")
    .select("test_type")
    .eq("job_id", jobId)
    .eq("system_id", systemId);

  if (existingError) throw existingError;

  const existingSet = new Set((existing ?? []).map((r: any) => r.test_type));

  const required = ["duct_leakage", "airflow", "refrigerant_charge"];

  const toInsert = required
    .filter((t) => !existingSet.has(t))
    .map((test_type) => {
      const row: any = {
        job_id: jobId,
        visit_id: visit.id,
        test_type,
        system_id: systemId,
        is_completed: false,
        data: {},
        computed: {},
        computed_pass: null,
        override_pass: null,
        override_reason: null,
      };

      if (equipmentId) row.equipment_id = equipmentId;
      return row;
    });

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("ecc_test_runs").insert(toInsert);
    if (insertError) throw insertError;
  }

  revalidatePath(`/jobs/${jobId}/tests`);
  redirectToTests({ jobId, systemId });
}

export async function updateJob(input: {
  ops_status?: string | null;
  id: string;
  title?: string;
  city?: string;
  status?: JobStatus;
  scheduled_date?: string | null;
  contractor_id?: string | null;
  permit_number?: string | null;
  jurisdiction?: string | null;
  permit_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  customer_phone?: string | null;
  on_the_way_at?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_email?: string | null;
  job_notes?: string | null;
}) {
  const supabase = await createClient();
  const { id, ...updates } = input;

  const { data, error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", id)
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function createJob(input: CreateJobInput): Promise<{ id: string; service_case_id: string | null }> {
  const supabase = await createClient();

  const payload = {
    parent_job_id: input.parent_job_id ?? null,
    service_case_id: input.service_case_id ?? null,

    job_type: input.job_type ?? "ecc",
    project_type: input.project_type ?? "alteration",

    title: input.title,
    job_address: input.job_address ?? null,
    city: input.city,
    scheduled_date: input.scheduled_date,
    status: input.status,
    contractor_id: input.contractor_id ?? null,
    permit_number: input.permit_number ?? null,
    jurisdiction: input.jurisdiction ?? null,
    permit_date: input.permit_date ?? null,
    window_start: input.window_start ?? null,
    window_end: input.window_end ?? null,
    customer_phone: input.customer_phone ?? null,
    customer_id: input.customer_id ?? null,
    location_id: input.location_id ?? null,
    customer_first_name: input.customer_first_name ?? null,
    customer_last_name: input.customer_last_name ?? null,
    customer_email: input.customer_email ?? null,
    job_notes: input.job_notes ?? null,
    ops_status: input.ops_status ?? null,

    billing_recipient: input.billing_recipient ?? null,
    billing_name: input.billing_name ?? null,
    billing_email: input.billing_email ?? null,
    billing_phone: input.billing_phone ?? null,
    billing_address_line1: input.billing_address_line1 ?? null,
    billing_address_line2: input.billing_address_line2 ?? null,
    billing_city: input.billing_city ?? null,
    billing_state: input.billing_state ?? null,
    billing_zip: input.billing_zip ?? null,
  };

  const { data, error } = await supabase
    .from("jobs")
    .insert(payload)
    .select("id, customer_id, location_id, service_case_id, parent_job_id, title, job_notes")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Job insert failed");

  let serviceCaseId = data.service_case_id ? String(data.service_case_id) : null;

  // Root job: create case after insert if not already provided
  if (!serviceCaseId && !data.parent_job_id) {
    if (!data.customer_id || !data.location_id) {
      throw new Error("Root job created without customer_id/location_id; cannot create service case");
    }

    serviceCaseId = await resolveServiceCaseIdForNewJob({
      supabase,
      customerId: String(data.customer_id),
      locationId: String(data.location_id),
      title: data.title,
      jobNotes: data.job_notes,
    });

    const { error: updErr } = await supabase
      .from("jobs")
      .update({ service_case_id: serviceCaseId })
      .eq("id", data.id);

    if (updErr) throw updErr;
  }
  

  return {
    id: String(data.id),
    service_case_id: serviceCaseId,
  };
}

/**
 * CREATE: used by /jobs/new form
 */
export async function createJobFromForm(formData: FormData) {
  // ----- basic fields -----
  const rawJobType = String(formData.get("job_type") || "").trim().toLowerCase();

  if (rawJobType !== "ecc" && rawJobType !== "service") {
    throw new Error("Invalid job type");
  }

const jobType = rawJobType;
  const projectType = String(formData.get("project_type") || "alteration").trim();

  const contractorIdRaw = formData.get("contractor_id");
  const contractor_id =
    typeof contractorIdRaw === "string" && contractorIdRaw.trim()
      ? contractorIdRaw.trim()
      : null;

  const title = String(formData.get("title") || "").trim();
  const postedCity = String(formData.get("city") || "").trim();

  const customerPhoneRaw = String(formData.get("customer_phone") || "").trim();

  const billing_recipient = String(formData.get("billing_recipient") || "").trim() as
    | "contractor"
    | "customer"
    | "other"
    | "";

const billing_name = String(formData.get("billing_name") || "").trim() || null;
const billing_email = String(formData.get("billing_email") || "").trim() || null;
const billing_phone = String(formData.get("billing_phone") || "").trim() || null;

const billing_address_line1 =
  String(formData.get("billing_address_line1") || "").trim() || null;
const billing_address_line2 =
  String(formData.get("billing_address_line2") || "").trim() || null;
const billing_city = String(formData.get("billing_city") || "").trim() || null;
const billing_state = String(formData.get("billing_state") || "").trim() || null;
const billing_zip = String(formData.get("billing_zip") || "").trim() || null;

const { scheduled_date, window_start, window_end, ops_status } =
  deriveScheduleAndOps(formData);

const permitNumberRaw = String(formData.get("permit_number") || "").trim();
const permitDateRaw = String(formData.get("permit_date") || "").trim();
const jurisdictionRaw = String(formData.get("jurisdiction") || "").trim();

const customerFirstNameRaw = String(formData.get("customer_first_name") || "").trim();
const customerLastNameRaw = String(formData.get("customer_last_name") || "").trim();
const customerEmailRaw = String(formData.get("customer_email") || "").trim();
const jobNotesRaw = String(formData.get("job_notes") || "").trim();
const jobAddressFormRaw = String(formData.get("job_address") || "").trim();

const jurisdiction = jobType === "service" ? null : (jurisdictionRaw || null);
const permit_date = jobType === "service" ? null : (permitDateRaw || null);
const permit_number = jobType === "service" ? null : (permitNumberRaw || null);

const status = String(formData.get("status") || "open").trim() as JobStatus;

// ----- supabase + identity -----
const supabase = await createClient();

const { data: userData, error: userErr } = await supabase.auth.getUser();
if (userErr) throw new Error(userErr.message);

const user = userData?.user ?? null;
const userId = user?.id ?? null;

let isContractorUser = false;

// Enforce contractor based on login (multi-user per contractor)
let contractorIdFinal = contractor_id;

if (userId) {
  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (cuErr) throw new Error(cuErr.message);

  if (cu?.contractor_id) {
    contractorIdFinal = cu.contractor_id;
    isContractorUser = true;
  }
  
}

const { canonicalOwnerUserId, canonicalWriteClient } =
  await resolveCanonicalOwner({
    actorUserId: userId,
    defaultWriteClient: supabase,
    contractorId: isContractorUser ? contractorIdFinal : null,
  });


  // ----- billing defaults based on FINAL contractor id -----
  let billingRecipientFinal =
    billing_recipient || (contractorIdFinal ? "contractor" : "customer");

  if (billingRecipientFinal === "contractor" && !contractorIdFinal) {
    billingRecipientFinal = "customer";
  }

  if (billingRecipientFinal === "other") {
    if (!billing_name || !billing_address_line1 || !billing_city || !billing_state || !billing_zip) {
      throw new Error("Billing recipient is Other: Billing name and full address are required.");
    }
  }

  // ----- canonical service address input -----
  const existingCustomerId = String(formData.get("customer_id") || "").trim();
  const existingLocationId = String(formData.get("location_id") || "").trim();
  let existingCustomerSnapshot: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null = null;

  if (existingCustomerId) {
    const { data: existingCustomerRow, error: existingCustomerErr } = await supabase
      .from("customers")
      .select("first_name, last_name, email, phone")
      .eq("id", existingCustomerId)
      .maybeSingle();

    if (existingCustomerErr) throw existingCustomerErr;
    existingCustomerSnapshot = existingCustomerRow;
  }

  const customerFirstNameSnapshot =
    customerFirstNameRaw || String(existingCustomerSnapshot?.first_name ?? "").trim() || null;
  const customerLastNameSnapshot =
    customerLastNameRaw || String(existingCustomerSnapshot?.last_name ?? "").trim() || null;
  const customerEmailSnapshot =
    customerEmailRaw || String(existingCustomerSnapshot?.email ?? "").trim() || null;
  const customerPhoneSnapshot =
    customerPhoneRaw || String(existingCustomerSnapshot?.phone ?? "").trim() || null;

  let existingLocationSnapshot: { address_line1?: string | null; city?: string | null } | null = null;

  if (existingLocationId) {
    const { data: existingLocation, error: existingLocationErr } = await supabase
      .from("locations")
      .select("id, address_line1, city")
      .eq("id", existingLocationId)
      .maybeSingle();

    if (existingLocationErr) throw existingLocationErr;
    existingLocationSnapshot = existingLocation;
  }

  const address_line1 =
    String(formData.get("address_line1") || "").trim() ||
    jobAddressFormRaw ||
    String(existingLocationSnapshot?.address_line1 ?? "").trim();

  const city = postedCity || String(existingLocationSnapshot?.city ?? "").trim();

  const jobAddressRaw = address_line1;

  const titleFinal =
    title ||
    (jobType === "ecc"
      ? `ECC ${projectType.replaceAll("_", " ")} — ${city}`
      : "");

  if (!city) throw new Error("City is required");

  const locationNickname =
    String(formData.get("location_nickname") || "").trim() || null;
  const zip = String(formData.get("zip") || "").trim() || null;

    const normalizeAddressPart = (value: string | null | undefined) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  const normalizedAddressLine1 = normalizeAddressPart(address_line1);
  const normalizedCity = normalizeAddressPart(city);
  const normalizedZip = normalizeAddressPart(zip);

  async function findReusableLocation(customerId: string) {
  if (!normalizedAddressLine1 || !normalizedCity) return null;

  const { data: existingLocations, error } = await supabase
    .from("locations")
    .select("id, address_line1, city, zip")
    .eq("customer_id", customerId);

  if (error) throw error;

  const match = (existingLocations || []).find((loc) => {
    const locAddress = normalizeAddressPart(loc.address_line1);
    const locCity = normalizeAddressPart(loc.city);
    const locZip = normalizeAddressPart((loc as any).zip);

    const sameAddress = locAddress === normalizedAddressLine1;
    const sameCity = locCity === normalizedCity;

    const zipProvided = !!normalizedZip;
    const sameZip = !zipProvided || locZip === normalizedZip;

    return sameAddress && sameCity && sameZip;
  });

  return match ?? null;
}

  // ----- equipment payload (optional) + server validation -----
  const equipmentJsonRaw = String(formData.get("equipment_json") || "").trim();
  let equipmentPayload: any = null;

  if (equipmentJsonRaw) {
    try {
      equipmentPayload = JSON.parse(equipmentJsonRaw);
    } catch {
      throw new Error("Equipment payload was invalid. Please try again.");
    }

    const systems = Array.isArray(equipmentPayload?.systems) ? equipmentPayload.systems : [];
    for (const s of systems) {
      const hasComponents = Array.isArray(s?.components) && s.components.length > 0;
      const name = String(s?.name || "").trim();
      // Locked rule A: selecting a component => system name required
      if (hasComponents && !name) {
        throw new Error("Equipment added: System Location/Name is required for each system.");
      
      }
      
    }
    
  }

  

 async function insertEquipmentForJob(jobId: string) {
  console.error("EQUIP ENTER", { jobId, isContractorUser });

  const { data: u0, error: u0e } = await supabase.auth.getUser();
  console.error("EQUIP AUTH (top)", {
    uid: u0?.user?.id ?? null,
    err: u0e?.message ?? null,
  });

  const systems = Array.isArray(equipmentPayload?.systems)
    ? equipmentPayload.systems
    : [];
  if (!systems.length) return;

  for (const s of systems) {
    const systemName = String(s?.name || "").trim();
    const comps = Array.isArray(s?.components) ? s.components : [];
    if (!comps.length) continue;

    // B) right before job_systems insert (per system)
    console.error("EQUIP BEFORE job_systems insert", { jobId, systemName });

    const { data: u1, error: u1e } = await supabase.auth.getUser();
    console.error("EQUIP AUTH (pre-insert)", {
      uid: u1?.user?.id ?? null,
      err: u1e?.message ?? null,
    });

    // Create system (job_systems.name is NOT NULL)
    const { data: createdSystem, error: sysCreateErr } = await supabase
      .from("job_systems")
      .insert({ job_id: jobId, name: systemName })
      .select("id")
      .single();

    // C) if it fails, print the full supabase error object
    if (sysCreateErr) {
      console.error("job_systems insert error obj:", sysCreateErr);
      throw sysCreateErr;
    }

    const systemId = createdSystem?.id;
    if (!systemId) throw new Error("Unable to create system_id");

    for (const c of comps) {
      const equipment_role = String(c?.type || "").trim();
      if (!equipment_role) continue;

      const manufacturer = c?.manufacturer ? String(c.manufacturer).trim() : null;
      const model = c?.model ? String(c.model).trim() : null;
      const serial = c?.serial ? String(c.serial).trim() : null;
      const refrigerant_type = c?.refrigerant_type ? String(c.refrigerant_type).trim() : null;
      const notes = c?.notes ? String(c.notes).trim() : null;

      const tonnageRaw = c?.tonnage ? String(c.tonnage).trim() : "";
      const tonnage = tonnageRaw ? Number(tonnageRaw) : null;

      const { error: eqErr } = await supabase.from("job_equipment").insert({
        job_id: jobId,
        system_id: systemId,
        equipment_role,
        system_location: systemName,
        manufacturer,
        model,
        serial,
        tonnage,
        refrigerant_type,
        notes,
      });

      if (eqErr) {
        console.error("job_equipment insert error obj:", eqErr);
        throw eqErr;
      }
    }
  }
}

async function logIntakeSubmitted(jobId: string) {
  if (isContractorUser) return; // <-- add this line

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "intake_submitted",
    meta: {
      source: contractorIdFinal ? "contractor" : "internal",
      contractor_id: contractorIdFinal,
      job_type: jobType,
      project_type: projectType,
    },
    userId,
  });
}

  async function notifyInternalNextActionChanged(params: {
    supabase: any;
    jobId: string;
    eventType: string;
    meta?: Record<string, any> | null;
  }) {
    const { jobId } = params;

    // Intentionally lightweight for now.
    // This is the seam where email / notification-ledger wiring can be added later.
    // For this thread, the system notification is:
    // 1) job_events entry
    // 2) /ops visibility
    // 3) revalidation
    return { jobId };
  }



async function postCreate(createdJobId: string, metaSource: string) {

  if (!isContractorUser) {
  // Internal users can write system timeline events
  await insertJobEvent({
    supabase,
    jobId: createdJobId,
    event_type: "job_created",
    meta: { source: metaSource },
    userId,
  });

  await logIntakeSubmitted(createdJobId);

  if (scheduled_date) {
    await insertJobEvent({
      supabase,
      jobId: createdJobId,
      event_type: "scheduled",
      meta: {
        scheduled_date,
        window_start: window_start ?? null,
        window_end: window_end ?? null,
        source: "create",
      },
      userId,
    });
    await sendCustomerScheduledEmailForJob({ supabase, jobId: createdJobId });
  }
  } else {
    await insertJobEvent({
      supabase,
      jobId: createdJobId,
      event_type: "contractor_job_created",
      meta: {
        source: "contractor_portal",
        next_action: "review_and_schedule",
      },
      userId,
    });

    await notifyInternalNextActionChanged({
      supabase,
      jobId: createdJobId,
      eventType: "contractor_job_created",
      meta: {
        next_action: "review_and_schedule",
      },
    });

    if (scheduled_date) {
      await insertJobEvent({
        supabase,
        jobId: createdJobId,
        event_type: "contractor_schedule_updated",
        meta: {
          source: "contractor_portal",
          scheduled_date,
          window_start: window_start ?? null,
          window_end: window_end ?? null,
        },
        userId,
      });

      await insertInternalNotificationForEvent({
        supabase,
        jobId: createdJobId,
        eventType: "contractor_schedule_updated",
        actorUserId: userId,
      });
    }
}

await insertEquipmentForJob(createdJobId);

  // refresh views
  revalidatePath(`/jobs/${createdJobId}`);
  revalidatePath(`/ops`);

  if (isContractorUser) {
    revalidatePath(`/portal`);
    revalidatePath(`/portal/jobs/${createdJobId}`);
    redirect(`/portal/jobs/${createdJobId}`);
  }

  redirect(`/jobs/${createdJobId}`);
}

const CONTRACTOR_SANDBOX_ALLOWED = new Set([
  "contractor_note",
  "contractor_correction_submission",
  "attachment_added",
  "contractor_job_created",
  "contractor_schedule_updated",
  "retest_ready_requested",
]);

function canContractorWriteEvent(event_type: string) {
  return CONTRACTOR_SANDBOX_ALLOWED.has(event_type);
}
  // ---- Branch 1: existing customer + existing location ----
  if (existingCustomerId && existingLocationId) {
    const created = await createJob({
      job_type: jobType,
      project_type: projectType,
      job_address: jobAddressRaw || null,
      customer_id: existingCustomerId,
      location_id: existingLocationId,

      customer_first_name: customerFirstNameSnapshot,
      customer_last_name: customerLastNameSnapshot,
      customer_email: customerEmailSnapshot,
      job_notes: jobNotesRaw || null,

      title: titleFinal,
      city,
      scheduled_date,
      status,
      contractor_id: contractorIdFinal,
      permit_number,
      jurisdiction,
      permit_date,
      window_start,
      window_end,
      customer_phone: customerPhoneSnapshot,
      ops_status,

      billing_recipient: billingRecipientFinal,
      billing_name,
      billing_email,
      billing_phone,
      billing_address_line1,
      billing_address_line2,
      billing_city,
      billing_state,
      billing_zip,
    });

 await postCreate(created.id, "customer");
 return;
  }

  // If no service address, bounce back (your existing behavior)
  if (!address_line1) {
    redirect("/jobs/new?err=missing_address");
  }

// ---- Branch 2: existing customer + NEW location ----
if (existingCustomerId && !existingLocationId) {
  if (!address_line1) throw new Error("Service Address is required");
  if (!city) throw new Error("City is required");
  if (!zip) throw new Error("Zip is required");

  let locationIdToUse: string;

  const reusableLocation = await findReusableLocation(existingCustomerId);

  if (reusableLocation?.id) {
    locationIdToUse = reusableLocation.id;
  } else {
    const { data: location, error: locationErr } = await canonicalWriteClient
      .from("locations")
      .insert({
        customer_id: existingCustomerId,
        nickname: locationNickname,
        address_line1,
        city,
        zip,
        owner_user_id: canonicalOwnerUserId,
      })
      .select("id")
      .single();

    if (locationErr) throw locationErr;
    locationIdToUse = location.id;
  }

  const created = await createJob({
    job_type: jobType,
    project_type: projectType,
    job_address: jobAddressRaw || null,
    customer_id: existingCustomerId,
    location_id: locationIdToUse,

    customer_first_name: customerFirstNameSnapshot,
    customer_last_name: customerLastNameSnapshot,
    customer_email: customerEmailSnapshot,
    job_notes: jobNotesRaw || null,

    title: titleFinal,
    city,
    scheduled_date,
    status,
    contractor_id: contractorIdFinal,
    permit_number,
    jurisdiction,
    permit_date,
    window_start,
    window_end,
    customer_phone: customerPhoneSnapshot,
    ops_status,

    billing_recipient: billingRecipientFinal,
    billing_name,
    billing_email,
    billing_phone,
    billing_address_line1,
    billing_address_line2,
    billing_city,
    billing_state,
    billing_zip,
  });

  await postCreate(created.id, "customer_new_location");
  return;
}

// ---- Branch 3: new customer flow (duplicate-safe) ----
const { customerId, reused } = await findOrCreateCustomer({
  supabase: canonicalWriteClient,
  firstName: customerFirstNameRaw,
  lastName: customerLastNameRaw,
  phone: customerPhoneRaw,
  email: customerEmailRaw,
  ownerUserId: canonicalOwnerUserId,
});

let locationIdToUse: string;

const reusableLocation = await findReusableLocation(customerId);

if (reusableLocation?.id) {
  locationIdToUse = reusableLocation.id;
} else {
  const { data: location, error: locationErr } = await canonicalWriteClient
    .from("locations")
    .insert({
      customer_id: customerId,
      nickname: locationNickname,
      address_line1,
      city,
      zip,
      owner_user_id: canonicalOwnerUserId,
    })
    .select("id")
    .single();

  if (locationErr) throw locationErr;
  locationIdToUse = location.id;
}

const created = await createJob({
  job_type: jobType,
  project_type: projectType,
  job_address: jobAddressRaw || null,
  customer_id: customerId,
  location_id: locationIdToUse,

  customer_first_name: customerFirstNameRaw || null,
  customer_last_name: customerLastNameRaw || null,
  customer_email: customerEmailRaw || null,
  job_notes: jobNotesRaw || null,

  title: titleFinal,
  city,
  scheduled_date,
  status,
  contractor_id: contractorIdFinal,
  permit_number,
  jurisdiction,
  permit_date,
  window_start,
  window_end,
  customer_phone: customerPhoneRaw ? customerPhoneRaw : null,
  ops_status,

  billing_recipient: billingRecipientFinal,
  billing_name,
  billing_email,
  billing_phone,
  billing_address_line1,
  billing_address_line2,
  billing_city,
  billing_state,
  billing_zip,
});

const banner = reused ? "customer_reused" : "customer_created";
await postCreate(created.id, banner);
return;
}

/**
 * UPDATE: used by Edit Scheduling form on job detail page
 */
export async function advanceJobStatusFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();

  if (!id) throw new Error("Job ID is required");

  const supabase = await createClient();

  // ✅ Read true current status from DB (source of truth)
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("status, on_the_way_at")
    .eq("id", id)
    .single();

  if (jobErr) throw jobErr;

  const current = (job?.status || "open") as JobStatus;

  const nextMap: Record<JobStatus, JobStatus> = {
    open: "on_the_way",
    on_the_way: "in_process",
    in_process: "completed",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
  };

  const next = nextMap[current];

  // ECC guard:
  // do not allow status flow to move into completed unless at least one
  // completed ECC test run has a real result.
  if (next === "completed") {
    const { data: jt, error: jtErr } = await supabase
      .from("jobs")
      .select("job_type")
      .eq("id", id)
      .single();

    if (jtErr) throw jtErr;

    if ((jt?.job_type ?? "").toLowerCase() === "ecc") {
      const { data: runs, error: runErr } = await supabase
        .from("ecc_test_runs")
        .select("id, is_completed, computed_pass, override_pass")
        .eq("job_id", id)
        .eq("is_completed", true);

      if (runErr) throw runErr;

      const hasMeaningfulCompletedRun = (runs ?? []).some((r: any) => {
        if (!r?.is_completed) return false;
        if (r?.override_pass === true || r?.override_pass === false) return true;
        if (r?.computed_pass === true || r?.computed_pass === false) return true;
        return false;
      });

      if (!hasMeaningfulCompletedRun) {
        redirect(`/jobs/${id}?notice=ecc_test_required`);
      }
    }
  }

    // ✅ stamp only first time entering on_the_way
  if (next === "on_the_way" && !job?.on_the_way_at) {
    const autoScheduleConfirmed =
      String(formData.get("auto_schedule_confirmed") || "").trim() === "1";

    const { data: scheduleSnapshot, error: scheduleErr } = await supabase
      .from("jobs")
      .select("scheduled_date, window_start, window_end")
      .eq("id", id)
      .single();

    if (scheduleErr) throw scheduleErr;

    const hasFullSchedule =
      !!scheduleSnapshot?.scheduled_date &&
      !!scheduleSnapshot?.window_start &&
      !!scheduleSnapshot?.window_end;

    const now = new Date();

    const toLocalDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const toLocalTime = (d: Date) => {
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    };

    const plusTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    if (!hasFullSchedule && !autoScheduleConfirmed) {
      redirect(`/jobs/${id}?tab=${String(formData.get("tab") || "info")}&schedule_required=1`);
    }

    // PH2-D: resolve acting internal user before any DB write.
    // Fails fast with an auth error if the session is not an active internal user.
    const { userId: actingUserId } = await requireInternalUser({ supabase });

    // PH2-D refinement: ensure staffing before status update so assignment
    // failures cannot leave the job advanced without attribution.
    const actingAssignment = await ensureActiveAssignmentForUser({
      supabase,
      jobId: id,
      userId: actingUserId,
      actorUserId: actingUserId,
    });

    const updatePayload: Record<string, any> = {
      status: "on_the_way",
      on_the_way_at: now.toISOString(),
    };

    if (!hasFullSchedule && autoScheduleConfirmed) {
      updatePayload.scheduled_date = toLocalDate(now);
      updatePayload.window_start = toLocalTime(now);
      updatePayload.window_end = toLocalTime(plusTwoHours);
    }

    const { data: onTheWayApplied, error: updErr } = await supabase
      .from("jobs")
      .update(updatePayload)
      .eq("id", id)
      .eq("status", current)
      .is("on_the_way_at", null)
      .select("id")
      .maybeSingle();

    if (updErr) throw updErr;

    // Concurrency hardening: if another request already advanced this job,
    // do not emit duplicate transition events on this stale request.
    if (!onTheWayApplied?.id) {
      revalidatePath(`/jobs/${id}`);
      revalidatePath(`/jobs`);
      revalidatePath(`/ops`);
      revalidatePath(`/portal`);
      revalidatePath(`/portal/jobs/${id}`);
      redirect(`/jobs/${id}`);
    }

    // Keep on_my_way close to user intent in event order.
    // assignment_added (if any) -> on_my_way -> schedule_updated (if any)
    await insertJobEvent({
      supabase,
      jobId: id,
      event_type: "on_my_way",
      meta: {
        ...buildMovementEventMeta({
          from: current,
          to: next,
          trigger: "field_action",
          sourceAction: "advance_job_status_from_form",
        }),
        actor_user_id: actingUserId,
        assignment_id: actingAssignment.id,
      },
      userId: actingUserId,
    });

    if (!hasFullSchedule && autoScheduleConfirmed) {
      await insertJobEvent({
        supabase,
        jobId: id,
        event_type: "schedule_updated",
        meta: {
          before: {
            scheduled_date: scheduleSnapshot?.scheduled_date ?? null,
            window_start: scheduleSnapshot?.window_start ?? null,
            window_end: scheduleSnapshot?.window_end ?? null,
          },
          after: {
            scheduled_date: updatePayload.scheduled_date,
            window_start: updatePayload.window_start,
            window_end: updatePayload.window_end,
          },
          source: "auto_schedule_on_the_way",
        },
      });
    }
  } else {
    const updatePayload: Record<string, any> = { status: next };

    // ✅ When field marks completed, push into Data Entry queue
    // When field marks completed, push into the correct Ops queue
    if (next === "completed") {
      const { data: jt, error: jtErr } = await supabase
        .from("jobs")
        .select("job_type, ops_status, certs_complete, invoice_complete, scheduled_date, window_start, window_end")
        .eq("id", id)
        .single();

      if (jtErr) throw jtErr;

      const jobType = String(jt?.job_type ?? "").trim().toLowerCase();

      if (jobType === "ecc") {
        updatePayload.field_complete = true;
        updatePayload.field_complete_at = new Date().toISOString();
      } else {
        updatePayload.ops_status = "invoice_required";
      }
    }

    const { data: transitionApplied, error: updErr } = await supabase
      .from("jobs")
      .update(updatePayload)
      .eq("id", id)
      .eq("status", current)
      .select("id")
      .maybeSingle();

    if (updErr) throw updErr;

    // Concurrency/no-op hardening: stale retries should not emit duplicate
    // lifecycle events when a parallel request already moved status forward.
    if (!transitionApplied?.id) {
      revalidatePath(`/jobs/${id}`);
      revalidatePath(`/jobs`);
      revalidatePath(`/ops`);
      revalidatePath(`/portal`);
      revalidatePath(`/portal/jobs/${id}`);
      redirect(`/jobs/${id}`);
    }

    

  // ECC canonical resolution:
  // once the field lifecycle is marked complete, derive ops_status from ecc_test_runs
  if (next === "completed") {
    const { data: jt2, error: jt2Err } = await supabase
      .from("jobs")
      .select("job_type")
      .eq("id", id)
      .single();

    if (jt2Err) throw jt2Err;

    if ((jt2?.job_type ?? "").toLowerCase() === "ecc") {
      await evaluateEccOpsStatus(id);
    }
  }
    const lifecycleEventMap: Partial<Record<JobStatus, string>> = {
    on_the_way: "on_my_way",
    completed: "job_completed",
  };

  if (next === "in_process") {
    // PH2-E: person-level arrival event, additive to legacy visit-level start.
    // Order is intentional for downstream consumers: tech_arrived -> job_started.
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) throw userErr;

    const actingUserId = user?.id ?? null;

    let assignmentId: string | null = null;
    if (actingUserId) {
      const { data: activeAssignment, error: assignmentErr } = await supabase
        .from("job_assignments")
        .select("id")
        .eq("job_id", id)
        .eq("user_id", actingUserId)
        .eq("is_active", true)
        .maybeSingle();

      if (assignmentErr) throw assignmentErr;
      assignmentId = String(activeAssignment?.id ?? "").trim() || null;
    }

    const movementMeta = buildMovementEventMeta({
      from: current,
      to: next,
      trigger: "field_action",
      sourceAction: "advance_job_status_from_form",
    });

    const transitionMeta = {
      ...movementMeta,
      actor_user_id: actingUserId,
      ...(assignmentId ? { assignment_id: assignmentId } : {}),
    };

    await insertJobEvent({
      supabase,
      jobId: id,
      event_type: "tech_arrived",
      meta: transitionMeta,
      userId: actingUserId,
    });

    await insertJobEvent({
      supabase,
      jobId: id,
      event_type: "job_started",
      meta: transitionMeta,
      userId: actingUserId,
    });
  } else {
    const lifecycleEventType = lifecycleEventMap[next];

    if (lifecycleEventType) {
      if (lifecycleEventType === "job_completed") {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr) throw userErr;

        const actingUserId = user?.id ?? null;

        let assignmentId: string | null = null;
        if (actingUserId) {
          const { data: activeAssignment, error: assignmentErr } = await supabase
            .from("job_assignments")
            .select("id")
            .eq("job_id", id)
            .eq("user_id", actingUserId)
            .eq("is_active", true)
            .maybeSingle();

          if (assignmentErr) throw assignmentErr;
          assignmentId = String(activeAssignment?.id ?? "").trim() || null;
        }

        await insertJobEvent({
          supabase,
          jobId: id,
          event_type: lifecycleEventType,
          meta: {
            ...buildMovementEventMeta({
              from: current,
              to: next,
              trigger: "field_action",
              sourceAction: "advance_job_status_from_form",
            }),
            actor_user_id: actingUserId,
            ...(assignmentId ? { assignment_id: assignmentId } : {}),
          },
          userId: actingUserId,
        });
      } else {
        await insertJobEvent({
          supabase,
          jobId: id,
          event_type: lifecycleEventType,
          meta: buildMovementEventMeta({
            from: current,
            to: next,
            trigger: "field_action",
            sourceAction: "advance_job_status_from_form",
          }),
        });
      }
    }
  }

    // Retest-specific lifecycle breadcrumb:
  // if this job is a linked retest child and it enters in_process,
  // log retest_started on BOTH the child and the parent.
  const { data: linkedJob, error: linkedErr } = await supabase
    .from("jobs")
    .select("parent_job_id")
    .eq("id", id)
    .maybeSingle();

  if (linkedErr) throw linkedErr;

  const parentJobId = String(linkedJob?.parent_job_id ?? "").trim();

  if (parentJobId && next === "in_process") {
    await insertJobEvent({
      supabase,
      jobId: id,
      event_type: "retest_started",
      meta: { parent_job_id: parentJobId },
    });

    await insertJobEvent({
      supabase,
      jobId: parentJobId,
      event_type: "retest_started",
      meta: { child_job_id: id },
    });
  }

  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/jobs`);
  revalidatePath(`/ops`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs/${id}`);

  redirect(`/jobs/${id}`);
}

}


export async function updateJobScheduleFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();

  if (!id) throw new Error("Job ID is required");

  const supabase = await createClient();

  // Read prior scheduling snapshot so we can log changes
  const { data: before, error: beforeErr } = await supabase
    .from("jobs")
    .select(
      "scheduled_date, window_start, window_end, ops_status, job_type, status, field_complete, permit_number, jurisdiction, permit_date"
    )
    .eq("id", id)
    .single();

  if (beforeErr) throw beforeErr;

  const permitNumberRaw = String(formData.get("permit_number") || "").trim();
  const permitDateRaw = String(formData.get("permit_date") || "").trim();
  const jurisdictionRaw = String(formData.get("jurisdiction") || "").trim();

  // Canonical scheduling + ops_status logic (NO Date parsing)
  const derived = deriveScheduleAndOps(formData);
  const unscheduleRequested = String(formData.get("unschedule") || "").trim() === "1";

  let scheduled_date = derived.scheduled_date;
  let window_start = derived.window_start;
  let window_end = derived.window_end;
  const ops_status = derived.ops_status;

  if (unscheduleRequested) {
    scheduled_date = null;
    window_start = null;
    window_end = null;
  }

  let next_ops_status = ops_status;
  const isUnscheduledAfterSave = !scheduled_date && !window_start && !window_end;

  // Policy: explicit Unschedule always returns the job to the call list.
  if (unscheduleRequested && isUnscheduledAfterSave) {
    next_ops_status = "need_to_schedule";
  }

  const isEccCompletedOrFieldComplete =
    String(before?.job_type ?? "").toLowerCase() === "ecc" &&
    (Boolean(before?.field_complete) || String(before?.status ?? "").toLowerCase() === "completed");

  if (isEccCompletedOrFieldComplete && next_ops_status === "scheduled") {
    next_ops_status = String(before?.ops_status ?? "").trim() || next_ops_status;
  }

  const isServiceJob = String(before?.job_type ?? "").toLowerCase() === "service";

  const permit_number = isServiceJob ? null : (permitNumberRaw || null);
  const jurisdiction = isServiceJob ? null : (jurisdictionRaw || null);
  const permit_date = isServiceJob ? null : (permitDateRaw || null);

  const nextLifecycleStatus =
    unscheduleRequested && isUnscheduledAfterSave ? "open" : undefined;
  const nextOnTheWayAt =
    unscheduleRequested && isUnscheduledAfterSave ? null : undefined;

  await updateJob({
    id,
    scheduled_date,
    window_start,
    window_end,
    ops_status: next_ops_status,
    status: nextLifecycleStatus,
    on_the_way_at: nextOnTheWayAt,
    permit_number,
    jurisdiction,
    permit_date,
  });

  const wasPendingInfo = String(before?.ops_status ?? "").trim().toLowerCase() === "pending_info";
  const hasPermitNumber = String(permit_number ?? "").trim().length > 0;

  if (wasPendingInfo && hasPermitNumber) {
    await releasePendingInfoAndRecompute(id, "auto_release_on_permit_save");
  }

  const beforePermitNumber = String(before?.permit_number ?? "").trim();
  const afterPermitNumber = String(permit_number ?? "").trim();

  if (beforePermitNumber !== afterPermitNumber) {
    await insertJobEvent({
      supabase,
      jobId: id,
      event_type: "permit_info_updated",
      meta: {
        before: {
          permit_number: before?.permit_number ?? null,
          jurisdiction: before?.jurisdiction ?? null,
          permit_date: before?.permit_date ?? null,
        },
        after: {
          permit_number,
          jurisdiction,
          permit_date,
        },
      },
    });
  }

  const wasScheduled =
    !!before?.scheduled_date || !!before?.window_start || !!before?.window_end;
  const isScheduled = !!scheduled_date || !!window_start || !!window_end;

  const event_type = unscheduleRequested
    ? "unscheduled"
    : !wasScheduled && isScheduled
      ? "scheduled"
      : wasScheduled && !isScheduled
      ? "unscheduled"
      : "schedule_updated";

  await insertJobEvent({
    supabase,
    jobId: id,
    event_type,
    meta: {
      before: {
        scheduled_date: before?.scheduled_date ?? null,
        window_start: before?.window_start ?? null,
        window_end: before?.window_end ?? null,
        ops_status: before?.ops_status ?? null,
        status: before?.status ?? null,
        permit_number: before?.permit_number ?? null,
        jurisdiction: before?.jurisdiction ?? null,
        permit_date: before?.permit_date ?? null,
      },
      after: {
        scheduled_date,
        window_start,
        window_end,
        ops_status: next_ops_status,
        status: nextLifecycleStatus ?? before?.status ?? null,
        on_the_way_at: nextOnTheWayAt,
        permit_number,
        jurisdiction,
        permit_date,
      },
    },
  });

  if (event_type === "scheduled") {
    await sendCustomerScheduledEmailForJob({ supabase, jobId: id });
  }

  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/ops`);
  revalidatePath(`/calendar`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs/${id}`);

  redirect(`/jobs/${id}`);
}



export async function markJobFailedFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();

  if (!id) throw new Error("Job ID is required");

  await updateJob({ id, status: "failed" });
  redirect(`/jobs/${id}`);
}

/**
 * UPDATE: used by Customer + Notes edit form on job detail page
 */
export async function updateJobCustomerFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();
  if (!id) throw new Error("Job ID is required");

  const customer_first_name = String(formData.get("customer_first_name") || "").trim() || null;
  const customer_last_name = String(formData.get("customer_last_name") || "").trim() || null;
  const customer_email = String(formData.get("customer_email") || "").trim() || null;
  const customer_phone = String(formData.get("customer_phone") || "").trim() || null;
  const job_notes = String(formData.get("job_notes") || "").trim() || null;

  await updateJob({
    id,
    customer_first_name,
    customer_last_name,
    customer_email,
    customer_phone,
    job_notes,
  });

  redirect(`/jobs/${id}`);
}

// Job timeline event writers: public_note + internal_note
export async function addPublicNoteFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const tab = String(formData.get("tab") || "ops").trim() || "ops";

  if (!jobId) throw new Error("Job ID is required");
  if (!note) {
    redirect(`/jobs/${jobId}?tab=${tab}`);
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
  if (!user) redirect("/login");

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "public_note",
    meta: { note },
    userId: user.id,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}?tab=${tab}`);
}

export async function addInternalNoteFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const tab = String(formData.get("tab") || "ops").trim() || "ops";
  const context = String(formData.get("context") || "").trim() || null;
  const anchorEventId = String(formData.get("anchor_event_id") || "").trim() || null;
  const anchorEventType = String(formData.get("anchor_event_type") || "").trim() || null;

  if (!jobId) throw new Error("Job ID is required");
  if (!note) {
    redirect(`/jobs/${jobId}?tab=${tab}`);
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
  if (!user) redirect("/login");

  const hasContextFields = !!(context || anchorEventId || anchorEventType);
  const meta = hasContextFields
    ? {
        note,
        ...(context ? { context } : {}),
        ...(anchorEventId ? { anchor_event_id: anchorEventId } : {}),
        ...(anchorEventType ? { anchor_event_type: anchorEventType } : {}),
      }
    : { note };

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "internal_note",
    meta,
    userId: user.id,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}?tab=${tab}`);
}

export async function completeDataEntryFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();

  if (!id) throw new Error("Job ID is required");

  const invoice = String(formData.get("invoice_number") || "").trim() || null;

  const supabase = await createClient();

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status")
    .eq("id", id)
    .single();

  if (jobErr) throw jobErr;


  // Service: data entry completion = invoice sent/recorded -> closed
  const jobType = String(job?.job_type ?? "").trim().toLowerCase();

// Any non-ECC job closes here after invoice/data entry.
// Only ECC stays in paperwork flow.
if (jobType !== "ecc") {
  const { error } = await supabase
    .from("jobs")
    .update({
      ops_status: "closed",
      invoice_number: invoice,
      data_entry_completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;

  redirect(`/jobs/${id}`);
}

  // ECC: data entry completion should NOT close the job
  // ECC must go: paperwork_required -> (paperwork complete) -> closed
  const { error } = await supabase
    .from("jobs")
    .update({
      invoice_number: invoice,
      data_entry_completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;

  redirect(`/jobs/${id}`);
}
// ✅ Create a Retest job linked to a parent (failed) job via jobs.parent_job_id
export async function createRetestJobFromForm(formData: FormData) {
  "use server";

  const copyEquipment = String(formData.get("copy_equipment") || "") === "1";
  const parentJobId = String(formData.get("parent_job_id") || "").trim();
  if (!parentJobId) throw new Error("Missing parent_job_id");

  const supabase = await createClient();

  // 1) Load parent job
  const { data: parentData, error: parentErr } = await supabase
    .from("jobs")
      .select(
      [
        "id",
        "service_case_id",
        "job_type",
        "project_type",
        "title",
        "city",
        "customer_id",
        "location_id",
        "contractor_id",
        "permit_number",
        "customer_phone",
        "customer_first_name",
        "customer_last_name",
        "customer_email",
        "job_address",
        "billing_recipient",
        "billing_name",
        "billing_email",
        "billing_phone",
        "billing_address_line1",
        "billing_address_line2",
        "billing_city",
        "billing_state",
        "billing_zip",
      ].join(",")
    )
    .eq("id", parentJobId)
    .single();

  if (parentErr) throw parentErr;
  const parent = parentData as any;

  // 2) Create retest job (unscheduled by default)
  const retestTitle = `Retest — ${parent?.title ?? "Job"}`;

    const inheritedServiceCaseId =
    parent?.service_case_id
      ? String(parent.service_case_id)
      : await ensureServiceCaseForJob({
          supabase,
          jobId: parentJobId,
        });

  const child = await createJob({
    parent_job_id: parentJobId,
    service_case_id: inheritedServiceCaseId,

    job_type: parent?.job_type ?? "ecc",
    project_type: parent?.project_type ?? "alteration",

    title: retestTitle,
    city: parent?.city ?? "",

    customer_id: parent?.customer_id ?? null,
    location_id: parent?.location_id ?? null,
    contractor_id: parent?.contractor_id ?? null,

    scheduled_date: null,
    window_start: null,
    window_end: null,

    status: "open",
    ops_status: "need_to_schedule",

    permit_number: parent?.permit_number ?? null,
    customer_phone: parent?.customer_phone ?? null,
    customer_first_name: parent?.customer_first_name ?? null,
    customer_last_name: parent?.customer_last_name ?? null,
    customer_email: parent?.customer_email ?? null,
    job_address: parent?.job_address ?? null,

    billing_recipient: parent?.billing_recipient ?? null,
    billing_name: parent?.billing_name ?? null,
    billing_email: parent?.billing_email ?? null,
    billing_phone: parent?.billing_phone ?? null,
    billing_address_line1: parent?.billing_address_line1 ?? null,
    billing_address_line2: parent?.billing_address_line2 ?? null,
    billing_city: parent?.billing_city ?? null,
    billing_state: parent?.billing_state ?? null,
    billing_zip: parent?.billing_zip ?? null,
  });

      // 3) Timeline events on BOTH jobs
  try {
    await insertJobEvent({
      supabase,
      jobId: parentJobId,
      event_type: "retest_created",
      meta: { child_job_id: child.id },
    });

    await insertJobEvent({
      supabase,
      jobId: child.id,
      event_type: "retest_created",
      meta: { parent_job_id: parentJobId },
    });
  } catch (e) {
    console.error("retest_created job_events insert failed:", e);
  }

  

  // ✅ Optional: copy systems + equipment from original → retest
  if (copyEquipment) {
    // 1) Fetch parent systems
    const { data: parentSystems, error: sysErr } = await supabase
      .from("job_systems")
      .select("id, name, created_at")
      .eq("job_id", parentJobId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (sysErr) throw sysErr;

    // 2) Insert child systems (same names)
    const systemIdMap = new Map<string, string>(); // parentSystemId → childSystemId

    if (parentSystems?.length) {
      for (const parentSys of parentSystems) {
        const { data: newSystem, error: newSysErr } = await supabase
          .from("job_systems")
          .insert({
            job_id: child.id,
            name: parentSys?.name ?? "System",
          })
          .select("id")
          .single();

        if (newSysErr) throw newSysErr;

        if (parentSys?.id && newSystem?.id) {
          systemIdMap.set(String(parentSys.id), String(newSystem.id));
        }
      }
    }

    // 3) Fetch parent equipment
    const { data: parentEquip, error: eqErr } = await supabase
      .from("job_equipment")
      .select(
        [
          "equipment_role",
          "manufacturer",
          "model",
          "model_number",
          "serial",
          "tonnage",
          "refrigerant_type",
          "notes",
          "system_location",
          "system_id",
        ].join(",")
      )
      .eq("job_id", parentJobId);

    if (eqErr) throw eqErr;

    // 4) Insert child equipment (remap system_id)
    if (parentEquip?.length) {
      const insertEquip = parentEquip.map((e: any) => {
        const mappedSystemId =
          e.system_id ? systemIdMap.get(String(e.system_id)) ?? null : null;

        return {
          job_id: child.id,
          // equipment_role is NOT NULL in your schema; enforce a safe value
          equipment_role: String(e.equipment_role || "other"),
          manufacturer: e.manufacturer ?? null,
          model: e.model ?? null,
          model_number: e.model_number ?? null,
          serial: e.serial ?? null,
          tonnage: e.tonnage ?? null,
          refrigerant_type: e.refrigerant_type ?? null,
          notes: e.notes ?? null,
          system_location: e.system_location ?? null,
          // system_id is NOT NULL in your schema; only insert rows that have a mapped system_id
          system_id: mappedSystemId,
        };
      }).filter((row: any) => row.system_id); // enforce NOT NULL system_id

      if (insertEquip.length) {
        const { error: insEqErr } = await supabase
          .from("job_equipment")
          .insert(insertEquip);

        if (insEqErr) throw insEqErr;
      }
    }

    await insertJobEvent({
      supabase,
      jobId: child.id,
      event_type: "equipment_copied",
      meta: { from_job_id: parentJobId },
    });
  }

  revalidatePath(`/jobs/${parentJobId}`);
  revalidatePath(`/jobs/${child.id}`);
  revalidatePath(`/ops`);

  redirect(`/jobs/${child.id}?tab=ops`);
}
