import { createAdminClient } from "@/lib/supabase/server";
import { normalizeAccountWorkshareRequestRow } from "@/lib/workflows/account-workshare-requests-read";
import { insertWorkshareRequestOutcomeNotification } from "@/lib/workflows/workshare-notifications";

// P1-F.1 completion hook. Called (best-effort) when an ECC job reaches a terminal
// pass/fail. If the job is an accepted workshare receiving job, record the outcome
// on the request and notify the sender — exactly once (the RPC is idempotent and
// returns a row only when the outcome was newly recorded). Never throws: the ECC
// status resolution must not be affected by workshare side effects.
export async function recordAndNotifyWorkshareOutcome(
  receivingJobId: string,
  outcome: "passed" | "failed",
): Promise<void> {
  try {
    const jobId = String(receivingJobId ?? "").trim();
    if (!jobId) return;

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("record_account_workshare_receiver_outcome", {
      p_receiving_job_id: jobId,
      p_outcome: outcome,
      p_actor_user_id: null,
    });
    if (error) return;

    // SETOF returns an array; a row is present only on a newly-recorded outcome.
    const row = Array.isArray(data) ? data[0] : data;
    const request = normalizeAccountWorkshareRequestRow(row);
    if (!request) return;

    await insertWorkshareRequestOutcomeNotification({ admin, request, outcome });
  } catch {
    // swallow — outcome return is a non-critical side effect of ECC resolution.
  }
}
