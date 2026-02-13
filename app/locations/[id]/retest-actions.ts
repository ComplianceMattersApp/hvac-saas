"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function scheduleRetest(formData: FormData) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Not authenticated");

  const locationId = String(formData.get("locationId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const scheduledAt = String(formData.get("scheduledAt") ?? "");

  const windowStart = String(formData.get("windowStart") ?? "");
  const windowEnd = String(formData.get("windowEnd") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!locationId || !jobId || !scheduledAt) {
    throw new Error("Missing required fields");
  }

  // 1) Determine next visit number for this job
  const { data: existing, error: existingErr } = await supabase
    .from("job_visits")
    .select("visit_number")
    .eq("job_id", jobId)
    .order("visit_number", { ascending: false })
    .limit(1);

  if (existingErr) throw existingErr;

  const maxVisit = existing?.[0]?.visit_number ?? 0;
  const nextVisitNumber = maxVisit + 1;

  // 2) Create the next visit already scheduled (ECC retest instance)
  const { error: insertErr } = await supabase.from("job_visits").insert({
    job_id: jobId,
    visit_number: nextVisitNumber,
    status: "scheduled",
    scheduled_at: scheduledAt,
    window_start: windowStart || null,
    window_end: windowEnd || null,
    notes: notes || null,
    needs_another_visit: false,
    outcome: null,
    closed_at: null,
  });

  if (insertErr) throw insertErr;

  // 3) Sync Job “next appointment” (Option A)
  const { error: jobErr } = await supabase
    .from("jobs")
    .update({
      scheduled_date: scheduledAt,
      window_start: windowStart || null,
      window_end: windowEnd || null,
      ops_status: "scheduled",
    })
    .eq("id", jobId);

  if (jobErr) throw jobErr;

  revalidatePath(`/locations/${locationId}`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/calendar`);
}
