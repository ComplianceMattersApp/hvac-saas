// lib/actions/ecc-status.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { setOpsStatusIfNotManual, forceSetOpsStatus } from "@/lib/actions/ops-status";
import { resolveEccScenario } from "@/lib/ecc/scenario-resolver";
import { resolveOpsStatus } from "@/lib/utils/ops-status";
import type { OpsStatus } from "@/lib/actions/ops-status";
import type { EccTestType } from "@/lib/ecc/test-registry";

/**
 * ECC Ops rules
 * - If ANY required ECC test FAILS -> ops_status = "failed"
 * - If ALL required ECC tests PASS -> ops_status = "paperwork_required"
 * - Otherwise: do not force to paperwork/failed (leave schedule/call list/etc)
 *
 * Guardrails:
 * - Does NOT overwrite true admin holds (pending_info, on_hold) when setting ops_status.
 * - Canonical failure (anyRequiredFail) uses forceSetOpsStatus to override ECC-derived
 *   states like paperwork_required that must be re-derivable after test edits.
 * - Does NOT close jobs; paperwork completion remains separate.
 * - ECC resolution must come from completed ecc_test_runs.
 * - Required tests are resolved PER SYSTEM using the ECC scenario engine.
 */
export async function evaluateEccOpsStatus(jobId: string): Promise<void> {
  const supabase = await createClient();

  const { data: job, error: jobErr } = await supabase
  .from("jobs")
  .select("id, status, job_type, project_type, field_complete, certs_complete, invoice_complete, ops_status, scheduled_date, window_start, window_end")
  .eq("id", jobId)
  .single();

  if (jobErr) throw new Error(jobErr.message);
  if (!job) {
    console.error("[ECC_EVAL]", { jobId, reason: "job_not_found" });
    return;
  }

  if (job.job_type !== "ecc") {
    console.error("[ECC_EVAL]", {
      jobId,
      reason: "non_ecc_job",
      job_type: job.job_type ?? null,
      current_ops_status: job.ops_status ?? null,
    });
    return;
  }

  const isFieldComplete = Boolean((job as any)?.field_complete);

  const { data: systems, error: sysErr } = await supabase
    .from("job_systems")
    .select("id")
    .eq("job_id", jobId);

  if (sysErr) throw new Error(sysErr.message);

  const systemIds = (systems ?? [])
    .map((s) => String(s.id || "").trim())
    .filter(Boolean);

  const { data: equipmentRows, error: eqErr } = await supabase
    .from("job_equipment")
    .select("system_id, component_type, equipment_role")
    .eq("job_id", jobId);

  if (eqErr) throw new Error(eqErr.message);

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

  // Resolve required ECC tests PER SYSTEM using the scenario engine.
  const requiredBySystem: Record<string, EccTestType[]> = {};

  for (const sid of systemIds) {
    const systemEquipment = (equipmentRows ?? []).filter(
      (eq: any) => String(eq?.system_id ?? "").trim() === sid
    );

    const scenarioResult = resolveEccScenario({
      projectType: job.project_type,
      systemEquipment,
    });

    requiredBySystem[sid] = scenarioResult.suggestedTests
      .filter((t) => t.required)
      .map((t) => t.testType as EccTestType);
  }

  // If there are no required tests across all systems, do not force ECC ops transitions.
  const hasAnyRequiredTests = systemIds.some((sid) => (requiredBySystem[sid]?.length ?? 0) > 0);
  if (!hasAnyRequiredTests) {
    if (isFieldComplete) {
      const setResult = await setOpsStatusIfNotManual(jobId, "paperwork_required");
      console.error("[ECC_EVAL]", {
        jobId,
        current_ops_status: job.ops_status ?? null,
        computed_next_status: "paperwork_required",
        reason: "field_complete_no_required_tests",
        manual_lock_prevented: setResult.manualLockPrevented,
        final_ops_status: setResult.finalStatus,
      });
      return;
    }

    console.error("[ECC_EVAL]", {
      jobId,
      current_ops_status: job.ops_status ?? null,
      reason: "no_required_tests",
      field_complete: isFieldComplete,
    });
    return;
  }

  type Cell = { hasCompleted: boolean; anyFail: boolean; anyPass: boolean };
  const matrix: Record<string, Record<string, Cell>> = {};

  for (const sid of systemIds) {
    matrix[sid] = {};
    for (const t of requiredBySystem[sid] ?? []) {
      matrix[sid][t] = {
        hasCompleted: false,
        anyFail: false,
        anyPass: false,
      };
    }
  }

  for (const r of runs ?? []) {
    const sid = String(r?.system_id || "").trim();
    const t = String(r?.test_type || "").trim().toLowerCase() as EccTestType;

    if (!sid) continue; // ignore legacy null system rows
    if (!matrix[sid]) continue; // only evaluate declared systems
    if (!(t in matrix[sid])) continue; // only evaluate required tests for that system
    if (!isCompleted(r)) continue;

    matrix[sid][t].hasCompleted = true;

    const outcome = getOutcome(r);
    if (outcome === "fail") matrix[sid][t].anyFail = true;
    if (outcome === "pass") matrix[sid][t].anyPass = true;
  }

  const anyRequiredFail = systemIds.some((sid) =>
    (requiredBySystem[sid] ?? []).some((t) => matrix[sid]?.[t]?.anyFail)
  );

  // True admin holds must never be overridden by ECC evaluation.
  // Everything else (paperwork_required, retest_needed, invoice_required, closed, …)
  // is an ECC-derived or workflow state that canonical failure MUST be able to override.
  const ECC_HARD_LOCKS = new Set<string>(["pending_info", "on_hold"]);

  if (anyRequiredFail) {
    const currentOps = job.ops_status ?? "";
    const { data: correctionResolutionEvent, error: correctionResolutionErr } = await supabase
      .from("job_events")
      .select("id")
      .eq("job_id", jobId)
      .eq("event_type", "failure_resolved_by_correction_review")
      .limit(1)
      .maybeSingle();

    if (correctionResolutionErr) throw new Error(correctionResolutionErr.message);

    if (correctionResolutionEvent?.id) {
      const resolvedNextStatus = resolveOpsStatus({
        status: job.status ?? null,
        job_type: job.job_type ?? null,
        scheduled_date: (job as any).scheduled_date ?? null,
        window_start: (job as any).window_start ?? null,
        window_end: (job as any).window_end ?? null,
        field_complete: Boolean((job as any)?.field_complete),
        certs_complete: Boolean((job as any)?.certs_complete),
        invoice_complete: Boolean((job as any)?.invoice_complete),
        current_ops_status: "paperwork_required",
      });
      const allowedResolvedStatuses: ReadonlySet<OpsStatus> = new Set([
        "paperwork_required",
        "invoice_required",
        "closed",
      ]);

      if (!allowedResolvedStatuses.has(resolvedNextStatus as OpsStatus)) {
        throw new Error(`Unexpected resolved ECC status: ${resolvedNextStatus}`);
      }

      if (ECC_HARD_LOCKS.has(currentOps)) {
        console.error("[ECC_EVAL]", {
          jobId,
          current_ops_status: currentOps,
          computed_next_status: resolvedNextStatus,
          reason: "required_test_failed_resolved_by_correction_review",
          manual_lock_prevented: true,
          final_ops_status: currentOps,
        });
      } else {
        await forceSetOpsStatus(jobId, resolvedNextStatus as OpsStatus);
        console.error("[ECC_EVAL]", {
          jobId,
          current_ops_status: currentOps,
          computed_next_status: resolvedNextStatus,
          reason: "required_test_failed_resolved_by_correction_review",
          manual_lock_prevented: false,
          final_ops_status: resolvedNextStatus,
        });
      }
      return;
    }

    if (ECC_HARD_LOCKS.has(currentOps)) {
      console.error("[ECC_EVAL]", {
        jobId,
        current_ops_status: currentOps,
        computed_next_status: "failed",
        reason: "required_test_failed",
        manual_lock_prevented: true,
        final_ops_status: currentOps,
      });
    } else {
      await forceSetOpsStatus(jobId, "failed");
      console.error("[ECC_EVAL]", {
        jobId,
        current_ops_status: currentOps,
        computed_next_status: "failed",
        reason: "required_test_failed",
        manual_lock_prevented: false,
        final_ops_status: "failed",
      });
    }
    return;
  }

  const allRequiredPassed =
    systemIds.length > 0 &&
    systemIds.every((sid) => {
      const required = requiredBySystem[sid] ?? [];
      if (required.length === 0) return true;

      return required.every((t) => matrix[sid]?.[t]?.hasCompleted && matrix[sid]?.[t]?.anyPass);
    });

  if (allRequiredPassed) {
    const setResult = await setOpsStatusIfNotManual(jobId, "paperwork_required");
    console.error("[ECC_EVAL]", {
      jobId,
      current_ops_status: job.ops_status ?? null,
      computed_next_status: "paperwork_required",
      reason: "all_required_passed",
      manual_lock_prevented: setResult.manualLockPrevented,
      final_ops_status: setResult.finalStatus,
    });
    return;
  }

  if (isFieldComplete) {
    const setResult = await setOpsStatusIfNotManual(jobId, "paperwork_required");
    console.error("[ECC_EVAL]", {
      jobId,
      current_ops_status: job.ops_status ?? null,
      computed_next_status: "paperwork_required",
      reason: "field_complete_fallback",
      manual_lock_prevented: setResult.manualLockPrevented,
      final_ops_status: setResult.finalStatus,
    });
    return;
  }

  console.error("[ECC_EVAL]", {
    jobId,
    current_ops_status: job.ops_status ?? null,
    computed_next_status: null,
    reason: "incomplete_required_tests",
    field_complete: isFieldComplete,
  });

// Otherwise: leave existing ops status alone.
}