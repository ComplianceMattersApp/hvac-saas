import { createAdminClient } from "@/lib/supabase/server";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";

type ScopedInternalEccJobLookupParams = {
  accountOwnerUserId: string;
  jobId: string;
  select?: string;
  admin?: any;
};

type ScopedInternalEccTestRunLookupParams = {
  accountOwnerUserId: string;
  jobId: string;
  testRunId: string;
  jobSelect?: string;
  testRunSelect?: string;
  admin?: any;
};

function buildSelectClause(baseFields: string[], extraFields?: string) {
  const extra = String(extraFields ?? "").trim();
  return extra ? `${baseFields.join(", ")}, ${extra}` : baseFields.join(", ");
}

export async function loadScopedInternalEccJobForMutation(
  params: ScopedInternalEccJobLookupParams,
) {
  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: params.accountOwnerUserId,
    jobId: params.jobId,
    select: buildSelectClause(["job_type"], params.select),
    admin: params.admin,
  });

  if (!scopedJob?.id) return null;

  if (String((scopedJob as any)?.job_type ?? "").trim().toLowerCase() !== "ecc") {
    return null;
  }

  return scopedJob;
}

export async function loadScopedInternalEccTestRunForMutation(
  params: ScopedInternalEccTestRunLookupParams,
) {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const jobId = String(params.jobId ?? "").trim();
  const testRunId = String(params.testRunId ?? "").trim();

  if (!accountOwnerUserId || !jobId || !testRunId) return null;

  const admin = params.admin ?? createAdminClient();
  const job = await loadScopedInternalEccJobForMutation({
    accountOwnerUserId,
    jobId,
    select: params.jobSelect,
    admin,
  });

  if (!job?.id) return null;

  const { data: testRun, error: testRunErr } = await admin
    .from("ecc_test_runs")
    .select(buildSelectClause(["id", "job_id", "system_id", "test_type"], params.testRunSelect))
    .eq("id", testRunId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (testRunErr) throw testRunErr;
  if (!testRun?.id) return null;

  return {
    job,
    testRun,
  };
}