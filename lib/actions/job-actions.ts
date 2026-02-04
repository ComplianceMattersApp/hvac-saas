"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";


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
  job_type?: string | null;


};

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


export async function createJob(input: CreateJobInput) {
  const supabase = await createClient();

  const payload = {
    job_type: input.job_type ?? "ecc",
    project_type: input.project_type ?? "alteration",

    title: input.title,
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

    job_type: input.job_type ?? "ecc",

  };


  const { data, error } = await supabase
    .from("jobs")
    .insert(payload)
    .select("id, permit_number, window_start, window_end, customer_first_name, customer_last_name, customer_email, job_notes")

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

  const title = String(formData.get("title") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const customerPhoneRaw = String(formData.get("customer_phone") || "").trim();
  const scheduledDate = String(formData.get("scheduled_date") || "").trim(); // YYYY-MM-DD
  const permitNumberRaw = String(formData.get("permit_number") || "").trim();
  const customerFirstNameRaw = String(formData.get("customer_first_name") || "").trim();
  const customerLastNameRaw = String(formData.get("customer_last_name") || "").trim();
  const customerEmailRaw = String(formData.get("customer_email") || "").trim();
  const jobNotesRaw = String(formData.get("job_notes") || "").trim();

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

    customer_first_name: customerFirstNameRaw || null,
    customer_last_name: customerLastNameRaw || null,
    customer_email: customerEmailRaw || null,
    job_notes: jobNotesRaw || null,

    title,
    city,
    scheduled_date,
    status,
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
