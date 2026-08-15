// lib/actions/job-equipment-actions.ts
//
// Job equipment and system filter server actions, split out of job-actions.ts.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizeEquipmentFields } from "@/lib/utils/equipment-domain";
import {
  archiveSystemFilter,
  createSystemFilter,
  updateSystemFilter,
} from "@/lib/customers/system-filters-read-model";
import {
  cleanupOrphanSystem,
  requireInternalEquipmentMutationAccess,
  requireOperationalScopedJobMutationAccessOrRedirect,
} from "@/lib/actions/job-actions-shared";

export async function addJobEquipmentFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const requestedEquipmentId = String(formData.get("equipment_id") || "").trim();
  const equipmentRole = String(formData.get("equipment_role") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!equipmentRole) throw new Error("Missing equipment_role");

  const systemChoice = String(formData.get("system_location") || formData.get("system_location_choice") || "").trim();
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

  const heatingCapacityRaw = String(formData.get("heating_capacity_kbtu") || "").trim();
  const heatingCapacityKbtu = heatingCapacityRaw ? Number(heatingCapacityRaw) : null;

  const heatingOutputRaw = String(formData.get("heating_output_btu") || "").trim();
  const heatingOutputBtu = heatingOutputRaw ? Number(heatingOutputRaw) : null;

  const heatingEfficiencyRaw = String(formData.get("heating_efficiency_percent") || "").trim();
  const heatingEfficiencyPercent = heatingEfficiencyRaw ? Number(heatingEfficiencyRaw) : null;

  const refrigerantType =
    String(formData.get("refrigerant_type") || "").trim() || null;

  const notes = String(formData.get("notes") || "").trim() || null;

  const supabase = await createClient();
  const scoped = await requireInternalEquipmentMutationAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

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

  // 2) Insert equipment tied to system_id — sanitize fields by canonical role
  const eqFields = sanitizeEquipmentFields({
    canonicalRole: equipmentRole,
    manufacturer,
    model,
    serial,
    notes,
    tonnage,
    refrigerantType,
    heatingCapacityKbtu,
    heatingOutputBtu,
    heatingEfficiencyPercent,
  });

  const { error: eqErr } = await supabase.from("job_equipment").insert({
    ...(requestedEquipmentId ? { id: requestedEquipmentId } : {}),
    job_id: jobId,
    system_id: systemId,
    system_location: systemLocation,
    ...eqFields,
  });

  if (eqErr) throw eqErr;

  revalidatePath(`/jobs/${jobId}`);
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

  const heatingCapacityRaw = String(formData.get("heating_capacity_kbtu") || "").trim();
  const heatingCapacityKbtu = heatingCapacityRaw ? Number(heatingCapacityRaw) : null;

  const heatingOutputRaw = String(formData.get("heating_output_btu") || "").trim();
  const heatingOutputBtu = heatingOutputRaw ? Number(heatingOutputRaw) : null;

  const heatingEfficiencyRaw = String(formData.get("heating_efficiency_percent") || "").trim();
  const heatingEfficiencyPercent = heatingEfficiencyRaw ? Number(heatingEfficiencyRaw) : null;

  const refrigerantType =
    String(formData.get("refrigerant_type") || "").trim() || null;

  const notes = String(formData.get("notes") || "").trim() || null;

  const supabase = await createClient();
  const scoped = await requireInternalEquipmentMutationAccess({
    supabase,
    jobId,
    equipmentId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  const { data: existingEquipment, error: equipmentErr } = await supabase
    .from("job_equipment")
    .select("system_id")
    .eq("id", equipmentId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (equipmentErr) throw equipmentErr;

  const previousSystemId = String(existingEquipment?.system_id ?? "").trim();

  let systemId: string | null = null;

  if (systemLocation) {
    const { data: existingSystem, error: sysFindErr } = await supabase
      .from("job_systems")
      .select("id")
      .eq("job_id", jobId)
      .eq("name", systemLocation)
      .maybeSingle();

    if (sysFindErr) throw sysFindErr;

    systemId = existingSystem?.id ?? null;

    if (!systemId) {
      const { data: newSystem, error: sysCreateErr } = await supabase
        .from("job_systems")
        .insert({ job_id: jobId, name: systemLocation })
        .select("id")
        .single();

      if (sysCreateErr) throw sysCreateErr;
      systemId = String(newSystem?.id ?? "").trim() || null;
    }
  }

  // Sanitize fields by canonical role before update
  const eqFields = sanitizeEquipmentFields({
    canonicalRole: equipmentRole ?? "",
    manufacturer,
    model,
    serial,
    notes,
    tonnage,
    refrigerantType,
    heatingCapacityKbtu,
    heatingOutputBtu,
    heatingEfficiencyPercent,
  });

  const { error } = await supabase
    .from("job_equipment")
    .update({
      system_id: systemId,
      system_location: systemLocation,
      ...eqFields,
    })
    .eq("id", equipmentId)
    .eq("job_id", jobId);

  if (error) throw error;

  if (previousSystemId && previousSystemId !== String(systemId ?? "").trim()) {
    await cleanupOrphanSystem({ supabase, jobId, systemId: previousSystemId });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/info`);
  revalidatePath(`/jobs/${jobId}/tests`);
  redirect(`/jobs/${jobId}/info?f=equipment`);
}

export async function deleteJobEquipmentFromForm(formData: FormData) {
  const jobId = String(formData.get("job_id") || "").trim();
  const equipmentId = String(formData.get("equipment_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!equipmentId) throw new Error("Missing equipment_id");

  const supabase = await createClient();
  const scoped = await requireInternalEquipmentMutationAccess({
    supabase,
    jobId,
    equipmentId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

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
revalidatePath(`/jobs/${jobId}/info`);
revalidatePath(`/jobs/${jobId}/tests`);
}

function readSystemFilterFormText(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() || null : null;
}

async function requireSystemBelongsToJobForFilterAction(params: {
  supabase: any;
  jobId: string;
  systemId: string;
}) {
  const { data, error } = await params.supabase
    .from("job_systems")
    .select("id")
    .eq("id", params.systemId)
    .eq("job_id", params.jobId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) redirect(`/jobs/${params.jobId}?notice=not_authorized`);
}

async function requireFilterBelongsToJobForFilterAction(params: {
  supabase: any;
  jobId: string;
  filterId: string;
}) {
  const { data, error } = await params.supabase
    .from("job_system_filters")
    .select("system_id")
    .eq("id", params.filterId)
    .maybeSingle();

  if (error) throw error;
  const systemId = String(data?.system_id ?? "").trim();
  if (!systemId) redirect(`/jobs/${params.jobId}?notice=not_authorized`);

  await requireSystemBelongsToJobForFilterAction({
    supabase: params.supabase,
    jobId: params.jobId,
    systemId,
  });
}

export async function addSystemFilterFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  let systemId = String(formData.get("system_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");

  const supabase = await createClient();
  const scoped = await requireInternalEquipmentMutationAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  if (systemId) {
    await requireSystemBelongsToJobForFilterAction({ supabase, jobId, systemId });
  } else {
    const systemChoice = String(formData.get("system_location") || formData.get("system_location_choice") || "").trim();
    const systemCustom = String(formData.get("system_location_custom") || "").trim();

    if (systemChoice === "__new__" && !systemCustom) {
      throw new Error("Please type a new System Location name.");
    }

    const systemLocation = systemChoice === "__new__" ? systemCustom : systemChoice;
    if (!systemLocation) throw new Error("Missing system_location");

    const { data: existingSystem, error: sysFindErr } = await supabase
      .from("job_systems")
      .select("id")
      .eq("job_id", jobId)
      .eq("name", systemLocation)
      .maybeSingle();

    if (sysFindErr) throw sysFindErr;
    systemId = String(existingSystem?.id ?? "").trim();

    if (!systemId) {
      const { data: newSystem, error: sysCreateErr } = await supabase
        .from("job_systems")
        .insert({ job_id: jobId, name: systemLocation })
        .select("id")
        .single();

      if (sysCreateErr) throw sysCreateErr;
      systemId = String(newSystem?.id ?? "").trim();
    }
  }

  if (!systemId) throw new Error("Unable to resolve system_id");

  await createSystemFilter({
    supabase,
    input: {
      systemId,
      accountOwnerUserId: scoped.internalUser.account_owner_user_id,
      label: readSystemFilterFormText(formData, "label"),
      length: formData.get("length"),
      width: formData.get("width"),
      height: formData.get("height"),
      dateChanged: formData.get("date_changed"),
      notes: readSystemFilterFormText(formData, "notes"),
      userId: scoped.internalUser.user_id,
    },
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/info`);
  revalidatePath(`/jobs/${jobId}/tests`);
  redirect(`/jobs/${jobId}/info?f=equipment`);
}

export async function updateSystemFilterFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const filterId = String(formData.get("filter_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!filterId) throw new Error("Missing filter_id");

  const supabase = await createClient();
  const scoped = await requireInternalEquipmentMutationAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  await requireFilterBelongsToJobForFilterAction({ supabase, jobId, filterId });

  await updateSystemFilter({
    supabase,
    input: {
      filterId,
      accountOwnerUserId: scoped.internalUser.account_owner_user_id,
      label: readSystemFilterFormText(formData, "label"),
      length: formData.get("length"),
      width: formData.get("width"),
      height: formData.get("height"),
      dateChanged: formData.get("date_changed"),
      notes: readSystemFilterFormText(formData, "notes"),
      userId: scoped.internalUser.user_id,
    },
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/info`);
  revalidatePath(`/jobs/${jobId}/tests`);
  redirect(`/jobs/${jobId}/info?f=equipment`);
}

export async function archiveSystemFilterFromForm(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const filterId = String(formData.get("filter_id") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!filterId) throw new Error("Missing filter_id");

  const supabase = await createClient();
  const scoped = await requireInternalEquipmentMutationAccess({ supabase, jobId });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
  });

  await requireFilterBelongsToJobForFilterAction({ supabase, jobId, filterId });

  await archiveSystemFilter({
    supabase,
    filterId,
    accountOwnerUserId: scoped.internalUser.account_owner_user_id,
    userId: scoped.internalUser.user_id,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/info`);
  revalidatePath(`/jobs/${jobId}/tests`);
  redirect(`/jobs/${jobId}/info?f=equipment`);
}

