'use server';

import { createClient } from '@/lib/supabase/server';

function normalizePhone10(raw: string | null | undefined) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits; // last-10 match
}

function normalizeName(raw: string) {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

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

export async function updateJobOpsFromForm(formData: FormData) {
  const supabase = await createClient();

  const jobId = formData.get('job_id');
  const opsStatus = formData.get('ops_status');

  if (typeof jobId !== 'string' || !jobId) {
    return { ok: false, error: 'Missing job_id' };
  }

  if (!isOpsStatus(opsStatus)) {
    return { ok: false, error: 'Invalid ops_status' };
  }

  const { error } = await supabase
    .from('jobs')
    .update({ ops_status: opsStatus })
    .eq('id', jobId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
