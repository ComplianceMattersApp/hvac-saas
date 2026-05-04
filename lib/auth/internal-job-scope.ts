import { createAdminClient } from "@/lib/supabase/server";

type ScopedInternalJobLookupParams = {
  accountOwnerUserId: string;
  jobId: string;
  select?: string;
  admin?: any;
  timing?: (phase: string, elapsedMs: number) => void;
};

type ScopedInternalServiceCaseLookupParams = {
  accountOwnerUserId: string;
  serviceCaseId: string;
  expectedCustomerId?: string | null;
  select?: string;
  admin?: any;
  timing?: (phase: string, elapsedMs: number) => void;
};

async function timeScopedLookupPhase<T>(
  timing: ((phase: string, elapsedMs: number) => void) | undefined,
  phase: string,
  work: () => Promise<T>,
): Promise<T> {
  if (!timing) return work();
  const startedAt = Date.now();
  try {
    return await work();
  } finally {
    timing(phase, Date.now() - startedAt);
  }
}

function buildSelectClause(baseFields: string[], extraFields?: string) {
  const extra = String(extraFields ?? "").trim();
  return extra ? `${baseFields.join(", ")}, ${extra}` : baseFields.join(", ");
}

export async function loadScopedInternalJobForMutation(
  params: ScopedInternalJobLookupParams,
) {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const jobId = String(params.jobId ?? "").trim();

  if (!accountOwnerUserId || !jobId) return null;

  const admin = params.admin ?? createAdminClient();
  const { data: job, error: jobErr } = await timeScopedLookupPhase(
    params.timing,
    "scopedJobLookup",
    async () =>
      admin
        .from("jobs")
        .select(buildSelectClause(["id", "customer_id", "service_case_id"], params.select))
        .eq("id", jobId)
        .is("deleted_at", null)
        .maybeSingle(),
  );

  if (jobErr) throw jobErr;
  if (!job?.id) return null;

  const customerId = String((job as any)?.customer_id ?? "").trim();
  if (!customerId) return null;

  const { data: customer, error: customerErr } = await timeScopedLookupPhase(
    params.timing,
    "customerOwnershipLookup",
    async () =>
      admin
        .from("customers")
        .select("id")
        .eq("id", customerId)
        .eq("owner_user_id", accountOwnerUserId)
        .maybeSingle(),
  );

  if (customerErr) throw customerErr;
  if (!customer?.id) return null;

  return job;
}

export async function loadScopedInternalServiceCaseForMutation(
  params: ScopedInternalServiceCaseLookupParams,
) {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const serviceCaseId = String(params.serviceCaseId ?? "").trim();
  const expectedCustomerId = String(params.expectedCustomerId ?? "").trim();

  if (!accountOwnerUserId || !serviceCaseId) return null;

  const admin = params.admin ?? createAdminClient();
  const { data: serviceCase, error: serviceCaseErr } = await admin
    .from("service_cases")
    .select(buildSelectClause(["id", "customer_id"], params.select))
    .eq("id", serviceCaseId)
    .maybeSingle();

  if (serviceCaseErr) throw serviceCaseErr;
  if (!serviceCase?.id) return null;

  const customerId = String((serviceCase as any)?.customer_id ?? "").trim();
  if (!customerId) return null;
  if (expectedCustomerId && customerId !== expectedCustomerId) return null;

  const { data: customer, error: customerErr } = await admin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (customerErr) throw customerErr;
  if (!customer?.id) return null;

  return serviceCase;
}