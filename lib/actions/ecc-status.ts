// lib/actions/ecc-status.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { setOpsStatusIfNotManual } from "@/lib/actions/ops-status";
import {
  getRequiredTestsForProjectType,
} from "@/lib/ecc/rule-profiles";
import type { EccTestType } from "@/lib/ecc/test-registry";

/**
 * ECC Ops rules
 * - If ANY required ECC test FAILS -> ops_status = "failed"
 * - If ALL required ECC tests PASS -> ops_status = "paperwork_required"
 * - Otherwise: do not force to paperwork/failed (leave schedule/call list/etc)
 *
 * Guardrails:
 * - Does NOT overwrite manual locks because we call setOpsStatusIfNotManual.
 * - Does NOT close jobs; paperwork completion remains separate.
 * - ECC resolution must come from completed ecc_test_runs.
 */
export async function evaluateEccOpsStatus(jobId: string): Promise<void> {
  const supabase = await createClient();

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, job_type, project_type")
    .eq("id", jobId)
    .single();

  if (jobErr) throw new Error(jobErr.message);
  if (!job) return;
  if (job.job_type !== "ecc") return;

  const { data: systems, error: sysErr } = await supabase
    .from("job_systems")
    .select("id")
    .eq("job_id", jobId);

  if (sysErr) throw new Error(sysErr.message);

  const systemIds = (systems ?? [])
    .map((s) => String(s.id || "").trim())
    .filter(Boolean);

  const { data: runs, error: runsErr } = await supabase
    .from("ecc_test_runs")
    .select("id, system_id, test_type, is_completed, computed_pass, override_pass, data, computed")
    .eq("job_id", jobId);

  if (runsErr) throw new Error(runsErr.message);

  const isCompleted = (r: any) => Boolean(r?.is_completed);

  const getOutcome = (r: any): "pass" | "fail" | "unknown" => {
    const applicability = String(r?.data?.applicability || "").trim().toLowerCase();

    // backend-ready escape hatch:
    // count explicit not_applicable as satisfied only when completed
    if (applicability === "not_applicable" && isCompleted(r)) return "pass";

    if (r?.override_pass === true) return "pass";
    if (r?.override_pass === false) return "fail";

    if (r?.computed_pass === true) return "pass";
    if (r?.computed_pass === false) return "fail";

    return "unknown";
  };

  const required = getRequiredTestsForProjectType(job.project_type) as EccTestType[];

  // If this profile has no required tests, do not force ECC ops transitions.
  if (required.length === 0) return;

  type Cell = { hasCompleted: boolean; anyFail: boolean; anyPass: boolean };
  const matrix: Record<string, Record<string, Cell>> = {};

  for (const sid of systemIds) {
    matrix[sid] = {};
    for (const t of required) {
      matrix[sid][t] = {
        hasCompleted: false,
        anyFail: false,
        anyPass: false,
      };
    }
  }

  for (const r of runs ?? []) {
    const sid = String(r?.system_id || "").trim();
    const t = String(r?.test_type || "").trim().toLowerCase();

    if (!sid) continue;                 // ignore legacy null system rows
    if (!matrix[sid]) continue;         // only evaluate declared systems
    if (!(t in matrix[sid])) continue;  // only evaluate required tests
    if (!isCompleted(r)) continue;

    matrix[sid][t].hasCompleted = true;

    const outcome = getOutcome(r);
    if (outcome === "fail") matrix[sid][t].anyFail = true;
    if (outcome === "pass") matrix[sid][t].anyPass = true;
  }

  const anyRequiredFail = systemIds.some((sid) =>
    required.some((t) => matrix[sid]?.[t]?.anyFail)
  );

  if (anyRequiredFail) {
    await setOpsStatusIfNotManual(jobId, "failed");
    return;
  }

  const allRequiredPassed =
    systemIds.length > 0 &&
    systemIds.every((sid) =>
      required.every((t) => matrix[sid]?.[t]?.hasCompleted && matrix[sid]?.[t]?.anyPass)
    );

  if (allRequiredPassed) {
    await setOpsStatusIfNotManual(jobId, "paperwork_required");
    return;
  }

  // Otherwise: leave existing ops status alone.
}