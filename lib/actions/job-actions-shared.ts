// lib/actions/job-actions-shared.ts
//
// Shared internals for the job action modules. Deliberately NOT a "use server"
// file: these are helpers, not server actions. Keeping them here lets
// job-actions.ts and the per-domain action modules split apart without either
// duplicating the logic or turning a helper into a server endpoint.

import { loadScopedInternalEccJobForMutation, loadScopedInternalEccTestRunForMutation } from "@/lib/auth/internal-ecc-scope";
import { loadScopedInternalEquipmentJobForMutation, loadScopedInternalJobEquipmentForMutation } from "@/lib/auth/internal-equipment-scope";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type FieldActionTimingRecorder = (phase: string, elapsedMs: number) => void;

export function getSafeErrorDetails(error: unknown): { error_code: string | null; error_message: string | null } {
  if (!error) {
    return { error_code: null, error_message: null };
  }

  const maybeRecord = error as Record<string, unknown>;
  const errorCode =
    typeof maybeRecord.code === "string"
      ? maybeRecord.code
      : typeof maybeRecord.error_code === "string"
        ? maybeRecord.error_code
        : null;
  const errorMessage =
    typeof maybeRecord.message === "string"
      ? maybeRecord.message
      : error instanceof Error
        ? error.message
        : String(error);

  return {
    error_code: errorCode,
    error_message: errorMessage,
  };
}

export function redirectToTests(opts: {
  jobId: string;
  testType?: string | null;
  systemId?: string | null;
  testRunId?: string | null;
  notice?: string | null;
}) {
  const { jobId } = opts;
  const testType = String(opts.testType ?? "").trim();
  const systemId = String(opts.systemId ?? "").trim();
  const testRunId = String(opts.testRunId ?? "").trim();
  const notice = String(opts.notice ?? "").trim();

  const q = new URLSearchParams();
  if (testType) q.set("t", testType);
  if (systemId) q.set("s", systemId);
  if (testRunId) q.set("r", testRunId);
  if (notice) q.set("notice", notice);

  const qs = q.toString();
  redirect(qs ? `/jobs/${jobId}/tests?${qs}` : `/jobs/${jobId}/tests`);
}

export function revalidateEccProjectionConsumers(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/tests`);
  revalidatePath("/ops");
  revalidatePath("/portal");
  revalidatePath("/portal/jobs");
  revalidatePath(`/portal/jobs/${jobId}`);
}

export async function requireInternalEccTestsAccess(params: {
  supabase: any;
  jobId: string;
  testRunId?: string | null;
}) {
  const { supabase, jobId } = params;

  const { internalUser } = await requireInternalUser({ supabase });

  const testRunId = String(params.testRunId ?? "").trim();

  if (testRunId) {
    const scopedRun = await loadScopedInternalEccTestRunForMutation({
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
      testRunId,
      testRunSelect: "is_completed",
    });

    if (!scopedRun?.job?.id || !scopedRun?.testRun?.id) {
      redirect(`/jobs/${jobId}?notice=not_authorized`);
    }

    return {
      ...scopedRun,
      internalUser,
    };
  }

  const scopedJob = await loadScopedInternalEccJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
  });

  if (!scopedJob?.id) {
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }

  return {
    job: scopedJob,
    testRun: null,
    internalUser,
  };
}

export async function resolveSystemIdForRun(params: {
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

export function normalizeJobTab(raw: string): "info" | "ops" | "tests" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "ops" || value === "tests") return value;
  return "info";
}

export function redirectToJobWithBanner(params: {
  jobId: string;
  banner: string;
  tabRaw?: string;
  returnToRaw?: string;
  cacheBust?: boolean;
}) {
  const tab = normalizeJobTab(String(params.tabRaw ?? ""));
  const returnToRaw = String(params.returnToRaw ?? "").trim();

  if (returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")) {
    const target = new URL(returnToRaw, "https://app.local");
    target.searchParams.set("banner", params.banner);
    if (params.cacheBust) target.searchParams.set("rv", Date.now().toString());
    redirect(`${target.pathname}?${target.searchParams.toString()}${target.hash}`);
  }

  const q = new URLSearchParams();
  q.set("tab", tab);
  q.set("banner", params.banner);
  if (params.cacheBust) q.set("rv", Date.now().toString());
  redirect(`/jobs/${params.jobId}?${q.toString()}`);
}

export async function requireInternalScopedJobAccessOrRedirect(params: {
  supabase: any;
  jobId: string;
  onUnauthorized?: () => void;
  timing?: FieldActionTimingRecorder;
}) {
  const jobId = String(params.jobId ?? "").trim();
  const { userId, internalUser } = await requireInternalUser({
    supabase: params.supabase,
    timing: params.timing,
  });
  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: "id",
    timing: params.timing,
  });

  if (!scopedJob?.id) {
    if (params.onUnauthorized) {
      params.onUnauthorized();
    }
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }

  return { userId, internalUser, scopedJob };
}


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

export async function insertJobEvent(params: {
  supabase: any;
  jobId: string;
  event_type: string;
  meta?: Record<string, any> | null;
  userId?: string | null;
}): Promise<string> {
  const { supabase, jobId, event_type } = params;
  const meta = params.meta ?? null;
  const userId = params.userId ?? null;

  const { data, error } = await supabase
    .from("job_events")
    .insert({
      job_id: jobId,
      event_type,
      meta,
      user_id: userId,
    })
    .select("id")
    .single();

  if (error) throw error;

  if (!data?.id) {
    throw new Error("Failed to retrieve inserted event id");
  }

  return data.id;
}
