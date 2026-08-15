// lib/actions/ecc-test-entry-actions.ts
//
// ECC test data entry server actions: per-test save and save-and-complete flows,
// test run management, override handling, and retest readiness.
// Split out of job-actions.ts; see docs/ACTIVE/JOB_ACTIONS_DECOMPOSITION_PLAN.md.

"use server";

import { evaluateEccOpsStatus } from "@/lib/actions/ecc-status";
import { insertInternalNotificationForEvent } from "@/lib/actions/notification-actions";
import { buildAhriVerificationPayload, ensureAhriVerificationCompletionFields } from "@/lib/ecc/ahri-verification";
import { buildAirFilterDevicePayload, ensureAirFilterDeviceCompletionFields } from "@/lib/ecc/air-filter-device";
import { buildFanWattDrawPayload, ensureFanWattDrawCompletionFields } from "@/lib/ecc/fan-watt-draw";
import { buildLocalMechanicalExhaustPayload, ensureLocalMechanicalExhaustCompletionFields } from "@/lib/ecc/local-mechanical-exhaust";
import { buildQiiEnv22InsulationPayload, ensureQiiEnv22InsulationCompletionFields } from "@/lib/ecc/qii-env22-insulation";
import { getThresholdRuleForTest } from "@/lib/ecc/rule-profiles";
import { isDuctlessMiniSplitSystem } from "@/lib/ecc/scenario-resolver";
import { isEccTestApplicableToSystem } from "@/lib/ecc/test-applicability";
import { createClient } from "@/lib/supabase/server";
import { isHeatingOnlyEquipment } from "@/lib/utils/equipment-display";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cleanupOrphanSystem,
  insertJobEvent,
  notifyInternalNextActionChanged,
  redirectToTests,
  requireInternalEccTestsAccess,
  requireInternalScopedJobAccessOrRedirect,
  requireOperationalScopedJobMutationAccessOrRedirect,
  resolveSystemIdForRun,
  revalidateEccProjectionConsumers,
} from "@/lib/actions/job-actions-shared";

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

function normalizeRefrigerantChargePhotoResult(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pass" || normalized === "fail" || normalized === "needs_review") {
    return normalized;
  }
  return null;
}

const DUCT_LEAKAGE_EXCEPTION_LABELS: Record<string, string> = {
  asbestos: "Asbestos",
  smoke_test: "Smoke Test",
  under_40_ft_ducting: "< 40' of ducting",
  other: "Other",
};

const AIRFLOW_EXCEPTION_LABELS: Record<string, string> = {
  best_obtainable: "Best Obtainable",
  other: "Other",
};

function resolveOverrideSelectionFromForm(formData: FormData) {
  const ductException = String(formData.get("duct_exception") || "").trim().toLowerCase();
  const ductExceptionLabel = DUCT_LEAKAGE_EXCEPTION_LABELS[ductException] ?? null;
  if (ductExceptionLabel) {
    const reasonRaw = String(formData.get("override_reason") || "").trim();
    const reasonOptional = ductException === "asbestos" || ductException === "under_40_ft_ducting";
    return {
      overridePass: true,
      // Keep the selected exception durable even when its optional notes are blank.
      overrideReason: reasonRaw ? `${ductExceptionLabel}: ${reasonRaw}` : ductExceptionLabel,
      missingReason: !reasonOptional && !reasonRaw,
      ductExceptionSelected: true,
    };
  }

  const override = String(formData.get("override") || "none").trim().toLowerCase();
  const reasonRaw = String(formData.get("override_reason") || "").trim();

  let overridePass: boolean | null = null;
  if (override === "pass") overridePass = true;
  else if (override === "fail") overridePass = false;

  return {
    overridePass,
    overrideReason: overridePass !== null ? reasonRaw : null,
    missingReason: overridePass !== null && !reasonRaw,
    ductExceptionSelected: false,
  };
}

function resolveAirflowExceptionSelectionFromForm(formData: FormData) {
  const airflowException = String(formData.get("airflow_exception") || "").trim().toLowerCase();
  const airflowExceptionLabel = AIRFLOW_EXCEPTION_LABELS[airflowException] ?? null;
  const reasonRaw = String(formData.get("airflow_exception_reason") || "").trim();

  if (!airflowExceptionLabel) {
    return {
      exceptionSelected: false,
      overridePass: null as boolean | null,
      overrideReason: null as string | null,
      missingReason: false,
    };
  }

  return {
    exceptionSelected: true,
    overridePass: true,
    overrideReason: reasonRaw ? `${airflowExceptionLabel}: ${reasonRaw}` : null,
    missingReason: !reasonRaw,
  };
}

function ensureMeasuredAirflowPresentForCompletion(formData: FormData) {
  const rawMeasuredAirflow = String(formData.get("measured_total_cfm") || "").trim();
  if (!rawMeasuredAirflow) {
    throw new Error("Enter the measured airflow result before completing this test.");
  }

  const measuredAirflow = Number(rawMeasuredAirflow);
  if (!Number.isFinite(measuredAirflow)) {
    throw new Error("Enter the measured airflow result before completing this test.");
  }
}

export async function requestRetestReadyFromPortal(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  if (!jobId) throw new Error("Missing job_id");

  // Slice-4A: measurement-only timing (FIELD_ACTION_TIMING_DEBUG=true to enable; no behavior change)
  const _ftEnabled = process.env.FIELD_ACTION_TIMING_DEBUG === "true";
  const _ftStart = Date.now();
  let _ftPhaseStart = _ftStart;
  const _ftPhases: Record<string, number> = {};
  const _ftCompletePhase = (name: string) => {
    if (!_ftEnabled) return;
    const now = Date.now();
    _ftPhases[name] = now - _ftPhaseStart;
    _ftPhaseStart = now;
  };
  const _ftEmit = (branch: string, target: string) => {
    if (!_ftEnabled) return;
    console.info(
      "[retest-ready-timing]",
      JSON.stringify({
        jobId,
        branch,
        totalMs: Date.now() - _ftStart,
        redirectTarget: target,
        phasesMs: {
          parseInput: _ftPhases.parseInput ?? 0,
          contractorAuth: _ftPhases.contractorAuth ?? 0,
          jobOwnershipRead: _ftPhases.jobOwnershipRead ?? 0,
          ineligibleDuplicateChecks: _ftPhases.ineligibleDuplicateChecks ?? 0,
          eventNotificationWrite: _ftPhases.eventNotificationWrite ?? 0,
          revalidation: _ftPhases.revalidation ?? 0,
        },
      }),
    );
  };

  const supabase = await createClient();
  if (_ftEnabled) _ftPhaseStart = Date.now(); // exclude createClient overhead; parseInput was trivial
  _ftCompletePhase("parseInput");

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
  _ftCompletePhase("contractorAuth");

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, contractor_id, ops_status, job_type")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job?.id || String(job.contractor_id ?? "") !== String(cu.contractor_id ?? "")) {
    throw new Error("Job not found.");
  }
  _ftCompletePhase("jobOwnershipRead");

  const jobType = String(job.job_type ?? "").trim().toLowerCase();
  if (jobType !== "ecc") {
    _ftEmit("guard:not_ecc", `/portal/jobs/${jobId}?banner=retest_ready_requires_ecc`);
    redirect(`/portal/jobs/${jobId}?banner=retest_ready_requires_ecc`);
  }

  if (String(job.ops_status ?? "").toLowerCase() !== "failed") {
    _ftEmit("guard:not_failed", `/portal/jobs/${jobId}?banner=retest_ready_not_failed`);
    redirect(`/portal/jobs/${jobId}?banner=retest_ready_not_failed`);
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
    _ftEmit("guard:open_retest_exists", `/portal/jobs/${jobId}?banner=retest_ready_already_received`);
    redirect(`/portal/jobs/${jobId}?banner=retest_ready_already_received`);
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

  if (existingRequest?.id) {
    _ftCompletePhase("ineligibleDuplicateChecks");
    _ftEmit("guard:duplicate_request", `/portal/jobs/${jobId}?banner=retest_ready_already_received`);
    revalidatePath(`/portal/jobs/${jobId}`);
    redirect(`/portal/jobs/${jobId}?banner=retest_ready_already_received`);
  }
  _ftCompletePhase("ineligibleDuplicateChecks");

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
  _ftCompletePhase("eventNotificationWrite");

  revalidatePath("/ops");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/portal/jobs/${jobId}`);
  revalidatePath("/portal");
  _ftCompletePhase("revalidation");

  _ftEmit("success", `/portal/jobs/${jobId}?banner=retest_ready_requested`);
  redirect(`/portal/jobs/${jobId}?banner=retest_ready_requested`);
}

export async function confirmEccRetestReadyFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  if (!jobId) throw new Error("Missing job_id");

  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status")
    .eq("id", jobId)
    .is("deleted_at", null)
    .single();

  if (jobErr) throw jobErr;

  const jobType = String(job?.job_type ?? "").trim().toLowerCase();
  const opsStatus = String(job?.ops_status ?? "").trim().toLowerCase();

  if (jobType !== "ecc" || !["failed", "pending_office_review", "retest_needed"].includes(opsStatus)) {
    redirect(`/jobs/${jobId}?tab=ops&banner=retest_ready_not_eligible`);
  }

  const { data: activeRetestChild, error: activeChildErr } = await supabase
    .from("jobs")
    .select("id")
    .eq("parent_job_id", jobId)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeChildErr) throw activeChildErr;
  if (activeRetestChild?.id) {
    redirect(`/jobs/${jobId}?tab=ops&banner=retest_already_exists`);
  }

  const { data: latestRequest, error: requestErr } = await supabase
    .from("job_events")
    .select("id, created_at")
    .eq("job_id", jobId)
    .eq("event_type", "retest_ready_requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (requestErr) throw requestErr;

  if (opsStatus !== "retest_needed") {
    const { error: updateErr } = await supabase
      .from("jobs")
      .update({ ops_status: "retest_needed" })
      .eq("id", jobId);

    if (updateErr) throw updateErr;
  }

  await insertJobEvent({
    supabase,
    jobId,
    event_type: "retest_ready_confirmed",
    meta: {
      previous_ops_status: opsStatus || null,
      next_ops_status: "retest_needed",
      source: latestRequest?.id ? "retest_ready_requested" : "internal_review",
      source_event_id: latestRequest?.id ?? null,
    },
    userId,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/ops");

  redirect(`/jobs/${jobId}?tab=ops&banner=retest_ready_confirmed#followup`);
}

export async function saveEccTestOverrideFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  // hardening: these must be provided by the form
  const systemIdRaw = String(formData.get("system_id") || "").trim();
  const testTypeRaw = String(formData.get("test_type") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  // ✅ validate testType against allowed pills
  const allowed = new Set(["duct_leakage", "airflow", "refrigerant_charge", "custom"]);
  const testType = allowed.has(testTypeRaw) ? testTypeRaw : "";
  const { overridePass, overrideReason, missingReason } = resolveOverrideSelectionFromForm(formData);

  if (missingReason) {
    redirectToTests({
      jobId,
      testType,
      systemId: systemIdRaw || null,
      notice: "override_reason_required",
    });
  }

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({
    supabase,
    jobId,
    testRunId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  // Only update override fields, never touch data/computed
  const { data: updated, error } = await supabase
    .from("ecc_test_runs")
    .update({
      override_pass: overridePass,
      override_reason: overrideReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .select("id, job_id, test_type, override_pass, override_reason")
    .maybeSingle();

  if (error) throw error;
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
    if (systemId) redirectToTests({ jobId, systemId, notice: "results_saved" });
    redirectToTests({ jobId, notice: "results_saved" });
  }

  if (!systemId) {
    // explicit error OR redirect without s; pick one:
    // throw new Error("Missing system_id");
    redirectToTests({ jobId, testType, notice: "results_saved" });
  }

  redirectToTests({ jobId, testType, systemId, notice: "results_saved" });
}

function getDuctLeakagePercentAllowed(projectType: string) {
  const normalizedProjectType = String(projectType ?? "").trim().toLowerCase();

  if (
    normalizedProjectType === "all_new" ||
    normalizedProjectType === "allnew" ||
    normalizedProjectType === "new" ||
    normalizedProjectType === "new_construction" ||
    normalizedProjectType === "new_prescriptive"
  ) {
    return 0.05;
  }

  if (normalizedProjectType === "alteration") {
    return 0.1;
  }

  return null;
}

function computeDuctLeakagePayload(formData: FormData, projectType: string) {
  const num = (key: string) => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) ? val : null;
  };

  const measuredLeakageCfm = num("measured_duct_leakage_cfm");
  const tonnage = num("tonnage");
  const heatingOutputBtu = num("heating_output_btu");
  const heatingInputBtu = num("heating_input_btu");
  const heatingEfficiencyPercent = num("heating_efficiency_percent");

  const airflowMethodRaw = String(formData.get("airflow_method") || "").trim().toLowerCase();
  const airflowMethod = airflowMethodRaw === "heating" ? "heating" : "cooling";

  const leakagePercentTarget = num("leakage_percent_target");
  let leakagePercentAllowed = getDuctLeakagePercentAllowed(projectType);

  const derivedHeatingOutputBtu =
    heatingOutputBtu != null
      ? heatingOutputBtu
      : heatingInputBtu != null &&
        heatingEfficiencyPercent != null &&
        heatingEfficiencyPercent > 0 &&
        heatingEfficiencyPercent <= 100
      ? heatingInputBtu * (heatingEfficiencyPercent / 100)
      : null;

  const heatingOutputKbtu =
    airflowMethod === "heating" && derivedHeatingOutputBtu != null
      ? derivedHeatingOutputBtu / 1000
      : null;

  const nominalAirflowCfm =
    airflowMethod === "heating"
      ? heatingOutputKbtu != null
        ? heatingOutputKbtu * 21.7
        : null
      : tonnage != null
      ? tonnage * 400
      : null;

  let maxLeakageCfm =
    nominalAirflowCfm != null && leakagePercentAllowed != null
      ? nominalAirflowCfm * leakagePercentAllowed
      : null;

  const failures: string[] = [];
  const warnings: string[] = [];

  if (leakagePercentTarget != null) {
    if (leakagePercentTarget > 0 && leakagePercentTarget <= 100) {
      leakagePercentAllowed = leakagePercentTarget / 100;
      maxLeakageCfm = nominalAirflowCfm != null ? nominalAirflowCfm * leakagePercentAllowed : null;
    } else {
      warnings.push("Leakage target must be between 0 and 100 percent");
    }
  }

  if (airflowMethod === "cooling" && tonnage == null) {
    warnings.push("Missing tonnage");
  }

  if (airflowMethod === "heating") {
    if (derivedHeatingOutputBtu == null) {
      warnings.push("Missing heating output BTU or input BTU with efficiency");
    }
    if (
      heatingInputBtu != null &&
      (heatingEfficiencyPercent == null || heatingEfficiencyPercent <= 0 || heatingEfficiencyPercent > 100)
    ) {
      warnings.push("Heating efficiency must be between 0 and 100 when using input BTU");
    }
  }

  if (measuredLeakageCfm == null) warnings.push("Missing measured duct leakage");
  if (leakagePercentAllowed == null) warnings.push("No leakage rule profile found for project type");

  let computedPass: boolean | null = null;

  if (measuredLeakageCfm != null && maxLeakageCfm != null) {
    computedPass = measuredLeakageCfm <= maxLeakageCfm;
    if (computedPass === false) {
      failures.push(`Duct leakage above max (${maxLeakageCfm} CFM)`);
    }
  }

  const data = {
    measured_duct_leakage_cfm: measuredLeakageCfm,
    leakage_percent_target:
      leakagePercentAllowed != null ? Number((leakagePercentAllowed * 100).toFixed(3)) : null,
    tonnage,
    airflow_method: airflowMethod,
    heating_output_btu: heatingOutputBtu,
    heating_input_btu: heatingInputBtu,
    heating_efficiency_percent: heatingEfficiencyPercent,
    derived_nominal_airflow_cfm: nominalAirflowCfm,
    notes: String(formData.get("notes") || "").trim() || null,
  };

  const computed = {
    airflow_method: airflowMethod,
    base_airflow_cfm: nominalAirflowCfm,
    leakage_percent_allowed: leakagePercentAllowed,
    leakage_percent_allowed_display:
      leakagePercentAllowed != null ? leakagePercentAllowed * 100 : null,
    max_leakage_cfm: maxLeakageCfm,
    measured_duct_leakage_cfm: measuredLeakageCfm,
    heating_output_kbtu: heatingOutputKbtu,
    failures,
    warnings,
  };

  return { data, computed, computedPass };
}

function ensureMeasuredDuctLeakagePresentForCompletion(formData: FormData) {
  const rawMeasuredLeakage = String(formData.get("measured_duct_leakage_cfm") || "").trim();
  if (!rawMeasuredLeakage) {
    throw new Error("Enter the measured duct leakage result before completing this test.");
  }

  const measuredLeakage = Number(rawMeasuredLeakage);
  if (!Number.isFinite(measuredLeakage)) {
    throw new Error("Enter the measured duct leakage result before completing this test.");
  }
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
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const [{ data: jobRuleContext, error: jobRuleContextErr }, { data: systemEquipmentRows, error: systemEquipmentErr }] =
    await Promise.all([
      supabase.from("jobs").select("project_type").eq("id", jobId).maybeSingle(),
      supabase
        .from("job_equipment")
        .select("component_type, equipment_role")
        .eq("job_id", jobId)
        .eq("system_id", systemId),
    ]);

  if (jobRuleContextErr) throw jobRuleContextErr;
  if (systemEquipmentErr) throw systemEquipmentErr;

  const systemEquipment = systemEquipmentRows ?? [];
  const hasHeatingOnlyEquipment = systemEquipment.some((eq: any) =>
    isHeatingOnlyEquipment(String(eq?.equipment_role ?? eq?.component_type ?? ""))
  );
  const hasCoolingEquipment = systemEquipment.some((eq: any) => {
    const tokens = [
      String(eq?.equipment_role ?? "").trim().toLowerCase(),
      String(eq?.component_type ?? "").trim().toLowerCase(),
    ].map((token) => token.replace(/[\s-]+/g, "_"));

    return tokens.some(
      (token) =>
        token.includes("outdoor") ||
        token.includes("condenser") ||
        token.includes("heat_pump") ||
        token.includes("compressor") ||
        token.includes("package")
    );
  });

  if (
    !isEccTestApplicableToSystem(testType, {
      heatOnlySystem: hasHeatingOnlyEquipment && !hasCoolingEquipment,
      ductlessMiniSplit: isDuctlessMiniSplitSystem(systemEquipment),
      projectType: (jobRuleContext as any)?.project_type,
    })
  ) {
    throw new Error("This test type is not applicable to the selected system and project type.");
  }

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

  // Standard test types remain unique per system. Custom verifications are
  // named, independently addressable runs, so a system may have several.
  if (testType !== "custom") {
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

  let insertedRunId: string | null = null;
  let insErr: any = null;

  if (testType === "custom") {
    const { data: insertedRun, error } = await supabase
      .from("ecc_test_runs")
      .insert(payload)
      .select("id")
      .single();
    insertedRunId = String(insertedRun?.id ?? "").trim() || null;
    insErr = error;
  } else {
    const result = await supabase.from("ecc_test_runs").insert(payload);
    insErr = result.error;
  }

  if (insErr) throw insErr;

  revalidatePath(`/jobs/${jobId}/tests`);
  redirectToTests({
    jobId,
    testType,
    systemId,
    testRunId: insertedRunId,
  });
}

export async function deleteEccTestRunFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({
    supabase,
    jobId,
    testRunId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

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

await evaluateEccOpsStatus(jobId);

revalidateEccProjectionConsumers(jobId);
}

export async function saveRefrigerantChargeDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

    // Override / exemption flags (no schema change; stored + enforced via override_pass)
  const photoTaken = formData.get("rc_photo_taken") === "on";
  const photoResult = photoTaken
    ? normalizeRefrigerantChargePhotoResult(formData.get("rc_photo_result"))
    : null;
  const exemptPackageUnit = formData.get("rc_exempt_package_unit") === "on";
  const exemptConditions = formData.get("rc_exempt_conditions") === "on";
  const overrideDetails =
    String(formData.get("rc_override_details") || formData.get("rc_photo_details") || "").trim() || null;

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
  if (isChargeExempt && !overrideDetails) {
    const systemIdFromForm = String(formData.get("system_id") || "").trim();
    const q = new URLSearchParams();
    q.set("t", "refrigerant_charge");
    if (systemIdFromForm) q.set("s", systemIdFromForm);
    q.set("notice", "override_reason_required");
    redirect(`/jobs/${jobId}/tests?${q.toString()}`);
  }
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
    // Photo Taken evidence
    verification_method: photoTaken ? "photo_taken" : null,
    photo_taken_timestamp: photoTaken ? new Date().toISOString() : null,
    photo_evidence_result: photoResult,
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
    subcool_tolerance_f: 3,
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

  // Photo Taken is evidence-based, not a numeric pass
  const computedPass = photoTaken
    ? null
    : isChargeExempt
      ? true
      : isBlocked
        ? null
        : hasCoreCompute
          ? failures.length === 0
          : null;

  if (photoTaken) {
    warnings.push("User confirmed gauge photo was taken (photo attestation)");
    if (photoResult === "pass") warnings.push("Photo evidence result selected: Pass");
    if (photoResult === "fail") warnings.push("Photo evidence result selected: Fail");
    if (photoResult === "needs_review") warnings.push("Photo evidence result selected: Needs Review");
    if (overrideDetails) warnings.push(`Photo attestation notes: ${overrideDetails}`);
  }

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
    status: photoTaken ? "photo_evidence" : isChargeExempt ? "exempt" : isBlocked ? "blocked" : "computed",
    blocked: isChargeExempt ? [] : blocked,
    measured_subcool_f: measuredSubcool,
    measured_superheat_f: measuredSuperheat,
    subcool_delta_f: subcoolDelta,
    rules,
    failures: isChargeExempt ? [] : failures,
    warnings,
  };

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

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
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "refrigerant_charge", systemId, notice: "results_saved" });
}

export async function saveAirflowDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();
  const systemIdFromForm = String(formData.get("system_id") || "").trim() || null;
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

  const cfmPerTon = resolveAirflowCfmPerTon(projectType, formData);
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

  const {
    exceptionSelected: airflowExceptionSelected,
    overridePass: airflowExceptionPass,
    overrideReason: airflowExceptionReason,
    missingReason: airflowExceptionMissingReason,
  } = resolveAirflowExceptionSelectionFromForm(formData);

  if (airflowExceptionMissingReason) {
    redirectToTests({
      jobId,
      testType: "airflow",
      systemId: systemIdFromForm,
      notice: "override_reason_required",
    });
  }

  const data = {
    measured_total_cfm: measuredTotalCfm,
    tonnage,
    cfm_per_ton_target: cfmPerTon,
    cfm_per_ton_required: cfmPerTon,
    notes: String(formData.get("notes") || "").trim() || null,

    // breadcrumb for reporting/audit
    airflow_override_applied: airflowExceptionSelected,
    airflow_override_reason: airflowExceptionReason,
  };

  const computed = {
    cfm_per_ton_required: cfmPerTon,
    required_total_cfm: requiredTotalCfm,
    measured_total_cfm: measuredTotalCfm,
    failures,
    warnings,

    // breadcrumb for reporting/audit
    override_mode: airflowExceptionSelected ? "field_exception" : null,
  };

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      override_pass: airflowExceptionPass,
      override_reason: airflowExceptionReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm,
  });

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "airflow", systemId, notice: "results_saved" });
}

export async function saveFanWattDrawDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const payload = buildFanWattDrawPayload(formData);

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: payload.data,
      computed: payload.computed,
      computed_pass: payload.computedPass,
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
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "fan_watt_draw", systemId, notice: "results_saved" });
}

export async function saveAirFilterDeviceDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const payload = buildAirFilterDevicePayload(formData);

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: payload.data,
      computed: payload.computed,
      computed_pass: payload.computedPass,
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
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "air_filter_device", systemId, notice: "results_saved" });
}

export async function saveAndCompleteAirFilterDeviceFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  ensureAirFilterDeviceCompletionFields(formData);

  const payload = buildAirFilterDevicePayload(formData);

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: payload.data,
      computed: payload.computed,
      computed_pass: payload.computedPass,
      override_pass: null,
      override_reason: null,
      updated_at: new Date().toISOString(),
      is_completed: true,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "air_filter_device", systemId, notice: "test_completed" });
}

export async function saveAndCompleteFanWattDrawFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  ensureFanWattDrawCompletionFields(formData);

  const payload = buildFanWattDrawPayload(formData);

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: payload.data,
      computed: payload.computed,
      computed_pass: payload.computedPass,
      override_pass: null,
      override_reason: null,
      updated_at: new Date().toISOString(),
      is_completed: true,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "fan_watt_draw", systemId, notice: "test_completed" });
}

export async function saveAndCompleteCustomVerificationFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();
  const label = String(formData.get("custom_label") || "").trim();
  const notes = String(formData.get("custom_notes") || "").trim();
  const resultRaw = String(formData.get("custom_result") || "").trim().toLowerCase();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  // A named, judged verification is the whole point of this test type. Refusing
  // here beats silently saving a nameless run with an unknown outcome.
  if (!label || !notes || (resultRaw !== "pass" && resultRaw !== "fail")) {
    redirectToTests({
      jobId,
      testType: "custom",
      systemId,
      notice: "custom_verification_incomplete",
    });
  }

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: {
        custom_label: label,
        custom_notes: notes,
        custom_result: resultRaw,
      },
      computed: { source: "manual_custom_verification" },
      computed_pass: resultRaw === "pass",
      override_pass: null,
      override_reason: null,
      updated_at: new Date().toISOString(),
      is_completed: true,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .eq("test_type", "custom");

  if (error) throw error;

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({
    jobId,
    testType: "custom",
    systemId,
    testRunId,
    notice: "test_completed",
  });
}

export async function saveAhriVerificationDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const payload = buildAhriVerificationPayload(formData);

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: payload.data,
      computed: payload.computed,
      computed_pass: payload.computedPass,
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
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "ahri_verification", systemId, notice: "results_saved" });
}

export async function saveAndCompleteAhriVerificationFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  ensureAhriVerificationCompletionFields(formData);

  const payload = buildAhriVerificationPayload(formData);

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: payload.data,
      computed: payload.computed,
      computed_pass: payload.computedPass,
      override_pass: null,
      override_reason: null,
      updated_at: new Date().toISOString(),
      is_completed: true,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "ahri_verification", systemId, notice: "test_completed" });
}

export async function saveLocalMechanicalExhaustDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const payload = buildLocalMechanicalExhaustPayload(formData);

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: payload.data,
      computed: payload.computed,
      computed_pass: payload.computedPass,
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
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "local_mechanical_exhaust", systemId, notice: "results_saved" });
}

export async function saveAndCompleteLocalMechanicalExhaustFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  ensureLocalMechanicalExhaustCompletionFields(formData);
  const payload = buildLocalMechanicalExhaustPayload(formData);

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: payload.data,
      computed: payload.computed,
      computed_pass: payload.computedPass,
      override_pass: null,
      override_reason: null,
      updated_at: new Date().toISOString(),
      is_completed: true,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "local_mechanical_exhaust", systemId, notice: "test_completed" });
}

export async function saveQiiEnv22InsulationDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const payload = buildQiiEnv22InsulationPayload(formData);

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: payload.data,
      computed: payload.computed,
      computed_pass: payload.computedPass,
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
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "qii_insulation", systemId, notice: "results_saved" });
}

export async function saveAndCompleteQiiEnv22InsulationFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  ensureQiiEnv22InsulationCompletionFields(formData);
  const payload = buildQiiEnv22InsulationPayload(formData);

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: payload.data,
      computed: payload.computed,
      computed_pass: payload.computedPass,
      override_pass: null,
      override_reason: null,
      updated_at: new Date().toISOString(),
      is_completed: true,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "qii_insulation", systemId, notice: "test_completed" });
}

function resolveAirflowCfmPerTon(projectType: string, formData?: FormData): number {
  const formValueRaw = formData ? String(formData.get("cfm_per_ton_target") || "").trim() : "";
  const formValue = formValueRaw ? Number(formValueRaw) : null;

  if (formValue != null && Number.isFinite(formValue) && formValue > 0) {
    return formValue;
  }

  const threshold = getThresholdRuleForTest(projectType, "airflow");
  const rawValue = threshold?.unit === "cfm_per_ton" ? threshold.targetValue : null;
  const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
}

export async function saveDuctLeakageDataFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();
  const systemIdFromForm = String(formData.get("system_id") || "").trim() || null;
  const projectType = String(formData.get("project_type") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const { data, computed, computedPass } = computeDuctLeakagePayload(formData, projectType);
  const { overridePass, overrideReason, missingReason } = resolveOverrideSelectionFromForm(formData);

  if (missingReason) {
    redirectToTests({
      jobId,
      testType: "duct_leakage",
      systemId: systemIdFromForm,
      notice: "override_reason_required",
    });
  }

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({
    supabase,
    jobId,
    testRunId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      override_pass: overridePass,
      override_reason: overrideReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm,
  });

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "duct_leakage", systemId, notice: "results_saved" });
}

export async function completeEccTestRunFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

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
  const { data, computed, computedPass } = computeDuctLeakagePayload(formData, projectType);

  // Persist compute before allowing completion
  const { error: saveErr } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      updated_at: new Date().toISOString(),
      visit_id: visitId, // also ensure visit_id is stamped
      system_id: systemId, // ensure system_id is stamped
    })
    .eq("id", run.id)
    .eq("job_id", jobId);

  if (saveErr) throw saveErr;

  // refresh local run values for later logic
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


  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: run.test_type, systemId, notice: "test_completed" });
}

export async function saveAndCompleteDuctLeakageFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();
  const systemIdFromForm = String(formData.get("system_id") || "").trim() || null;
  const projectType = String(formData.get("project_type") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const { data, computed, computedPass } = computeDuctLeakagePayload(formData, projectType);
  const { overridePass, overrideReason, missingReason, ductExceptionSelected } = resolveOverrideSelectionFromForm(formData);

  if (missingReason) {
    redirectToTests({
      jobId,
      testType: "duct_leakage",
      systemId: systemIdFromForm,
      notice: "override_reason_required",
    });
  }

  if (!ductExceptionSelected) {
    ensureMeasuredDuctLeakagePresentForCompletion(formData);
  }

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  // Get system_id and visit_id
  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm,
  });

  let visitId: string | null = null;
  const { data: run } = await supabase
    .from("ecc_test_runs")
    .select("visit_id")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (run?.visit_id) {
    visitId = run.visit_id;
  } else {
    const { data: v } = await supabase
      .from("job_visits")
      .select("id")
      .eq("job_id", jobId)
      .order("visit_number", { ascending: true })
      .limit(1)
      .single();
    visitId = v?.id ?? null;
  }

  // Save data + mark completed
  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      override_pass: overridePass,
      override_reason: overrideReason,
      updated_at: new Date().toISOString(),
      is_completed: true,
      visit_id: visitId,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "duct_leakage", systemId, notice: "test_completed" });
}

export async function saveAndCompleteAirflowFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();
  const systemIdFromForm = String(formData.get("system_id") || "").trim() || null;
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

  const cfmPerTon = resolveAirflowCfmPerTon(projectType, formData);
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

  const {
    exceptionSelected: airflowExceptionSelected,
    overridePass: airflowExceptionPass,
    overrideReason: airflowExceptionReason,
    missingReason: airflowExceptionMissingReason,
  } = resolveAirflowExceptionSelectionFromForm(formData);

  if (airflowExceptionMissingReason) {
    redirectToTests({
      jobId,
      testType: "airflow",
      systemId: systemIdFromForm,
      notice: "override_reason_required",
    });
  }

  if (!airflowExceptionSelected) {
    ensureMeasuredAirflowPresentForCompletion(formData);
  }

  const data = {
    measured_total_cfm: measuredTotalCfm,
    tonnage,
    cfm_per_ton_target: cfmPerTon,
    cfm_per_ton_required: cfmPerTon,
    notes: String(formData.get("notes") || "").trim() || null,
    airflow_override_applied: airflowExceptionSelected,
    airflow_override_reason: airflowExceptionReason,
  };

  const computed = {
    cfm_per_ton_required: cfmPerTon,
    required_total_cfm: requiredTotalCfm,
    measured_total_cfm: measuredTotalCfm,
    failures,
    warnings,
    override_mode: airflowExceptionSelected ? "field_exception" : null,
  };

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  // Get system_id and visit_id
  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm,
  });

  let visitId: string | null = null;
  const { data: run } = await supabase
    .from("ecc_test_runs")
    .select("visit_id")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (run?.visit_id) {
    visitId = run.visit_id;
  } else {
    const { data: v } = await supabase
      .from("job_visits")
      .select("id")
      .eq("job_id", jobId)
      .order("visit_number", { ascending: true })
      .limit(1)
      .single();
    visitId = v?.id ?? null;
  }

  // Save data + mark completed
  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data,
      computed,
      computed_pass: computedPass,
      override_pass: airflowExceptionPass,
      override_reason: airflowExceptionReason,
      updated_at: new Date().toISOString(),
      is_completed: true,
      visit_id: visitId,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "airflow", systemId, notice: "test_completed" });
}

export async function saveAndCompleteRefrigerantChargeFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const num = (key: string) => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) ? val : null;
  };

  // Override / exemption flags (no schema change; stored + enforced via override_pass)
  const photoTaken = formData.get("rc_photo_taken") === "on";
  const photoResult = photoTaken
    ? normalizeRefrigerantChargePhotoResult(formData.get("rc_photo_result"))
    : null;
  const exemptPackageUnit = formData.get("rc_exempt_package_unit") === "on";
  const exemptConditions = formData.get("rc_exempt_conditions") === "on";
  const overrideDetails =
    String(formData.get("rc_override_details") || formData.get("rc_photo_details") || "").trim() || null;

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

  if (isChargeExempt && !overrideDetails) {
    const q = new URLSearchParams();
    q.set("t", "refrigerant_charge");
    const systemIdFromForm = String(formData.get("system_id") || "").trim();
    if (systemIdFromForm) q.set("s", systemIdFromForm);
    q.set("notice", "override_reason_required");
    redirect(`/jobs/${jobId}/tests?${q.toString()}`);
  }

  if (photoTaken && !photoResult) {
    const q = new URLSearchParams();
    q.set("t", "refrigerant_charge");
    const systemIdFromForm = String(formData.get("system_id") || "").trim();
    if (systemIdFromForm) q.set("s", systemIdFromForm);
    q.set("notice", "photo_result_required");
    redirect(`/jobs/${jobId}/tests?${q.toString()}`);
  }

  const data = {
    lowest_return_air_db_f: num("lowest_return_air_db_f"),
    condenser_air_entering_db_f: num("condenser_air_entering_db_f"),
    liquid_line_temp_f: num("liquid_line_temp_f"),
    liquid_line_pressure_psig: num("liquid_line_pressure_psig"),
    condenser_sat_temp_f: num("condenser_sat_temp_f"),
    target_subcool_f: num("target_subcool_f"),
    suction_line_temp_f: num("suction_line_temp_f"),
    suction_line_pressure_psig: num("suction_line_pressure_psig"),
    evaporator_sat_temp_f: num("evaporator_sat_temp_f"),
    outdoor_temp_f: num("outdoor_temp_f"),
    refrigerant_type: String(formData.get("refrigerant_type") || "").trim() || null,
    filter_drier_installed: formData.get("filter_drier_installed") === "on",
    notes: String(formData.get("notes") || "").trim() || null,
    // Photo Taken evidence
    verification_method: photoTaken ? "photo_taken" : null,
    photo_taken_timestamp: photoTaken ? new Date().toISOString() : null,
    photo_evidence_result: photoResult,
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

  const rules = {
    indoor_min_f: 70,
    outdoor_min_f: 55,
    subcool_tolerance_f: 3,
    superheat_max_f: 25,
    filter_drier_required: true,
  };

  const failures: string[] = [];
  const warnings: string[] = [];
  const blocked: string[] = [];

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

  if (rules.filter_drier_required && !data.filter_drier_installed) {
    failures.push("Filter drier not confirmed");
  }

  if (measuredSuperheat != null) {
    if (measuredSuperheat >= rules.superheat_max_f) {
      failures.push(`Superheat >= ${rules.superheat_max_f}F`);
    }
  } else {
    warnings.push("Missing superheat inputs");
  }

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

  const hasCoreCompute =
    measuredSubcool != null &&
    measuredSuperheat != null &&
    data.target_subcool_f != null;

  const isBlocked = blocked.length > 0;

  const isPhotoEvidence = photoTaken;

  const computedPass = photoTaken
    ? null
    : isChargeExempt
      ? true
      : isBlocked
        ? null
        : hasCoreCompute
          ? failures.length === 0
          : null;

  if (photoTaken) {
    warnings.push("User confirmed gauge photo was taken (photo attestation)");
    if (photoResult === "pass") warnings.push("Photo evidence result selected: Pass");
    if (photoResult === "fail") warnings.push("Photo evidence result selected: Fail");
    if (photoResult === "needs_review") warnings.push("Photo evidence result selected: Needs Review");
    if (overrideDetails) warnings.push(`Photo attestation notes: ${overrideDetails}`);
  }

  if (isChargeExempt) {
    warnings.push(
      exemptPackageUnit
        ? "Charge verification exempt: package unit"
        : "Charge verification override: conditions not met"
    );
    if (overrideDetails) warnings.push(`Override details: ${overrideDetails}`);
  }

  const computed = {
    status: photoTaken ? "photo_evidence" : isChargeExempt ? "exempt" : isBlocked ? "blocked" : "computed",
    blocked: isChargeExempt ? [] : blocked,
    measured_subcool_f: measuredSubcool,
    measured_superheat_f: measuredSuperheat,
    subcool_delta_f: subcoolDelta,
    rules,
    failures: isChargeExempt ? [] : failures,
    warnings,
  };
  const photoOverridePass =
    photoResult === "pass" ? true : photoResult === "fail" ? false : null;
  const photoOverrideReason =
    photoResult === "pass"
      ? "Refrigerant charge photo evidence marked Pass by field user"
      : photoResult === "fail"
        ? "Refrigerant charge photo evidence marked Fail by field user"
        : null;

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  // Get system_id and visit_id
  const systemId = await resolveSystemIdForRun({
    supabase,
    jobId,
    testRunId,
    systemIdFromForm: String(formData.get("system_id") || "").trim() || null,
  });

  let visitId: string | null = null;
  const { data: run } = await supabase
    .from("ecc_test_runs")
    .select("visit_id")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (run?.visit_id) {
    visitId = run.visit_id;
  } else {
    const { data: v } = await supabase
      .from("job_visits")
      .select("id")
      .eq("job_id", jobId)
      .order("visit_number", { ascending: true })
      .limit(1)
      .single();
    visitId = v?.id ?? null;
  }

  // Load existing data so we don't wipe fields
  const { data: existingRun, error: loadErr } = await supabase
    .from("ecc_test_runs")
    .select("data")
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .single();

  if (loadErr) throw loadErr;

  const existingData = (existingRun?.data ?? {}) as Record<string, any>;
  const mergedData = { ...existingData, ...data };

  // Save data + mark completed
  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      data: {
        ...mergedData,
        charge_exempt: isChargeExempt || undefined,
        charge_exempt_reason: chargeExemptReason || undefined,
        charge_exempt_details: overrideDetails || undefined,
      },
      computed,
      computed_pass: computedPass,
      override_pass: isChargeExempt ? true : photoOverridePass,
      override_reason: isChargeExempt ? fullOverrideReason : photoOverrideReason,
      updated_at: new Date().toISOString(),
      is_completed: true,
      visit_id: visitId,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  await evaluateEccOpsStatus(jobId);
  revalidateEccProjectionConsumers(jobId);
  redirectToTests({ jobId, testType: "refrigerant_charge", systemId, notice: "test_completed" });
}

export async function addAlterationCoreTestsFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const systemId = String(formData.get("system_id") || "").trim();
  const equipmentId = String(formData.get("equipment_id") || "").trim(); // optional

  if (!jobId) throw new Error("Missing job_id");
  if (!systemId) throw new Error("Missing system_id");

  const supabase = await createClient();
  const scoped = await requireInternalEccTestsAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

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
