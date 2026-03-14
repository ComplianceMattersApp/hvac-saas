// lib/actions/job-ops-actions
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveOpsStatus } from "@/lib/utils/ops-status";
import { evaluateEccOpsStatus } from "@/lib/actions/ecc-status";
import { forceSetOpsStatus } from "@/lib/actions/ops-status";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";

const OPS_STATUSES = [
  "need_to_schedule",
  "scheduled",
  "pending_info",
  "on_hold",
  "failed",
  "retest_needed",
  "field_complete",
  "paperwork_required",
  "invoice_required",
  "closed",
] as const;

type OpsStatus = (typeof OPS_STATUSES)[number];

function isOpsStatus(value: unknown): value is OpsStatus {
  return typeof value === 'string' && (OPS_STATUSES as readonly string[]).includes(value);
}


const ACTION_REQUIRED_BY = ['rater', 'contractor', 'customer'] as const;
type ActionRequiredBy = (typeof ACTION_REQUIRED_BY)[number];

function isActionRequiredBy(value: unknown): value is ActionRequiredBy {
  return typeof value === 'string' && (ACTION_REQUIRED_BY as readonly string[]).includes(value);
}

type OpsSnapshot = {
  ops_status: string | null;
  pending_info_reason: string | null;
  follow_up_date: string | null;
  next_action_note: string | null;
  action_required_by: string | null;
};

async function requireInternalOpsAccessOrRedirect(
  supabase: any,
  userId: string,
  jobId: string,
) {
  try {
    await requireInternalUser({ supabase, userId });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect(`/jobs/${jobId}?notice=not_authorized`);
    }

    throw error;
  }
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

export async function resolveFailureByCorrectionReviewFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  const reviewNoteRaw = formData.get("review_note");

  if (typeof jobId !== "string" || !jobId) throw new Error("Missing job_id");

  const review_note =
    typeof reviewNoteRaw === "string" && reviewNoteRaw.trim()
      ? reviewNoteRaw.trim()
      : null;

  // Internal-only guard
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  await requireInternalOpsAccessOrRedirect(supabase, user.id, jobId);

  // Current snapshot
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status, certs_complete, invoice_complete")
    .eq("id", jobId)
    .single();

  if (jobErr) throw new Error(jobErr.message);
  if (!job) throw new Error("Job not found");

  // Only meaningful on unresolved failed ECC jobs
  if ((job.job_type ?? "").toLowerCase() !== "ecc") {
    redirect(`/jobs/${jobId}?tab=ops`);
  }

  if (!["failed", "retest_needed"].includes(String(job.ops_status ?? ""))) {
  redirect(`/jobs/${jobId}?tab=ops`);
  }
  const beforeOps = job.ops_status ?? null;

  const { error: updErr } = await supabase
    .from("jobs")
    .update({ ops_status: "paperwork_required" })
    .eq("id", jobId);

  if (updErr) throw new Error(updErr.message);

  // Canonical narrative event
  const { error: eventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "failure_resolved_by_correction_review",
    meta: {
      from: beforeOps,
      to: "paperwork_required",
      review_note,
      source: "internal_review",
    },
    user_id: user.id,
  });

  if (eventErr) throw new Error(eventErr.message);

  // Optional ops_update companion for consistency with existing ops logs
  const { error: opsEventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Failure resolved by correction review",
    meta: {
      changes: [{ field: "ops_status", from: beforeOps, to: "paperwork_required" }],
      source: "job_detail_ops",
      review_note,
    },
    user_id: user.id,
  });

  if (opsEventErr) throw new Error(opsEventErr.message);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}?tab=ops`);
}

export async function markCertsCompleteFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  if (typeof jobId !== "string" || !jobId) throw new Error("Missing job_id");

  // Server-side auth guard: contractors cannot close out jobs
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  await requireInternalOpsAccessOrRedirect(supabase, user.id, jobId);

  // Read current job snapshot
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      "id, status, job_type, field_complete, certs_complete, invoice_complete, ops_status, scheduled_date, window_start, window_end"
    )
    .eq("id", jobId)
    .single();

  if (jobErr) throw jobErr;

  if (job.ops_status === "failed" || job.ops_status === "retest_needed") {
  redirect(`/jobs/${jobId}?notice=failed_requires_retest`);
  }

    // ECC hardening:
  // even if ops_status drifts, certs cannot complete while any completed failed run exists
  if ((job.job_type ?? "").toLowerCase() === "ecc") {
    const { data: runs, error: runsErr } = await supabase
      .from("ecc_test_runs")
      .select("is_completed, computed_pass, override_pass")
      .eq("job_id", jobId);

    if (runsErr) throw new Error(runsErr.message);

    const hasFailedCompletedRun = (runs ?? []).some((r: any) => {
      if (!r?.is_completed) return false;
      if (r?.override_pass === false) return true;
      if (r?.override_pass === true) return false;
      return r?.computed_pass === false;
    });

    if (hasFailedCompletedRun) {
      redirect(`/jobs/${jobId}?notice=failed_requires_retest`);
    }
  }

  if (!job.field_complete) {
    redirect(`/jobs/${jobId}?notice=field_not_complete`);
  }

    // Mark certs complete and verify update
    const { data: updatedCertRow, error: updErr } = await supabase
      .from("jobs")
      .update({ certs_complete: true })
      .eq("id", jobId)
      .select("id, certs_complete")
      .maybeSingle();

    if (updErr) throw updErr;

    if (!updatedCertRow?.id || updatedCertRow.certs_complete !== true) {
      throw new Error("Certs complete update failed (no row updated).");
    }
    
  // Recompute ops_status using shared resolver
  const nextOps = resolveOpsStatus({
    status: job.status,
    job_type: job.job_type,
    scheduled_date: job.scheduled_date,
    window_start: job.window_start,
    window_end: job.window_end,
    field_complete: job.field_complete,
    certs_complete: true,
    invoice_complete: job.invoice_complete,
    current_ops_status: job.ops_status,
  });

  const { error: opsErr } = await supabase
    .from("jobs")
    .update({ ops_status: nextOps })
    .eq("id", jobId);

  if (opsErr) throw opsErr;

  const { error: eventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Certs marked complete",
    meta: {
      changes: [
        { field: "certs_complete", from: !!job.certs_complete, to: true },
        { field: "ops_status", from: job.ops_status ?? null, to: nextOps },
      ],
    },
  });

  if (eventErr) throw eventErr;

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}`);
}

export async function markInvoiceCompleteFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  if (typeof jobId !== "string" || !jobId) throw new Error("Missing job_id");

  // Server-side auth guard: contractors cannot close out jobs
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  await requireInternalOpsAccessOrRedirect(supabase, user.id, jobId);

  // Read current job snapshot
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      "id, status, job_type, field_complete, certs_complete, invoice_complete, ops_status, scheduled_date, window_start, window_end"
    )
    .eq("id", jobId)
    .single();

  if (jobErr) throw jobErr;

  if (!job.field_complete) {
    redirect(`/jobs/${jobId}?notice=field_not_complete`);
  }

// Mark invoice complete and verify update
const { data: updatedInvoiceRow, error: updErr } = await supabase
  .from("jobs")
  .update({ invoice_complete: true })
  .eq("id", jobId)
  .select("id, invoice_complete")
  .maybeSingle();

if (updErr) throw updErr;

if (!updatedInvoiceRow?.id || updatedInvoiceRow.invoice_complete !== true) {
  throw new Error("Invoice complete update failed (no row updated).");
}

  let nextOps = resolveOpsStatus({
    status: job.status,
    job_type: job.job_type,
    scheduled_date: job.scheduled_date,
    window_start: job.window_start,
    window_end: job.window_end,
    field_complete: job.field_complete,
    certs_complete: job.certs_complete,
    invoice_complete: true,
    current_ops_status: job.ops_status,
  });

  // ECC guard:
  // failed/retest-needed jobs may still be invoiced, but invoice completion
  // should not auto-resolve the operational failure state.
  if ((job.job_type ?? "").toLowerCase() === "ecc") {
    const { data: runs, error: runsErr } = await supabase
      .from("ecc_test_runs")
      .select("is_completed, computed_pass, override_pass")
      .eq("job_id", jobId);

    if (runsErr) throw new Error(runsErr.message);

    const hasFailedCompletedRun = (runs ?? []).some((r: any) => {
      if (!r?.is_completed) return false;
      if (r?.override_pass === false) return true;
      if (r?.override_pass === true) return false;
      return r?.computed_pass === false;
    });

    if (hasFailedCompletedRun) {
      nextOps =
        job.ops_status === "retest_needed"
          ? "retest_needed"
          : "failed";
    }
  }

  const { error: opsErr } = await supabase
    .from("jobs")
    .update({ ops_status: nextOps })
    .eq("id", jobId);

  if (opsErr) throw opsErr;

  const { error: eventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Invoice marked complete",
    meta: {
      changes: [
        { field: "invoice_complete", from: !!job.invoice_complete, to: true },
        { field: "ops_status", from: job.ops_status ?? null, to: nextOps },
      ],
    },
  });

  if (eventErr) throw eventErr;

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}`);
}
export async function updateJobOpsDetailsFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get('job_id');
  if (typeof jobId !== 'string' || !jobId) throw new Error('Missing job_id');

  const { data: beforeJob, error: beforeErr } = await supabase
    .from('jobs')
    .select('ops_status, pending_info_reason, follow_up_date, next_action_note, action_required_by')
    .eq('id', jobId)
    .single();

  if (beforeErr) throw new Error(beforeErr.message);

  const before: OpsSnapshot = {
    ops_status: beforeJob.ops_status ?? null,
    pending_info_reason: beforeJob.pending_info_reason ?? null,
    follow_up_date: beforeJob.follow_up_date ?? null,
    next_action_note: beforeJob.next_action_note ?? null,
    action_required_by: beforeJob.action_required_by ?? null,
  };
  const opsStatusRaw = formData.get("ops_status");
  const ops_status = isOpsStatus(opsStatusRaw) ? opsStatusRaw : before.ops_status;
  const pendingInfoReasonRaw = formData.get('pending_info_reason');
  const followUpDateRaw = formData.get('follow_up_date');
  const nextActionNoteRaw = formData.get('next_action_note');
  const actionRequiredByRaw = formData.get('action_required_by');

  const pending_info_reason =
    typeof pendingInfoReasonRaw === 'string' && pendingInfoReasonRaw.trim()
      ? pendingInfoReasonRaw.trim()
      : null;

  const next_action_note =
    typeof nextActionNoteRaw === 'string' && nextActionNoteRaw.trim()
      ? nextActionNoteRaw.trim()
      : null;

  const follow_up_date =
    typeof followUpDateRaw === 'string' && followUpDateRaw.trim()
      ? followUpDateRaw.trim()
      : null;

  const action_required_by = isActionRequiredBy(actionRequiredByRaw) ? actionRequiredByRaw : null;

  const after: OpsSnapshot = {
    ...before,
    ops_status,
    pending_info_reason,
    follow_up_date,
    next_action_note,
    action_required_by,
  };

  const changes = buildOpsChanges(before, after);
  if (changes.length === 0) return;

  const { error: updateErr } = await supabase
    .from('jobs')
    .update({
      ops_status,
      pending_info_reason,
      follow_up_date,
      next_action_note,
      action_required_by,
    })
    .eq('id', jobId);

  if (updateErr) throw new Error(updateErr.message);

  const { error: eventErr } = await supabase.from('job_events').insert({
    job_id: jobId,
    event_type: 'ops_update',
    message: 'Ops details updated',
    meta: { changes, source: 'job_detail' },
  });

  if (eventErr) throw new Error(eventErr.message);
}

export async function releasePendingInfoAndRecompute(jobId: string, source = "manual_release_pending_info"): Promise<string | null> {
  const supabase = await createClient();

  const { data: before, error: beforeErr } = await supabase
    .from("jobs")
    .select(
      "id, status, job_type, ops_status, field_complete, certs_complete, invoice_complete, scheduled_date, window_start, window_end"
    )
    .eq("id", jobId)
    .single();

  if (beforeErr) throw new Error(beforeErr.message);
  if (!before?.id) throw new Error("Job not found");

  const currentOps = String(before.ops_status ?? "").trim().toLowerCase();
  if (currentOps !== "pending_info") return before.ops_status ?? null;

  const isEcc = String(before.job_type ?? "").trim().toLowerCase() === "ecc";
  const isFieldCompleteOrCompleted =
    Boolean(before.field_complete) ||
    String(before.status ?? "").trim().toLowerCase() === "completed";

  let nextOps: string | null = null;

  if (isEcc && isFieldCompleteOrCompleted) {
    const hasSchedule =
      Boolean(before.scheduled_date) ||
      Boolean(before.window_start) ||
      Boolean(before.window_end);

    await forceSetOpsStatus(jobId, hasSchedule ? "scheduled" : "need_to_schedule");
    await evaluateEccOpsStatus(jobId);

    const { data: afterEcc, error: afterEccErr } = await supabase
      .from("jobs")
      .select("ops_status")
      .eq("id", jobId)
      .single();

    if (afterEccErr) throw new Error(afterEccErr.message);
    nextOps = afterEcc?.ops_status ?? null;
  } else {
    nextOps = resolveOpsStatus({
      status: before.status,
      job_type: before.job_type,
      scheduled_date: before.scheduled_date,
      window_start: before.window_start,
      window_end: before.window_end,
      field_complete: before.field_complete,
      certs_complete: before.certs_complete,
      invoice_complete: before.invoice_complete,
      current_ops_status: before.ops_status,
    });

    const { error: upErr } = await supabase
      .from("jobs")
      .update({ ops_status: nextOps })
      .eq("id", jobId);

    if (upErr) throw new Error(upErr.message);
  }

  const changes = buildOpsChanges(
    {
      ops_status: before.ops_status ?? null,
      pending_info_reason: null,
      follow_up_date: null,
      next_action_note: null,
      action_required_by: null,
    },
    {
      ops_status: nextOps,
      pending_info_reason: null,
      follow_up_date: null,
      next_action_note: null,
      action_required_by: null,
    }
  );

  if (changes.length > 0) {
    const { error: eventErr } = await supabase.from("job_events").insert({
      job_id: jobId,
      event_type: "ops_update",
      message: "Pending info released and status recomputed",
      meta: {
        changes,
        source,
      },
    });

    if (eventErr) throw new Error(eventErr.message);
  }

  return nextOps;
}

export async function releasePendingInfoAndRecomputeFromForm(formData: FormData): Promise<void> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  if (!jobId) throw new Error("Missing job_id");

  await releasePendingInfoAndRecompute(jobId, "manual_release_pending_info");

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?tab=ops`);
}

export async function updateJobOpsFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  const opsStatusRaw = formData.get("ops_status");

  if (typeof jobId !== "string" || !jobId) {
    throw new Error("Missing job_id");
  }

  if (typeof opsStatusRaw !== "string" || !opsStatusRaw.trim()) {
    throw new Error("Missing ops_status");
  }

  const allowedManualOpsStatuses = [
    "need_to_schedule",
    "scheduled",
    "pending_info",
    "on_hold",
  ] as const;

  const isAllowedManualOpsStatus = (
    value: string
  ): value is (typeof allowedManualOpsStatuses)[number] =>
    allowedManualOpsStatuses.includes(
      value as (typeof allowedManualOpsStatuses)[number]
    );

  if (!isAllowedManualOpsStatus(opsStatusRaw)) {
    throw new Error("Invalid manual ops_status");
  }

  // BEFORE
  const { data: beforeJob, error: beforeErr } = await supabase
    .from("jobs")
    .select(
      "ops_status, pending_info_reason, follow_up_date, next_action_note, action_required_by"
    )
    .eq("id", jobId)
    .single();

  if (beforeErr) throw new Error(beforeErr.message);

  const before: OpsSnapshot = {
    ops_status: beforeJob.ops_status ?? null,
    pending_info_reason: beforeJob.pending_info_reason ?? null,
    follow_up_date: beforeJob.follow_up_date ?? null,
    next_action_note: beforeJob.next_action_note ?? null,
    action_required_by: beforeJob.action_required_by ?? null,
  };

  const nextOpsStatus = opsStatusRaw;

  const after: OpsSnapshot = { ...before, ops_status: nextOpsStatus };

  const changes = buildOpsChanges(before, after);
  if (changes.length === 0) return;

  // UPDATE
  const { error: updateErr } = await supabase
    .from("jobs")
    .update({ ops_status: nextOpsStatus })
    .eq("id", jobId);

  if (updateErr) throw new Error(updateErr.message);

  // LOG
  const { error: eventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Ops status updated",
    meta: {
      changes,
      source: "job_detail",
      manual_allowed: true,
    },
  });

  if (eventErr) throw new Error(eventErr.message);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?tab=ops`);
}

export async function markJobFieldCompleteFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  if (typeof jobId !== "string" || !jobId) throw new Error("Missing job_id");

  const { data: beforeJob, error: beforeErr } = await supabase
    .from("jobs")
    .select(
      "id, status, job_type, ops_status, field_complete, field_complete_at, scheduled_date, window_start, window_end, certs_complete, invoice_complete"
    )
    .eq("id", jobId)
    .single();

  if (beforeErr) throw new Error(beforeErr.message);
  if (!beforeJob?.id) throw new Error("Job not found");

  const beforeOps = beforeJob.ops_status ?? null;
  const beforeFieldComplete = Boolean(beforeJob.field_complete ?? false);

  console.error("[FIELD_COMPLETE]", {
    jobId,
    before_status: beforeJob.status ?? null,
    before_ops_status: beforeOps,
    before_field_complete: beforeFieldComplete,
    job_type: beforeJob.job_type ?? null,
  });

  // ECC guard rail:
  // require at least one completed run with a real result before field completion
  if ((beforeJob.job_type ?? "").toLowerCase() === "ecc") {
    const { data: runs, error: runErr } = await supabase
      .from("ecc_test_runs")
      .select("id, is_completed, computed_pass, override_pass")
      .eq("job_id", jobId)
      .eq("is_completed", true);

    if (runErr) throw new Error(runErr.message);

    const hasMeaningfulCompletedRun = (runs ?? []).some((r: any) => {
      if (!r?.is_completed) return false;
      if (r?.override_pass === true || r?.override_pass === false) return true;
      if (r?.computed_pass === true || r?.computed_pass === false) return true;
      return false;
    });

    if (!hasMeaningfulCompletedRun) {
      revalidatePath(`/jobs/${jobId}`);
      redirect(`/jobs/${jobId}?notice=ecc_test_required`);
    }
  }

  // Idempotent: already field-complete
  if (beforeFieldComplete) {
    revalidatePath(`/jobs/${jobId}`);
    redirect(`/jobs/${jobId}`);
  }

  // First mark the field lifecycle complete.
  // For non-ECC jobs, also compute next ops here.
  let nextOps = resolveOpsStatus({
    status: "completed",
    job_type: beforeJob.job_type ?? null,
    scheduled_date: beforeJob.scheduled_date ?? null,
    window_start: beforeJob.window_start ?? null,
    window_end: beforeJob.window_end ?? null,
    field_complete: true,
    certs_complete: beforeJob.certs_complete ?? false,
    invoice_complete: beforeJob.invoice_complete ?? false,
    current_ops_status: beforeJob.ops_status ?? null,
  });

  const isEccJob = (beforeJob.job_type ?? "").toLowerCase() === "ecc";

  const baseUpdate: Record<string, any> = {
    status: "completed",
    field_complete: true,
    field_complete_at: new Date().toISOString(),
  };

  // Non-ECC keeps local resolver behavior
  if (!isEccJob) {
    baseUpdate.ops_status = nextOps;
  }

  const { error: updateErr } = await supabase
    .from("jobs")
    .update(baseUpdate)
    .eq("id", jobId);

  if (updateErr) throw new Error(updateErr.message);

  // ECC jobs: hand canonical ops resolution back to evaluateEccOpsStatus(jobId)
  if (isEccJob) {
    console.error("[FIELD_COMPLETE]", {
      jobId,
      phase: "before_ecc_eval",
      attempted_next_status: "paperwork_required",
      before_ops_status: beforeOps,
    });

    await evaluateEccOpsStatus(jobId);

    const { data: afterJob, error: afterErr } = await supabase
      .from("jobs")
      .select("ops_status")
      .eq("id", jobId)
      .single();

    if (afterErr) throw new Error(afterErr.message);
    nextOps = afterJob?.ops_status ?? null;

    console.error("[FIELD_COMPLETE]", {
      jobId,
      phase: "after_ecc_eval",
      final_ops_status: nextOps,
    });
  }

  const changes = [
    { field: "status", from: beforeJob.status ?? null, to: "completed" },
    { field: "field_complete", from: beforeFieldComplete, to: true },
    { field: "ops_status", from: beforeOps, to: nextOps },
  ];

  const { error: eventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Field work marked complete",
    meta: {
      changes,
      source: "job_detail_top_action",
    },
  });

  if (eventErr) throw new Error(eventErr.message);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}?banner=field_complete`);
}