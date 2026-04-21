import { createAdminClient } from "@/lib/supabase/server";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";

type ScopedInternalEquipmentJobLookupParams = {
  accountOwnerUserId: string;
  jobId: string;
  select?: string;
  admin?: any;
};

type ScopedInternalJobEquipmentLookupParams = {
  accountOwnerUserId: string;
  jobId: string;
  equipmentId: string;
  jobSelect?: string;
  equipmentSelect?: string;
  admin?: any;
};

type ScopedInternalJobSystemLookupParams = {
  accountOwnerUserId: string;
  jobId: string;
  systemId?: string | null;
  systemName?: string | null;
  jobSelect?: string;
  systemSelect?: string;
  admin?: any;
};

function buildSelectClause(baseFields: string[], extraFields?: string) {
  const extra = String(extraFields ?? "").trim();
  return extra ? `${baseFields.join(", ")}, ${extra}` : baseFields.join(", ");
}

export async function loadScopedInternalEquipmentJobForMutation(
  params: ScopedInternalEquipmentJobLookupParams,
) {
  return loadScopedInternalJobForMutation({
    accountOwnerUserId: params.accountOwnerUserId,
    jobId: params.jobId,
    select: params.select,
    admin: params.admin,
  });
}

export async function loadScopedInternalJobEquipmentForMutation(
  params: ScopedInternalJobEquipmentLookupParams,
) {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const jobId = String(params.jobId ?? "").trim();
  const equipmentId = String(params.equipmentId ?? "").trim();

  if (!accountOwnerUserId || !jobId || !equipmentId) return null;

  const admin = params.admin ?? createAdminClient();
  const job = await loadScopedInternalEquipmentJobForMutation({
    accountOwnerUserId,
    jobId,
    select: params.jobSelect,
    admin,
  });

  if (!job?.id) return null;

  const { data: equipment, error: equipmentErr } = await admin
    .from("job_equipment")
    .select(buildSelectClause(["id", "job_id", "system_id", "system_location"], params.equipmentSelect))
    .eq("id", equipmentId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (equipmentErr) throw equipmentErr;
  if (!equipment?.id) return null;

  return {
    job,
    equipment,
  };
}

export async function loadScopedInternalJobSystemForMutation(
  params: ScopedInternalJobSystemLookupParams,
) {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const jobId = String(params.jobId ?? "").trim();
  const systemId = String(params.systemId ?? "").trim();
  const systemName = String(params.systemName ?? "").trim();

  if (!accountOwnerUserId || !jobId || (!systemId && !systemName)) return null;

  const admin = params.admin ?? createAdminClient();
  const job = await loadScopedInternalEquipmentJobForMutation({
    accountOwnerUserId,
    jobId,
    select: params.jobSelect,
    admin,
  });

  if (!job?.id) return null;

  let query = admin
    .from("job_systems")
    .select(buildSelectClause(["id", "job_id", "name"], params.systemSelect))
    .eq("job_id", jobId);

  if (systemId) {
    query = query.eq("id", systemId);
  } else {
    query = query.eq("name", systemName);
  }

  const { data: system, error: systemErr } = await query.maybeSingle();

  if (systemErr) throw systemErr;
  if (!system?.id) return null;

  return {
    job,
    system,
  };
}