// lib/actions/intake-actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deriveScheduleAndOps } from "@/lib/utils/scheduling";

type JobType = "ecc" | "service";


export async function createJobFromIntake(formData: FormData) {
  const supabase = await createClient();

  // Auth user (used for owner_user_id where available)
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;

  // -----------------------------
  // Read + normalize form fields
  // -----------------------------
  const jobType = (String(formData.get("job_type") || "ecc") as JobType) ?? "ecc";

  const titleRaw = String(formData.get("title") || "").trim();
  const permitNumber = String(formData.get("permit_number") || "").trim() || null;

  const firstName = String(formData.get("customer_first_name") || "").trim();
  const lastName = String(formData.get("customer_last_name") || "").trim();
  const phone = String(formData.get("customer_phone") || "").trim();
  const email = String(formData.get("customer_email") || "").trim() || null;

  const addressLine1 = String(formData.get("address_line1") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const locationNotes = String(formData.get("location_notes") || "").trim() || null;

const { scheduled_date, window_start, window_end, ops_status } =
  deriveScheduleAndOps(formData);

  const equipmentEnabled = String(formData.get("equipment_enabled") || "0") === "1";
  const equipmentJson = String(formData.get("equipment_json") || "[]");

  // -----------------------------
  // Hard validation (server-side)
  // -----------------------------
  if (!firstName || !lastName || !phone) {
    throw new Error("Missing required fields: First Name, Last Name, Phone.");
  }
  if (!addressLine1 || !city) {
    throw new Error("Missing required fields: Service Address, City.");
  }
  if (jobType === "service" && !titleRaw) {
    throw new Error("Service jobs require a Job Title.");
  }

  // -----------------------------
  // REQUIRED DB columns you do not collect at intake
  // (from your schema: NOT NULL)
  // -----------------------------
  // jobs.title is NOT NULL → ECC must be auto-titled if blank
  const autoTitle = `ECC Test - ${lastName}${city ? ` (${city})` : ""}`;
  const jobTitle = titleRaw || autoTitle;

  // jobs.project_type is NOT NULL
  // We will set a safe default that won’t block intake.
  // You can refine later (alteration/all_new/new_construction) once you add that UI.
  const projectTypeDefault = jobType === "service" ? "service" : "alteration";

  // jobs.lifecycle_state is NOT NULL
  const lifecycleStateDefault = "active";

  // -----------------------------
  // 1) Create customer
  // -----------------------------
  const fullName = `${firstName} ${lastName}`.trim();

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .insert({
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      phone,
      email,
      owner_user_id: userId,
    })
    .select("id")
    .single();

  if (customerErr) throw new Error(`Customer insert failed: ${customerErr.message}`);
  const customerId = customer.id as string;

  // -----------------------------
  // 2) Create location
  // -----------------------------
  const { data: location, error: locationErr } = await supabase
    .from("locations")
    .insert({
      customer_id: customerId,
      address_line1: addressLine1,
      city,
      notes: locationNotes,
      owner_user_id: userId,
    })
    .select("id")
    .single();

  if (locationErr) throw new Error(`Location insert failed: ${locationErr.message}`);
  const locationId = location.id as string;

  // -----------------------------
  // 3) Create job
  // -----------------------------
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      title: jobTitle,
      job_type: jobType,
      project_type: projectTypeDefault,
      lifecycle_state: lifecycleStateDefault,

      customer_id: customerId,
      location_id: locationId,

      // convenience duplicates you already have on jobs
      customer_first_name: firstName,
      customer_last_name: lastName,
      customer_phone: phone,
      customer_email: email,

      city,
      job_address: addressLine1,

      permit_number: permitNumber,

      scheduled_date,
      window_start,
      window_end,

      ops_status,
    })
    .select("id, ops_status")
    .single();

  if (jobErr) throw new Error(`Job insert failed: ${jobErr.message}`);
  const jobId = job.id as string;

  // -----------------------------
  // 4) Visit #1 (best-effort)
  // We don't have visits schema yet, so we won’t block intake if this fails.
  // -----------------------------
  try {
    await supabase.from("visits").insert({ job_id: jobId });
  } catch {
    // intentionally ignored until you paste visits schema
  }

  // -----------------------------
  // 5) Optional equipment at intake
  // Must create job_systems and set job_equipment.system_id (no null)
  // -----------------------------
  if (equipmentEnabled) {
    let systems: any[] = [];
    try {
      systems = JSON.parse(equipmentJson);
    } catch {
      systems = [];
    }

    if (Array.isArray(systems)) {
      for (const sys of systems) {
        const label = String(sys?.label || "").trim();
        const eqList = Array.isArray(sys?.equipment) ? sys.equipment : [];

        const hasAnyEq = eqList.some((e: any) =>
          [e?.make, e?.model, e?.serial, e?.notes].some((v) => String(v || "").trim().length > 0)
        );

        if (!hasAnyEq) continue;

        if (!label) {
          throw new Error("If you add equipment, each system must have a Location Label.");
        }

        const { data: systemRow, error: systemErr } = await supabase
          .from("job_systems")
          .insert({
            job_id: jobId,
            name: label,
          })
          .select("id")
          .single();

        if (systemErr) throw new Error(`System insert failed: ${systemErr.message}`);
        const systemId = systemRow.id as string;

        for (const e of eqList) {
          const manufacturer = String(e?.make || "").trim() || null;
          const model = String(e?.model || "").trim() || null;
          const serial = String(e?.serial || "").trim() || null;
          const notes = String(e?.notes || "").trim() || null;

          if (!manufacturer && !model && !serial && !notes) continue;

          const { error: eqErr } = await supabase.from("job_equipment").insert({
            job_id: jobId,
            system_id: systemId, // ✅ prevents null
            system_location: label,
            equipment_role: "equipment", // required NOT NULL
            manufacturer,
            model,
            serial,
            notes,
          });

          if (eqErr) throw new Error(`Equipment insert failed: ${eqErr.message}`);
        }
      }
    }
  }

  // -----------------------------
  // Redirect rule
  // -----------------------------
  if (ops_status === "scheduled") {
    redirect(`/jobs/${jobId}`);
  }

  redirect(`/ops?status=need_to_schedule`);
}
