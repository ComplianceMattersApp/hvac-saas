"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  updateJobOpsFromForm,
  updateJobOpsDetailsFromForm,
} from "./job-ops-actions";

export type JobStatus =
  | "open"
  | "on_the_way"
  | "in_process"
  | "completed"
  | "failed"
  | "cancelled";

  
type CreateJobInput = {

  job_type?: string | null;
  project_type?: string | null;

  title: string;
  city: string;
  scheduled_date: string;
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


};

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
  const jobId = String(formData.get("job_id") || "").trim();
  const equipmentRole = String(formData.get("equipment_role") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!equipmentRole) throw new Error("Missing equipment_role");

  const manufacturer = String(formData.get("manufacturer") || "").trim() || null;
  const model = String(formData.get("model") || "").trim() || null;
  const serial = String(formData.get("serial") || "").trim() || null;

  const tonnageRaw = String(formData.get("tonnage") || "").trim();
  const tonnage = tonnageRaw ? Number(tonnageRaw) : null;

  const refrigerantType = String(formData.get("refrigerant_type") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  const supabase = await createClient();

  const { error } = await supabase.from("job_equipment").insert({
    job_id: jobId,
    equipment_role: equipmentRole,
    manufacturer,
    model,
    serial,
    tonnage,
    refrigerant_type: refrigerantType,
    notes,
  });

  if (error) throw error;

  revalidatePath(`/jobs/${jobId}`);
}

export async function updateJobEquipmentFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const equipmentId = String(formData.get("equipment_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!equipmentId) throw new Error("Missing equipment_id");

  const equipmentRole = String(formData.get("equipment_role") || "").trim() || null;
  const manufacturer = String(formData.get("manufacturer") || "").trim() || null;
  const model = String(formData.get("model") || "").trim() || null;
  const serial = String(formData.get("serial") || "").trim() || null;

  const tonnageRaw = String(formData.get("tonnage") || "").trim();
  const tonnage = tonnageRaw ? Number(tonnageRaw) : null;

  const refrigerantType = String(formData.get("refrigerant_type") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  const supabase = await createClient();

  const { error } = await supabase
    .from("job_equipment")
    .update({
      equipment_role: equipmentRole,
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

  revalidatePath(`/jobs/${jobId}`);
}

export async function deleteJobEquipmentFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const equipmentId = String(formData.get("equipment_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!equipmentId) throw new Error("Missing equipment_id");

  const supabase = await createClient();

  const { error } = await supabase
    .from("job_equipment")
    .delete()
    .eq("id", equipmentId)
    .eq("job_id", jobId);

  if (error) throw error;

  revalidatePath(`/jobs/${jobId}`);
}

export async function saveEccTestOverrideFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();
  const override = String(formData.get("override") || "none").trim(); // "pass" | "fail" | "none"
  const reasonRaw = String(formData.get("override_reason") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  let override_pass: boolean | null = null;
  let override_reason: string | null = null;

  if (override === "pass") override_pass = true;
  else if (override === "fail") override_pass = false;
  else override_pass = null;

  // Require reason if override is set
  if (override_pass !== null) {
    if (!reasonRaw) throw new Error("Override reason is required");
    override_reason = reasonRaw;
  } else {
    override_reason = null;
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("ecc_test_runs")
    .update({
      override_pass,
      override_reason,
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  revalidatePath(`/jobs/${jobId}`);
}


export async function addEccTestRunFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testType = String(formData.get("test_type") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testType) throw new Error("Missing test_type");

  const supabase = await createClient();

  const { error } = await supabase.from("ecc_test_runs").insert({
    job_id: jobId,
    test_type: testType,
    data: {},
    computed: {},
    computed_pass: null,
    override_pass: null,
    override_reason: null,
  });

  if (error) throw error;

  revalidatePath(`/jobs/${jobId}`);
}

export async function deleteEccTestRunFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const testRunId = String(formData.get("test_run_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!testRunId) throw new Error("Missing test_run_id");

  const supabase = await createClient();

  const { error } = await supabase
    .from("ecc_test_runs")
    .delete()
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

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


export async function saveRefrigerantChargeDataFromForm(formData: FormData) {
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
    
    indoor_min_f: 70,  // we will use lowest_return_air_db_f as indoor proxy
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
  // If we don't have enough to compute meaningfully, keep null.
  const hasCoreCompute =
    measuredSubcool != null &&
    measuredSuperheat != null &&
    data.target_subcool_f != null;

  const isBlocked = blocked.length > 0;
  const computedPass = isBlocked ? null : hasCoreCompute ? failures.length === 0 : null;

  const computed = {
  status: isBlocked ? "blocked" : "computed",
  blocked,
  measured_subcool_f: measuredSubcool,
  measured_superheat_f: measuredSuperheat,
  subcool_delta_f: subcoolDelta,
  rules,
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
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  revalidatePath(`/jobs/${jobId}`);
}

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

  const requiredTotalCfm =
    tonnage != null ? tonnage * cfmPerTon : null;

  const failures: string[] = [];
  const warnings: string[] = [];

  if (tonnage == null) warnings.push("Missing tonnage");
  if (measuredTotalCfm == null) warnings.push("Missing measured total airflow");

  let computedPass: boolean | null = null;

  if (measuredTotalCfm != null && requiredTotalCfm != null) {
    if (measuredTotalCfm < requiredTotalCfm) {
      failures.push(`Airflow below required (${requiredTotalCfm} CFM)`);
      computedPass = false;
    } else {
      computedPass = true;
    }
  } else {
    computedPass = null; // not enough inputs
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
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  revalidatePath(`/jobs/${jobId}`);
}

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

  const leakagePerTonMax = projectType === "all_new" ? 20 : 40; // CFM per ton max
  const maxLeakageCfm = tonnage != null ? tonnage * leakagePerTonMax : null;

  const failures: string[] = [];
  const warnings: string[] = [];

  if (tonnage == null) warnings.push("Missing tonnage");
  if (measuredLeakageCfm == null) warnings.push("Missing measured duct leakage");

  let computedPass: boolean | null = null;

  if (measuredLeakageCfm != null && maxLeakageCfm != null) {
    if (measuredLeakageCfm > maxLeakageCfm) {
      failures.push(`Duct leakage above max (${maxLeakageCfm} CFM)`);
      computedPass = false;
    } else {
      computedPass = true;
    }
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
    })
    .eq("id", testRunId)
    .eq("job_id", jobId);

  if (error) throw error;

  revalidatePath(`/jobs/${jobId}`);
}

export async function addAlterationCoreTestsFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  if (!jobId) throw new Error("Missing job_id");

  const supabase = await createClient();

  // Find existing tests for this job
  const { data: existing, error: existingError } = await supabase
    .from("ecc_test_runs")
    .select("test_type")
    .eq("job_id", jobId);

  if (existingError) throw existingError;

  const existingSet = new Set((existing ?? []).map((r: any) => r.test_type));

  const required = ["duct_leakage", "airflow", "refrigerant_charge"];

  const toInsert = required
    .filter((t) => !existingSet.has(t))
    .map((test_type) => ({
      job_id: jobId,
      test_type,
      data: {},
      computed: {},
      computed_pass: null,
      override_pass: null,
      override_reason: null,
    }));

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("ecc_test_runs")
      .insert(toInsert);

    if (insertError) throw insertError;
  }

  revalidatePath(`/jobs/${jobId}`);
}


export async function createJob(input: CreateJobInput) {
  const supabase = await createClient();

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

    customer_first_name: input.customer_first_name ?? null,
    customer_last_name: input.customer_last_name ?? null,
    customer_email: input.customer_email ?? null,
    job_notes: input.job_notes ?? null,


  };


  const { data, error } = await supabase
    .from("jobs")
    .insert(payload)
    .select("id, permit_number, window_start, window_end, customer_first_name, customer_last_name, customer_email, job_notes, job_address")

    .single();

  if (error) throw error;
  return data;
}

export async function updateJob(input: {
  id: string;
  title?: string;
  city?: string;
  status?: JobStatus;
  scheduled_date?: string;
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

  const jobType = String(formData.get("job_type") || "ecc").trim();
  const projectType = String(formData.get("project_type") || "alteration").trim();

  const contractorIdRaw = formData.get("contractor_id");
  const contractor_id =
  typeof contractorIdRaw === "string" && contractorIdRaw.trim()
    ? contractorIdRaw.trim()
    : null;


  const title = String(formData.get("title") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const customerPhoneRaw = String(formData.get("customer_phone") || "").trim();
  const scheduledDate = String(formData.get("scheduled_date") || "").trim(); // YYYY-MM-DD
  const permitNumberRaw = String(formData.get("permit_number") || "").trim();
  const customerFirstNameRaw = String(formData.get("customer_first_name") || "").trim();
  const customerLastNameRaw = String(formData.get("customer_last_name") || "").trim();
  const customerEmailRaw = String(formData.get("customer_email") || "").trim();
  const jobNotesRaw = String(formData.get("job_notes") || "").trim();
  const jobAddressRaw = String(formData.get("job_address") || "").trim();


  const windowStartTime = String(formData.get("window_start") || "").trim(); // HH:MM
  const windowEndTime = String(formData.get("window_end") || "").trim(); // HH:MM
  

  const status = String(formData.get("status") || "open").trim() as JobStatus;

  if (!title) throw new Error("Title is required");
  if (!city) throw new Error("City is required");
  if (!scheduledDate) throw new Error("Scheduled date is required");

  // Keep your existing convention
  const scheduled_date = `${scheduledDate}T12:00:00.000Z`;

  const window_start = windowStartTime
    ? new Date(`${scheduledDate}T${windowStartTime}:00`).toISOString()
    : null;

  const window_end = windowEndTime
    ? new Date(`${scheduledDate}T${windowEndTime}:00`).toISOString()
    : null;

  if (window_start && window_end) {
    const s = new Date(window_start).getTime();
    const e = new Date(window_end).getTime();
    if (!(s < e)) throw new Error("Arrival window start must be before end");
  }

  const created = await createJob({
    
    job_type: jobType,
    project_type: projectType,
    job_address: jobAddressRaw || null,

    customer_first_name: customerFirstNameRaw || null,
    customer_last_name: customerLastNameRaw || null,
    customer_email: customerEmailRaw || null,
    job_notes: jobNotesRaw || null,

    title,
    city,
    scheduled_date,
    status,
    contractor_id,
    permit_number: permitNumberRaw ? permitNumberRaw : null,
    window_start,
    window_end,
    customer_phone: customerPhoneRaw ? customerPhoneRaw : null,
  });

  redirect(`/jobs/${created.id}`);
}



/**
 * UPDATE: used by Edit Scheduling form on job detail page
 */
export async function advanceJobStatusFromForm(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const raw = String(formData.get("current_status") || "open").trim();

  if (!id) throw new Error("Job ID is required");

  const allowed: JobStatus[] = [
    "open",
    "on_the_way",
    "in_process",
    "completed",
    "failed",
    "cancelled",
  ];

  const current: JobStatus = allowed.includes(raw as JobStatus)
    ? (raw as JobStatus)
    : "open";

  // inline mapping = zero chance of missing constants
  const nextMap: Record<JobStatus, JobStatus> = {
    open: "on_the_way",
    on_the_way: "in_process",
    in_process: "completed",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
  };

  const next = nextMap[current];

  const supabase = await createClient();

  // 🔒 ONLY stamp the first time we enter "on_the_way"
  if (next === "on_the_way") {
    const { data: existing, error: readErr } = await supabase
      .from("jobs")
      .select("on_the_way_at")
      .eq("id", id)
      .single();

    if (readErr) throw readErr;

    // only set if empty
    if (!existing?.on_the_way_at) {
      const { error: writeErr } = await supabase
        .from("jobs")
        .update({
          status: "on_the_way",
          on_the_way_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (writeErr) throw writeErr;
    } else {
      // already stamped → just advance status
      await updateJob({ id, status: "on_the_way" });
    }
  } else {
    await updateJob({ id, status: next });
  }

  redirect(`/jobs/${id}`);
}

/**
 * OPTIONAL: keep for future admin tools (not used in calendar anymore)
 */
export async function updateJobStatusQuick(input: { id: string; status: JobStatus }) {
  await updateJob({ id: input.id, status: input.status });
  return { ok: true };
}

export async function updateJobProfileFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  if (!jobId) throw new Error("Missing job_id");

  const jobType = String(formData.get("job_type") || "ecc").trim();
  const projectType = String(formData.get("project_type") || "alteration").trim();

  const supabase = await createClient();

  const { error } = await supabase
    .from("jobs")
    .update({
      job_type: jobType,
      project_type: projectType,
    })
    .eq("id", jobId);

  if (error) throw error;
}



export async function updateJobScheduleFromForm(formData: FormData) {
  const id = String(formData.get("id") || "").trim();

  const scheduledDate = String(formData.get("scheduled_date") || "").trim(); // YYYY-MM-DD
  const permitNumberRaw = String(formData.get("permit_number") || "").trim();
  const windowStartTime = String(formData.get("window_start") || "").trim(); // HH:MM
  const windowEndTime = String(formData.get("window_end") || "").trim(); // HH:MM

  if (!id) throw new Error("Job ID is required");
  if (!scheduledDate) throw new Error("Scheduled date is required");

  const scheduled_date = `${scheduledDate}T12:00:00.000Z`;

  const window_start = windowStartTime
    ? new Date(`${scheduledDate}T${windowStartTime}:00`).toISOString()
    : null;

  const window_end = windowEndTime
    ? new Date(`${scheduledDate}T${windowEndTime}:00`).toISOString()
    : null;

  if (window_start && window_end) {
    const s = new Date(window_start).getTime();
    const e = new Date(window_end).getTime();
    if (!(s < e)) throw new Error("Arrival window start must be before end");
  }

  await updateJob({
    id,
    scheduled_date,
    permit_number: permitNumberRaw ? permitNumberRaw : null,
    window_start,
    window_end,
  });

  redirect(`/jobs/${id}`);
}
export async function markJobFailedFromForm(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("Job ID is required");

  await updateJob({ id, status: "failed" });
  redirect(`/jobs/${id}`);
}
/**
 * UPDATE: used by Customer + Notes edit form on job detail page
 */
export async function updateJobCustomerFromForm(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
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

