//lib/actions/job-actions.ts

"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { deriveScheduleAndOps } from "@/lib/utils/scheduling";
import { findOrCreateCustomer } from "@/lib/customers/findOrCreateCustomer";
 


import {
  updateJobOpsFromForm,
  updateJobOpsDetailsFromForm,
} from "./job-ops-actions";

import { evaluateEccOpsStatus } from "@/lib/actions/ecc-status";


export type JobStatus =
  | "open"
  | "on_the_way"
  | "in_process"
  | "completed"
  | "failed"
  | "cancelled";

type CreateJobInput = {
  ops_status?: string | null;
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

    // Parent event + status resolution
    await insertJobEvent({
      supabase,
      jobId: parentJobId,
      event_type: "retest_passed",
      meta: { child_job_id: childJobId },
    });

    // Resolve parent out of failed if it's currently failed/retest-related
    const { data: parent, error: parentErr } = await supabase
      .from("jobs")
      .select("ops_status")
      .eq("id", parentJobId)
      .maybeSingle();

    if (parentErr) throw parentErr;

    const parentOps = String(parent?.ops_status ?? "").trim() || null;

    // Conservative: only auto-change when parent is in a failure state
    if (parentOps === "failed" || parentOps === "retest_needed") {
      const { error: updErr } = await supabase
        .from("jobs")
        .update({ ops_status: "closed" })
        .eq("id", parentJobId);

      if (updErr) throw updErr;

      await insertJobEvent({
        supabase,
        jobId: parentJobId,
        event_type: "status_changed",
        meta: { from: parentOps, to: "closed", reason: "retest_passed" },
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
}) {
  const { supabase, jobId, event_type } = params;
  const meta = params.meta ?? null;

  const { error } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type,
    meta,
  });

  if (error) throw error;
}


type OpsSnapshot = {
  ops_status: string | null;
  pending_info_reason: string | null;
  follow_up_date: string | null; // keep as string for diffing
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

export async function getContractors() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contractors")
    .select("id, name, phone, email")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
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

  if (!exemptReason) {
    throw new Error("Select Package unit or Conditions not met to mark exempt.");
  }

  const reasonLabel =
    exemptReason === "package_unit"
      ? "Package unit — charge verification not required"
      : "Conditions not met / weather — charge verification override";

  const fullReason = details ? `${reasonLabel}: ${details}` : reasonLabel;

  const supabase = await createClient();

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
  const projectType = String(formData.get("project_type") || "").trim(); // "alteration" | "all_new"

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

  const cfmPerTon = projectType === "all_new" ? 350 : 300;

  const requiredTotalCfm = tonnage != null ? tonnage * cfmPerTon : null;

  const failures: string[] = [];
  const warnings: string[] = [];

  if (tonnage == null) warnings.push("Missing tonnage");
  if (measuredTotalCfm == null) warnings.push("Missing measured total airflow");

  let computedPass: boolean | null = null;

  if (measuredTotalCfm != null && requiredTotalCfm != null) {
    computedPass = measuredTotalCfm < requiredTotalCfm ? false : true;
    if (computedPass === false) failures.push(`Airflow below required (${requiredTotalCfm} CFM)`);
  } else {
    computedPass = null;
  }

  const data = {
    measured_total_cfm: measuredTotalCfm,
    tonnage,
    cfm_per_ton_required: cfmPerTon,
    notes: String(formData.get("notes") || "").trim() || null,
  };

  const computed = {
    cfm_per_ton_required: cfmPerTon,
    required_total_cfm: requiredTotalCfm,
    measured_total_cfm: measuredTotalCfm,
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
  const projectType = String(formData.get("project_type") || "").trim(); // "alteration" | "all_new"

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
  } else {
    computedPass = null;
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
  if (conflict?.id) {
    const { error: delErr } = await supabase
      .from("ecc_test_runs")
      .delete()
      .eq("id", conflict.id)
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

await insertJobEvent({
  supabase,
  jobId,
  event_type: "debug_marker",
  meta: { note: "after_evaluateEccOpsStatus" },
});

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

export async function createJob(input: CreateJobInput): Promise<{ id: string }> {
  const supabase = await createClient();

  const normalizeTimestamptz = (v: any) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  // Reject time-only strings like "T12:00:00.000Z"
  if (s.startsWith("T")) return null;
  return s;
};


  const payload = {
    job_type: input.job_type ?? "ecc",
    project_type: input.project_type ?? "alteration",

    title: input.title,
    job_address: input.job_address ?? null,
    city: input.city,
    scheduled_date: input.scheduled_date,
    status: input.status,
    contractor_id: input.contractor_id ?? null,
    permit_number: input.permit_number ?? null,
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
    .select(
      "id"
    )
    .single();

  if (error) throw error;
  return data as { id: string };
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

/**
 * CREATE: used by /jobs/new form
 */
export async function createJobFromForm(formData: FormData) {
  // ----- basic fields -----
  const jobType = String(formData.get("job_type") || "ecc").trim();
  const projectType = String(formData.get("project_type") || "alteration").trim();

  const contractorIdRaw = formData.get("contractor_id");
  const contractor_id =
    typeof contractorIdRaw === "string" && contractorIdRaw.trim()
      ? contractorIdRaw.trim()
      : null;

  const title = String(formData.get("title") || "").trim();
  const city = String(formData.get("city") || "").trim();

  const titleFinal =
    title ||
    (jobType === "ecc"
      ? `ECC ${projectType.replaceAll("_", " ")} — ${city}`
      : "");

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
  const customerFirstNameRaw = String(formData.get("customer_first_name") || "").trim();
  const customerLastNameRaw = String(formData.get("customer_last_name") || "").trim();
  const customerEmailRaw = String(formData.get("customer_email") || "").trim();
  const jobNotesRaw = String(formData.get("job_notes") || "").trim();
  const jobAddressRaw = String(formData.get("job_address") || "").trim();

  const status = String(formData.get("status") || "open").trim() as JobStatus;

  if (jobType === "service" && !titleFinal) throw new Error("Title is required");
  if (!city) throw new Error("City is required");

// ----- supabase + identity -----
const supabase = await createClient();

const { data: userData, error: userErr } = await supabase.auth.getUser();
if (userErr) throw new Error(userErr.message);

const user = userData?.user ?? null;
const userId = user?.id ?? null;

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
  }
}


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
  const address_line1 =
    String(formData.get("address_line1") || "").trim() ||
    String(formData.get("job_address") || "").trim();

  const existingCustomerId = String(formData.get("customer_id") || "").trim();
  const existingLocationId = String(formData.get("location_id") || "").trim();

  const locationNickname =
    String(formData.get("location_nickname") || "").trim() || null;
  const zip = String(formData.get("zip") || "").trim() || null;

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
    const systems = Array.isArray(equipmentPayload?.systems) ? equipmentPayload.systems : [];
    if (!systems.length) return;

    for (const s of systems) {
      const systemName = String(s?.name || "").trim();
      const comps = Array.isArray(s?.components) ? s.components : [];
      if (!comps.length) continue;

      // Create system (job_systems.name is NOT NULL)
      const { data: createdSystem, error: sysCreateErr } = await supabase
        .from("job_systems")
        .insert({ job_id: jobId, name: systemName })
        .select("id")
        .single();

      if (sysCreateErr) throw sysCreateErr;
      const systemId = createdSystem?.id;
      if (!systemId) throw new Error("Unable to create system_id");

      for (const c of comps) {
        const equipment_role = String(c?.type || "").trim();
        if (!equipment_role) continue; // should never happen if UI is correct

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
          equipment_role,               // NOT NULL in DB
          system_location: systemName,  // optional helper column
          manufacturer,
          model,
          serial,
          tonnage,
          refrigerant_type,
          notes,
        });

        if (eqErr) throw eqErr;
      }
    }
  }

  async function logIntakeSubmitted(jobId: string) {
    await insertJobEvent({
      supabase,
      jobId,
      event_type: "intake_submitted",
      meta: {
        source: contractorIdFinal ? "contractor" : "internal",
        user_id: user?.id ?? null,
        contractor_id: contractorIdFinal,
        job_type: jobType,
        project_type: projectType,
      },
    });
  }

  // ---- Branch 1: existing customer + existing location ----
  if (existingCustomerId && existingLocationId) {
    const created = await createJob({
      job_type: jobType,
      project_type: projectType,
      job_address: jobAddressRaw || null,
      customer_id: existingCustomerId,
      location_id: existingLocationId,

      customer_first_name: customerFirstNameRaw || null,
      customer_last_name: customerLastNameRaw || null,
      customer_email: customerEmailRaw || null,
      job_notes: jobNotesRaw || null,

      title: titleFinal,
      city,
      scheduled_date,
      status,
      contractor_id: contractorIdFinal,
      permit_number: permitNumberRaw ? permitNumberRaw : null,
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

    await insertJobEvent({
      supabase,
      jobId: created.id,
      event_type: "job_created",
      meta: { job_type: jobType, project_type: projectType, source: "customer" },
    });

    await logIntakeSubmitted(created.id);
    await insertEquipmentForJob(created.id);

    revalidatePath(`/jobs/${created.id}`);
    revalidatePath(`/ops`);
    revalidatePath(`/customers/${existingCustomerId}`);

    redirect(`/jobs/${created.id}`);
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

    const { data: location, error: locationErr } = await supabase
      .from("locations")
      .insert({
        customer_id: existingCustomerId,
        nickname: locationNickname,
        address_line1,
        city,
        zip,
      })
      .select("id")
      .single();

    if (locationErr) throw locationErr;

    const created = await createJob({
      job_type: jobType,
      project_type: projectType,
      job_address: jobAddressRaw || null,
      customer_id: existingCustomerId,
      location_id: location.id,

      customer_first_name: customerFirstNameRaw || null,
      customer_last_name: customerLastNameRaw || null,
      customer_email: customerEmailRaw || null,
      job_notes: jobNotesRaw || null,

      title: titleFinal,
      city,
      scheduled_date,
      status,
      contractor_id: contractorIdFinal,
      permit_number: permitNumberRaw ? permitNumberRaw : null,
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

    await insertJobEvent({
      supabase,
      jobId: created.id,
      event_type: "job_created",
      meta: { job_type: jobType, project_type: projectType, source: "customer_new_location" },
    });

    await logIntakeSubmitted(created.id);
    await insertEquipmentForJob(created.id);

    revalidatePath(`/jobs/${created.id}`);
    revalidatePath(`/ops`);
    revalidatePath(`/customers/${existingCustomerId}`);
    revalidatePath(`/locations/${location.id}`);

    redirect(`/jobs/${created.id}`);
  }

  // ---- Branch 3: new customer flow (duplicate-safe) ----
  const { customerId, reused } = await findOrCreateCustomer({
    supabase,
    firstName: customerFirstNameRaw,
    lastName: customerLastNameRaw,
    phone: customerPhoneRaw,
    email: customerEmailRaw,
  });

  const { data: location, error: locationErr } = await supabase
    .from("locations")
    .insert({
      customer_id: customerId,
      address_line1,
      city,
    })
    .select("id")
    .single();

  if (locationErr) throw locationErr;

  const created = await createJob({
    job_type: jobType,
    project_type: projectType,
    job_address: jobAddressRaw || null,
    customer_id: customerId,
    location_id: location.id,

    customer_first_name: customerFirstNameRaw || null,
    customer_last_name: customerLastNameRaw || null,
    customer_email: customerEmailRaw || null,
    job_notes: jobNotesRaw || null,

    title: titleFinal,
    city,
    scheduled_date,
    status,
    contractor_id: contractorIdFinal,
    permit_number: permitNumberRaw ? permitNumberRaw : null,
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

  await insertJobEvent({
    supabase,
    jobId: created.id,
    event_type: "job_created",
    meta: { job_type: jobType, project_type: projectType },
  });

  await logIntakeSubmitted(created.id);
  await insertEquipmentForJob(created.id);

  revalidatePath(`/jobs/${created.id}`);
  revalidatePath(`/ops`);

  const banner = reused ? "customer_reused" : "customer_created";
  redirect(`/jobs/${created.id}?banner=${banner}`);
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

  // ✅ stamp only first time entering on_the_way
  if (next === "on_the_way" && !job?.on_the_way_at) {
    const { error: updErr } = await supabase
      .from("jobs")
      .update({ status: "on_the_way", on_the_way_at: new Date().toISOString() })
      .eq("id", id);

    if (updErr) throw updErr;
  } else {
    const updatePayload: Record<string, any> = { status: next };

    // ✅ When field marks completed, push into Data Entry queue
    // When field marks completed, push into the correct Ops queue
  if (next === "completed") {
  const { data: jt, error: jtErr } = await supabase
    .from("jobs")
    .select("job_type")
    .eq("id", id)
    .single();

  if (jtErr) throw jtErr;

  if (jt?.job_type === "service") {
    updatePayload.ops_status = "invoice_required";
  }
  // ecc: ops_status handled by ECC test evaluation (failed/paperwork_required)
}


    const { error: updErr } = await supabase
      .from("jobs")
      .update(updatePayload)
      .eq("id", id);

    if (updErr) throw updErr;
  }
  // ✅ timeline: status change
  await insertJobEvent({
    supabase,
    jobId: id,
    event_type: "status_changed",
    meta: { from: current, to: next },
  });

  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/ops`);

  redirect(`/jobs/${id}`);
}


export async function updateJobScheduleFromForm(formData: FormData) {
  const id =
    String(formData.get("id") || "").trim() ||
    String(formData.get("job_id") || "").trim();

  if (!id) throw new Error("Job ID is required");

  const permitNumberRaw = String(formData.get("permit_number") || "").trim();

  const supabase = await createClient();

  // Read prior scheduling snapshot so we can log changes
  const { data: before, error: beforeErr } = await supabase
    .from("jobs")
    .select("scheduled_date, window_start, window_end, ops_status")
    .eq("id", id)
    .single();

  if (beforeErr) throw beforeErr;

  // Canonical scheduling + ops_status logic (NO Date parsing)
  const { scheduled_date, window_start, window_end, ops_status } =
    deriveScheduleAndOps(formData);

  await updateJob({
    id,
    scheduled_date,
    window_start,
    window_end,
    ops_status,
    permit_number: permitNumberRaw ? permitNumberRaw : null,
  });

  const wasScheduled =
    !!before?.scheduled_date || !!before?.window_start || !!before?.window_end;
  const isScheduled = !!scheduled_date || !!window_start || !!window_end;

  const event_type =
    !wasScheduled && isScheduled
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
      },
      after: {
        scheduled_date,
        window_start,
        window_end,
        ops_status,
      },
    },
  });

  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/ops`);

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
  if (job?.job_type === "service") {
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

  const payload: any = {
    parent_job_id: parentJobId,

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
  };

  const { data: child, error: insErr } = await supabase
    .from("jobs")
    .insert(payload)
    .select("id")
    .single();

  if (insErr) throw insErr;

  // 3) Timeline events on BOTH jobs
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

  // ✅ Optional: copy systems + equipment from original → retest
  if (copyEquipment) {
    // 1) Fetch parent systems
    const { data: parentSystems, error: sysErr } = await supabase
      .from("job_systems")
      .select("id, name")
      .eq("job_id", parentJobId);

    if (sysErr) throw sysErr;

    // 2) Insert child systems (same names)
    const systemIdMap = new Map<string, string>(); // parentSystemId → childSystemId

    if (parentSystems?.length) {
      const insertSystems = parentSystems.map((s: any) => ({
        job_id: child.id,
        name: s.name ?? "System",
      }));

      const { data: newSystems, error: newSysErr } = await supabase
        .from("job_systems")
        .insert(insertSystems)
        .select("id, name");

      if (newSysErr) throw newSysErr;

      for (let i = 0; i < parentSystems.length; i++) {
        const parentSys = parentSystems[i];
        const childSys = newSystems?.[i];
        if (parentSys?.id && childSys?.id) {
          systemIdMap.set(String(parentSys.id), String(childSys.id));
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