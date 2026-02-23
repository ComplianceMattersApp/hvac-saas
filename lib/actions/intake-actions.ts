// lib/actions/intake-actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deriveScheduleAndOps } from "@/lib/utils/scheduling";


export async function createJobFromIntake(formData: FormData) {
  const supabase = await createClient();

  // Auth user (used for owner_user_id where available)
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;

  // -----------------------------
  // Read + normalize form fields
  // -----------------------------
  const jobType = (String(formData.get("job_type") || "ecc").trim() || "ecc") as
  | "ecc"
  | "service";

  const titleRaw = String(formData.get("title") || "").trim();
  const permitNumber = String(formData.get("permit_number") || "").trim() || null;

  const firstName = String(formData.get("customer_first_name") || "").trim();
  const lastName = String(formData.get("customer_last_name") || "").trim();
  const phone = String(formData.get("customer_phone") || "").trim();
  const email = String(formData.get("customer_email") || "").trim() || null;

  const addressLine1 = String(formData.get("address_line1") || "").trim();
  const city = String(formData.get("city") || "").trim();

  // Notes should always exist + be editable later
  const jobNotes = String(formData.get("job_notes") || "").trim() || null;

  // Canonical scheduling logic (already extracted)
  const { scheduled_date, window_start, window_end, ops_status } =
    deriveScheduleAndOps(formData);

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
  // -----------------------------
  const autoTitle = `ECC Test - ${lastName}${city ? ` (${city})` : ""}`;
  const jobTitle = titleRaw || autoTitle;

  // IMPORTANT: project_type must remain valid for your constraints.
  // If service cannot use custom values, keep a safe default.
  const projectTypeDefault = jobType === "service" ? "alteration" : "alteration";

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
  // 2) Create location (service address)
  // -----------------------------
  const { data: location, error: locationErr } = await supabase
    .from("locations")
    .insert({
      customer_id: customerId,
      address_line1: addressLine1,
      city,
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

      job_notes: jobNotes,

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
  // -----------------------------
  try {
    await supabase.from("visits").insert({ job_id: jobId });
  } catch {
    // intentionally ignored until visits schema is finalized
  }

  // -----------------------------
  // 5) Structured equipment from intake (NEW)
  // Intake posts arrays (one per equipment row)
  // We create job_systems by unique system_location label
  // Then insert job_equipment rows linked to system_id
  // -----------------------------
  const systemLocations = formData.getAll("system_location").map((v) => String(v || "").trim());
  const equipmentRoles = formData.getAll("equipment_role").map((v) => String(v || "").trim());
  const manufacturers = formData.getAll("manufacturer").map((v) => String(v || "").trim());
  const models = formData.getAll("model").map((v) => String(v || "").trim());
  const serials = formData.getAll("serial").map((v) => String(v || "").trim());
  const tonnages = formData.getAll("tonnage").map((v) => String(v || "").trim());
  const refrigerants = formData.getAll("refrigerant_type").map((v) => String(v || "").trim());
  const eqNotes = formData.getAll("notes").map((v) => String(v || "").trim());

  const hasAnyEquipmentRow =
    systemLocations.length ||
    equipmentRoles.length ||
    manufacturers.length ||
    models.length ||
    serials.length ||
    tonnages.length ||
    refrigerants.length ||
    eqNotes.length;

  if (hasAnyEquipmentRow) {
    // Build normalized rows first; filter out truly blank rows
    const rawRows = systemLocations.map((system_location, i) => {
      const role = equipmentRoles[i] || ""; // optional
      const manufacturer = manufacturers[i] || "";
      const model = models[i] || "";
      const serial = serials[i] || "";
      const tonnage = tonnages[i] || "";
      const refrigerant_type = refrigerants[i] || ""; // optional
      const notes = eqNotes[i] || "";

      const hasAny =
        system_location ||
        role ||
        manufacturer ||
        model ||
        serial ||
        tonnage ||
        refrigerant_type ||
        notes;

      if (!hasAny) return null;

      if (!system_location) {
        // You already enforce this client-side when equipment is active
        throw new Error("If you add equipment, each system must have a Location Label.");
      }

      return {
        system_location,
        equipment_role: role || "equipment", // keep safe default for NOT NULL
        manufacturer: manufacturer || null,
        model: model || null,
        serial: serial || null,
        tonnage: tonnage || null,
        refrigerant_type: refrigerant_type || null,
        notes: notes || null,
      };
    }).filter(Boolean) as Array<{
      system_location: string;
      equipment_role: string;
      manufacturer: string | null;
      model: string | null;
      serial: string | null;
      tonnage: string | null;
      refrigerant_type: string | null;
      notes: string | null;
    }>;

    if (rawRows.length) {
      // Create / reuse job_systems by unique label
      const uniqueLabels = Array.from(new Set(rawRows.map((r) => r.system_location)));

      const systemIdByLabel = new Map<string, string>();

      for (const label of uniqueLabels) {
        const { data: systemRow, error: systemErr } = await supabase
          .from("job_systems")
          .insert({ job_id: jobId, name: label })
          .select("id")
          .single();

        if (systemErr) throw new Error(`System insert failed: ${systemErr.message}`);
        systemIdByLabel.set(label, systemRow.id as string);
      }

      const insertRows = rawRows.map((r) => ({
        job_id: jobId,
        system_id: systemIdByLabel.get(r.system_location)!, // guaranteed
        system_location: r.system_location,
        equipment_role: r.equipment_role, // NOT NULL
        manufacturer: r.manufacturer,
        model: r.model,
        serial: r.serial,
        tonnage: r.tonnage,
        refrigerant_type: r.refrigerant_type, // optional
        notes: r.notes,
      }));

      const { error: eqErr } = await supabase.from("job_equipment").insert(insertRows);
      if (eqErr) throw new Error(`Equipment insert failed: ${eqErr.message}`);
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