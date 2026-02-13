"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createNextVisit(formData: FormData) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Not authenticated");

  const locationId = String(formData.get("locationId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");

  if (!locationId || !jobId) throw new Error("Missing locationId/jobId");

  const { data: existing, error: existingErr } = await supabase
    .from("job_visits")
    .select("visit_number")
    .eq("job_id", jobId)
    .order("visit_number", { ascending: false })
    .limit(1);

  if (existingErr) throw existingErr;

  const maxVisit = existing?.[0]?.visit_number ?? 0;
  const nextVisitNumber = maxVisit + 1;

// Insert next visit (needs scheduling)
const { error: insertErr } = await supabase.from("job_visits").insert({
  job_id: jobId,
  visit_number: nextVisitNumber,
  status: "need_to_schedule",
});

if (insertErr) throw insertErr;

// Update Job ops anchor (Option A)
const { error: jobUpdateErr } = await supabase
  .from("jobs")
  .update({
    ops_status: "failed_pending_retest",
    follow_up_date: null,
    pending_info_reason: null,
  })
  .eq("id", jobId);

if (jobUpdateErr) throw jobUpdateErr;

}
