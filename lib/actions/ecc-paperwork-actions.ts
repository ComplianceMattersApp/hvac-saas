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

  await setOpsStatusIfNotManual(jobId, "closed");
}
