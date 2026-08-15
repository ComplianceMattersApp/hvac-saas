// lib/actions/job-retest-actions.ts
//
// ECC retest job creation and scheduling server actions.
// Split out of job-actions.ts; see docs/ACTIVE/JOB_ACTIONS_DECOMPOSITION_PLAN.md.

"use server";

import { createClient } from "@/lib/supabase/server";
import { deriveScheduleAndOps } from "@/lib/utils/scheduling";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createJob,
  ensureServiceCaseForJob,
  insertJobEvent,
  requireInternalScopedJobAccessOrRedirect,
  requireOperationalScopedJobMutationAccessOrRedirect,
} from "@/lib/actions/job-actions-shared";
import { updateJobScheduleFromForm } from "@/lib/actions/job-actions";

export async function createRetestJobFromForm(formData: FormData) {
  "use server";

  const copyEquipment = String(formData.get("copy_equipment") || "") === "1";
  const parentJobId = String(formData.get("parent_job_id") || "").trim();
  const noRedirect = String(formData.get("no_redirect") || "").trim() === "1";
  const bridgeAction =
    String(formData.get("retest_bridge_action") || "").trim() || "move_to_needs_scheduling";
  if (!parentJobId) throw new Error("Missing parent_job_id");

  const supabase = await createClient();
  const { internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: parentJobId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  // 1) Load parent job
  const { data: parentData, error: parentErr } = await supabase
    .from("jobs")
      .select(
      [
        "id",
        "status",
        "ops_status",
        "service_case_id",
        "job_type",
        "project_type",
        "title",
        "city",
        "customer_id",
        "location_id",
        "contractor_id",
        "permit_number",
        "jurisdiction",
        "permit_date",
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
    .is("deleted_at", null)
    .single();

  if (parentErr) throw parentErr;
  const parent = parentData as any;

  const parentJobType = String(parent?.job_type ?? "").trim().toLowerCase();
  const parentOpsStatus = String(parent?.ops_status ?? "").trim().toLowerCase();

  if (parentJobType !== "ecc") {
    redirect(`/jobs/${parentJobId}?tab=ops&banner=retest_not_eligible`);
  }

  if (!["failed", "retest_needed", "pending_office_review"].includes(parentOpsStatus)) {
    redirect(`/jobs/${parentJobId}?tab=ops&banner=retest_not_eligible`);
  }

  const { data: activeRetestChild, error: activeChildErr } = await supabase
    .from("jobs")
    .select("id, status, ops_status")
    .eq("parent_job_id", parentJobId)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeChildErr) throw activeChildErr;

  if (activeRetestChild?.id) {
    if (noRedirect) {
      return { ...activeRetestChild, alreadyExists: true };
    }
    redirect(`/jobs/${activeRetestChild.id}?tab=ops&banner=retest_already_exists`);
  }

  // 2) Create retest job (unscheduled by default)
  const retestTitle = `Retest - ${parent?.title ?? "Job"}`;

    const inheritedServiceCaseId =
    parent?.service_case_id
      ? String(parent.service_case_id)
      : await ensureServiceCaseForJob({
          supabase,
          jobId: parentJobId,
        });

  const child = await createJob({
    parent_job_id: parentJobId,
    service_case_id: inheritedServiceCaseId,

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
    jurisdiction: parent?.jurisdiction ?? null,
    permit_date: parent?.permit_date ?? null,
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
  });

      // 3) Timeline events on BOTH jobs
  try {
    await insertJobEvent({
      supabase,
      jobId: parentJobId,
      event_type: "retest_created",
      meta: {
        child_job_id: child.id,
        bridge_action: bridgeAction,
        source_ops_status: parentOpsStatus || null,
      },
    });

    await insertJobEvent({
      supabase,
      jobId: child.id,
      event_type: "retest_created",
      meta: {
        parent_job_id: parentJobId,
        bridge_action: bridgeAction,
        source_ops_status: parentOpsStatus || null,
      },
    });
  } catch (e) {
    console.error("retest_created job_events insert failed:", e);
  }

  

  // ✅ Optional: copy systems + equipment from original → retest
  if (copyEquipment) {
    // 1) Fetch parent systems
    const { data: parentSystems, error: sysErr } = await supabase
      .from("job_systems")
      .select("id, name, created_at")
      .eq("job_id", parentJobId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (sysErr) throw sysErr;

    // 2) Insert child systems (same names)
    const systemIdMap = new Map<string, string>(); // parentSystemId → childSystemId

    if (parentSystems?.length) {
      for (const parentSys of parentSystems) {
        const { data: newSystem, error: newSysErr } = await supabase
          .from("job_systems")
          .insert({
            job_id: child.id,
            name: parentSys?.name ?? "System",
          })
          .select("id")
          .single();

        if (newSysErr) throw newSysErr;

        if (parentSys?.id && newSystem?.id) {
          systemIdMap.set(String(parentSys.id), String(newSystem.id));
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

  if (noRedirect) {
    return child;
  }

  redirect(`/jobs/${child.id}?tab=ops`);
}

export async function scheduleRetestNowFromForm(formData: FormData) {
  "use server";

  const parentJobId = String(formData.get("parent_job_id") || "").trim();
  if (!parentJobId) throw new Error("Missing parent_job_id");

  const supabase = await createClient();
  const { userId: actingUserId, internalUser } = await requireInternalScopedJobAccessOrRedirect({
    supabase,
    jobId: parentJobId,
  });

  await requireOperationalScopedJobMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  let scheduleFields: ReturnType<typeof deriveScheduleAndOps>;
  try {
    scheduleFields = deriveScheduleAndOps(formData);
  } catch {
    redirect(`/jobs/${parentJobId}?tab=ops&banner=schedule_window_invalid#followup`);
  }

  if (!scheduleFields.scheduled_date) {
    redirect(`/jobs/${parentJobId}?tab=ops&banner=schedule_date_required#followup`);
  }

  const createFormData = new FormData();
  createFormData.set("parent_job_id", parentJobId);
  createFormData.set("no_redirect", "1");
  createFormData.set("retest_bridge_action", "schedule_retest_now");
  if (String(formData.get("copy_equipment") || "") === "1") {
    createFormData.set("copy_equipment", "1");
  }

  const child = await createRetestJobFromForm(createFormData);
  const childJobId = String((child as any)?.id ?? "").trim();
  if (!childJobId) {
    redirect(`/jobs/${parentJobId}?tab=ops&banner=retest_create_failed#followup`);
  }
  if ((child as any)?.alreadyExists) {
    redirect(`/jobs/${childJobId}?tab=ops&banner=retest_already_exists`);
  }

  const scheduleFormData = new FormData();
  scheduleFormData.set("job_id", childJobId);
  scheduleFormData.set("scheduled_date", scheduleFields.scheduled_date);
  if (scheduleFields.window_start) {
    scheduleFormData.set("window_start", scheduleFields.window_start);
  }
  if (scheduleFields.window_end) {
    scheduleFormData.set("window_end", scheduleFields.window_end);
  }
  scheduleFormData.set("schedule_reason", "Scheduled linked ECC retest");
  scheduleFormData.set("no_redirect", "1");

  await updateJobScheduleFromForm(scheduleFormData);

  const retestScheduledMeta = {
    source_action: "schedule_retest_now",
    child_job_id: childJobId,
    parent_job_id: parentJobId,
    scheduled_date: scheduleFields.scheduled_date,
    window_start: scheduleFields.window_start ?? null,
    window_end: scheduleFields.window_end ?? null,
  };

  await insertJobEvent({
    supabase,
    jobId: parentJobId,
    event_type: "retest_scheduled",
    meta: retestScheduledMeta,
    userId: actingUserId,
  });

  await insertJobEvent({
    supabase,
    jobId: childJobId,
    event_type: "retest_scheduled",
    meta: retestScheduledMeta,
    userId: actingUserId,
  });

  revalidatePath(`/jobs/${parentJobId}`);
  revalidatePath(`/jobs/${childJobId}`);
  revalidatePath(`/ops`);
  revalidatePath(`/jobs`);
  revalidatePath(`/calendar`);

  redirect(`/jobs/${childJobId}?tab=ops&banner=retest_scheduled`);
}
