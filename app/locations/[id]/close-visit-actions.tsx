"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function closeVisit(formData: FormData) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Not authenticated");

  const locationId = String(formData.get("locationId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const visitId = String(formData.get("visitId") ?? "");
  const outcome = String(formData.get("outcome") ?? ""); // "pass" | "fail"
  const notes = String(formData.get("notes") ?? "");

  if (!locationId || !jobId || !visitId || !outcome) {
    throw new Error("Missing required fields");
  }

  const needsAnotherVisit = outcome === "fail";

  // 1) Close the visit
  const { error: visitErr } = await supabase
    .from("job_visits")
    .update({
      status: "completed",
      outcome,
      needs_another_visit: needsAnotherVisit,
      closed_at: new Date().toISOString(),
      notes: notes || null,
    })
    .eq("id", visitId);

  if (visitErr) throw visitErr;

  // 2) Update the Job ops anchor (Job stays visible until explicitly closed)
  const nextOpsStatus = outcome === "fail" ? "failed_pending_retest" : "ready_to_close";

  const { error: jobErr } = await supabase
    .from("jobs")
    .update({
      ops_status: nextOpsStatus,
    })
    .eq("id", jobId);

  if (jobErr) throw jobErr;

  revalidatePath(`/locations/${locationId}`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/calendar`);
}
