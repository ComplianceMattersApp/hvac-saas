'use server';

import { createClient } from '@/lib/supabase/server';

const OPS_STATUSES = [
  'need_to_schedule',
  'pending_info',
  'on_hold',
  'retest_needed',
  'ready',
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
    .from('jobs')
    .update({ ops_status: opsStatus })
    .eq('id', jobId);

  if (updateErr) throw new Error(updateErr.message);

  // LOG
  const { error: eventErr } = await supabase.from('job_events').insert({
    job_id: jobId,
    event_type: 'ops_update',
    message: 'Ops status updated',
    meta: { changes, source: 'job_detail' },
  });

  if (eventErr) throw new Error(eventErr.message);
}
