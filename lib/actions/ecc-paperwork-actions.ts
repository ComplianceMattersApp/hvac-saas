//lib actions ecc-paperwork-actions

"use server";

import { createClient } from "@/lib/supabase/server";
import { setOpsStatusIfNotManual } from "@/lib/actions/ops-status";

export async function markPaperworkComplete(jobId: string): Promise<void> {
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status")
    .eq("id", jobId)
    .single();

  if (error) throw error;
  if (job.job_type !== "ecc") throw new Error("Paperwork completion is ECC-only.");

  const result = await setOpsStatusIfNotManual(jobId, "closed");

  if (!result.updated || result.finalStatus !== "closed") {
    return;
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;

  const { error: eventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Paperwork marked complete",
    meta: {
      changes: [
        { field: "ops_status", from: result.previousStatus || null, to: result.finalStatus },
      ],
      source: "ecc_paperwork_complete_action",
      actor_user_id: user?.id ?? null,
    },
    user_id: user?.id ?? null,
  });

  if (eventErr) throw new Error(eventErr.message);
}
