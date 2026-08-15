// lib/actions/job-actions-shared.ts
//
// Shared internals for the job action modules. Deliberately NOT a "use server"
// file: these are helpers, not server actions. Keeping them here lets
// job-actions.ts and the per-domain action modules split apart without either
// duplicating the logic or turning a helper into a server endpoint.

import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/internal-user";
import {
  loadScopedInternalEquipmentJobForMutation,
  loadScopedInternalJobEquipmentForMutation,
} from "@/lib/auth/internal-equipment-scope";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";

export type FieldActionTimingRecorder = (phase: string, elapsedMs: number) => void;

export async function cleanupOrphanSystem(opts: {
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

export async function requireInternalEquipmentMutationAccess(params: {
  supabase: any;
  jobId: string;
  equipmentId?: string | null;
}) {
  const { supabase, jobId } = params;
  const { internalUser } = await requireInternalUser({ supabase });

  const equipmentId = String(params.equipmentId ?? "").trim();

  if (equipmentId) {
    const scopedEquipment = await loadScopedInternalJobEquipmentForMutation({
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
      equipmentId,
      equipmentSelect: "system_id",
    });

    if (!scopedEquipment?.job?.id || !scopedEquipment?.equipment?.id) {
      redirect(`/jobs/${jobId}?notice=not_authorized`);
    }

    return {
      ...scopedEquipment,
      internalUser,
    };
  }

  const scopedJob = await loadScopedInternalEquipmentJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
  });

  if (!scopedJob?.id) {
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }

  return {
    job: scopedJob,
    equipment: null,
    internalUser,
  };
}

export async function requireOperationalScopedJobMutationAccessOrRedirect(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
  timing?: FieldActionTimingRecorder;
}) {
  const access = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId: String(params.accountOwnerUserId ?? "").trim(),
    supabase: params.supabase,
    timing: params.timing,
  });

  if (access.authorized) {
    return;
  }

  const search = new URLSearchParams({
    err: "entitlement_blocked",
    reason: access.reason,
  });
  redirect(`/ops/admin/company-profile?${search.toString()}`);
}
