'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveOpsStatus } from "@/lib/utils/ops-status";

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

export async function markCertsCompleteFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  if (typeof jobId !== "string" || !jobId) throw new Error("Missing job_id");

  // Server-side auth guard: contractors cannot close out jobs
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: cu } = await supabase
    .from("contractor_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (cu) {
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }

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

  // Mark certs complete
  const { error: updErr } = await supabase
    .from("jobs")
    .update({ certs_complete: true })
    .eq("id", jobId);

  if (updErr) throw updErr;

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

  const { data: cu } = await supabase
    .from("contractor_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (cu) {
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }

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

  // Mark invoice complete
  const { error: updErr } = await supabase
    .from("jobs")
    .update({ invoice_complete: true })
    .eq("id", jobId);

  if (updErr) throw updErr;

  // Recompute ops_status using shared resolver
  const nextOps = resolveOpsStatus({
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

export async function updateJobOpsFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get('job_id');
  const opsStatus = formData.get('ops_status');

  if (typeof jobId !== 'string' || !jobId) throw new Error('Missing job_id');
  if (!isOpsStatus(opsStatus)) throw new Error('Invalid ops_status');

  // BEFORE
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
  const ops_status = isOpsStatus(opsStatusRaw)
  ? opsStatusRaw
  : (before.ops_status ?? "need_to_schedule");

  const after: OpsSnapshot = { ...before, ops_status: opsStatus };

  const changes = buildOpsChanges(before, after);
  if (changes.length === 0) return;

  // UPDATE
const { error: updateErr } = await supabase
  .from("jobs")
  .update({ ops_status: opsStatus })
  .eq("id", jobId);

if (updateErr) throw new Error(updateErr.message);

// LOG
const { error: eventErr } = await supabase.from("job_events").insert({
  job_id: jobId,
  event_type: "ops_update",
  message: "Ops status updated",
  meta: { changes, source: "job_detail" },
});

if (eventErr) throw new Error(eventErr.message);

// ✅ force UI refresh LAST
revalidatePath(`/jobs/${jobId}`);
redirect(`/jobs/${jobId}?tab=ops`);
}
export async function markJobFieldCompleteFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const jobId = formData.get("job_id");
  if (typeof jobId !== "string" || !jobId) throw new Error("Missing job_id");

  // Read everything we need in one query
  const { data: beforeJob, error: beforeErr } = await supabase
    .from("jobs")
    .select(
      "status, job_type, ops_status, field_complete, field_complete_at, scheduled_date, window_start, window_end, certs_complete, invoice_complete"
    )
    .eq("id", jobId)
    .single();

  if (beforeErr) throw new Error(beforeErr.message);

  const beforeOps = beforeJob?.ops_status ?? null;
  const beforeFieldComplete = Boolean(beforeJob?.field_complete ?? false);

  // Guard rail: ECC requires at least one completed ecc_test_run
  if ((beforeJob?.job_type ?? "").toLowerCase() === "ecc") {
    const { count, error: runErr } = await supabase
      .from("ecc_test_runs")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("is_completed", true);

    if (runErr) throw new Error(runErr.message);

    if (!count || count < 1) {
      revalidatePath(`/jobs/${jobId}`);
      redirect(`/jobs/${jobId}?notice=ecc_test_required`);
    }
  }

  // Idempotent: if already field-complete / post-field, just bounce back
  if (beforeFieldComplete) {
    revalidatePath(`/jobs/${jobId}`);
    redirect(`/jobs/${jobId}`);
  }

  // 2C: derive the correct ops queue automatically
  const nextOps = resolveOpsStatus({
    status: "completed",
    job_type: beforeJob?.job_type ?? null,
    scheduled_date: beforeJob?.scheduled_date ?? null,
    window_start: beforeJob?.window_start ?? null,
    window_end: beforeJob?.window_end ?? null,
    field_complete: true,
    certs_complete: beforeJob?.certs_complete ?? false,
    invoice_complete: beforeJob?.invoice_complete ?? false,
    current_ops_status: beforeJob?.ops_status ?? null,
  });

  // Update both field status + ops status
  const { error: updateErr } = await supabase
    .from("jobs")
    .update({
      status: "completed",
      ops_status: nextOps,
      field_complete: true,
      field_complete_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (updateErr) throw new Error(updateErr.message);

  // Log
  const changes = [
    { field: "status", from: beforeJob?.status ?? null, to: "completed" },
    { field: "ops_status", from: beforeOps, to: nextOps },
    { field: "field_complete", from: beforeFieldComplete, to: true },
  ];

  const { error: eventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Field work marked complete",
    meta: { changes, source: "job_detail_top_action" },
  });

  if (eventErr) throw new Error(eventErr.message);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  redirect(`/jobs/${jobId}?banner=field_complete`);
}