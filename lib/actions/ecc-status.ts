// lib/actions/ecc-status.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { setOpsStatusIfNotManual } from "@/lib/actions/ops-status";

/**
 * ECC Ops rules (Thread 14):
 * - If ANY required ECC test FAILS -> ops_status = "failed"
 * - If ALL required ECC tests PASS -> ops_status = "paperwork_required"
 * - Otherwise: do not force to paperwork/failed (leave schedule/call list/etc)
 *
 * IMPORTANT:
 * - Does NOT overwrite manual locks (pending_info, on_hold) because we call setOpsStatusIfNotManual.
 * - Does NOT close jobs; paperwork completion will be its own action.
 *
 * Assumption for now (matches your defaults):
 * - For project_type in ("alteration", "all_new") the required tests are:
 *   duct_leakage, airflow, refrigerant_charge
 *
 * If you later add a "required_tests" config for new construction, we can upgrade this.
 */
const REQUIRED_FOR_STANDARD = ["duct_leakage", "airflow", "refrigerant_charge"] as const;
type TestType = (typeof REQUIRED_FOR_STANDARD)[number];

export async function evaluateEccOpsStatus(jobId: string): Promise<void> {
  const supabase = await createClient();

  // Load job so we only apply ECC automation to ECC jobs
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, job_type, project_type")
    .eq("id", jobId)
    .single();

    const { data: systems, error: sysErr } = await supabase
  .from("job_systems")
  .select("id")
  .eq("job_id", jobId);

if (sysErr) throw new Error(sysErr.message);

const systemIds = (systems ?? []).map((s) => s.id).filter(Boolean);

  if (jobErr) throw new Error(jobErr.message);
  if (!job) return;
  if (job.job_type !== "ecc") return;


  // Pull all completed runs for this job
  // NOTE: we don't assume exact column names beyond common ones.
  // You have ecc_test_runs.system_id working and "Complete" working already.
  // We are relying on:
  // - test_type (text)
  // - status or completed_at
  // - result (pass/fail) OR pass_fail (or similar)
  //
  // If any of these columns differ, we’ll adjust in one edit after you show me the table columns.
  const { data: runs, error: runsErr } = await supabase
  .from("ecc_test_runs")
  .select("id, system_id, test_type, is_completed, computed_pass, override_pass")

  .eq("job_id", jobId);

  if (runsErr) throw new Error(runsErr.message);


  // Helper: normalize completion + pass/fail from whatever your run schema uses
 const isCompleted = (r: any) => Boolean(r?.is_completed);



const getOutcome = (r: any): "pass" | "fail" | "unknown" => {
  // override_pass wins if set (can be true or false)
  if (r?.override_pass === true) return "pass";
  if (r?.override_pass === false) return "fail";

  // otherwise use computed_pass
  if (r?.computed_pass === true) return "pass";
  if (r?.computed_pass === false) return "fail";

  return "unknown";
};


  // Decide required tests for this job (for now: alteration/all_new = standard set)
  const projectType = String(job.project_type || "").toLowerCase();

  const required: TestType[] =
    projectType === "alteration" || projectType === "all_new" || projectType === "allnew"
      ? [...REQUIRED_FOR_STANDARD]
      : [...REQUIRED_FOR_STANDARD]; // safe default until new construction config exists

  // Build per-system, per-test outcomes
const matrix: Record<string, Record<string, { hasCompleted: boolean; anyFail: boolean; anyPass: boolean }>> = {};

for (const sid of systemIds) {
  matrix[sid] = {};
  for (const t of required) {
    matrix[sid][t] = { hasCompleted: false, anyFail: false, anyPass: false };
  }
}

for (const r of runs ?? []) {
  const sid = String(r?.system_id || "").trim();
  const t = String(r?.test_type || "").toLowerCase();
  if (!sid) continue;                 // ignore legacy null system rows
  if (!matrix[sid]) continue;         // only evaluate declared systems
  if (!(t in matrix[sid])) continue;  // only required tests

  if (isCompleted(r)) {
    matrix[sid][t].hasCompleted = true;
    const outcome = getOutcome(r);
    if (outcome === "fail") matrix[sid][t].anyFail = true;
    if (outcome === "pass") matrix[sid][t].anyPass = true;
  }
}



  // Rule 1: any required test failed => failed
  const anyRequiredFail = systemIds.some((sid) =>
  required.some((t) => matrix[sid]?.[t]?.anyFail)
);

if (anyRequiredFail) {
  await setOpsStatusIfNotManual(jobId, "failed");
  return;
}

  // Rule 2: all required tests completed and have at least one pass => paperwork_required
  const allRequiredPassed = systemIds.length > 0 && systemIds.every((sid) =>
  required.every((t) => matrix[sid]?.[t]?.hasCompleted && matrix[sid]?.[t]?.anyPass)
);

if (allRequiredPassed) {
  await setOpsStatusIfNotManual(jobId, "paperwork_required");
  return;
}

  // Otherwise: do nothing (keep scheduled/call list/etc)
}
