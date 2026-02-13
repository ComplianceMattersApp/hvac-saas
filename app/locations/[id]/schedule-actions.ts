"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function scheduleVisit(formData: FormData) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Not authenticated");

  const locationId = String(formData.get("locationId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const visitId = String(formData.get("visitId") ?? "");
  const scheduledAt = String(formData.get("scheduledAt") ?? "");

  // optional
  const windowStart = String(formData.get("windowStart") ?? "");
  const windowEnd = String(formData.get("windowEnd") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!locationId || !jobId || !visitId || !scheduledAt) {
    throw new Error("Missing required fields");
  }

  // 1) Update visit schedule
  const { error: visitErr } = await supabase
    .from("job_visits")
    .update({
      status: "scheduled",
      scheduled_at: scheduledAt,
      window_start: windowStart || null,
      window_end: windowEnd || null,
      notes: notes || null,
    })
    .eq("id", visitId);

  if (visitErr) throw visitErr;

  // 2) Sync job ops anchor (Option A)
  const { error: jobErr } = await supabase
    .from("jobs")
    .update({
      scheduled_date: scheduledAt,
      window_start: windowStart || null,
      window_end: windowEnd || null,
      ops_status: "scheduled",
      pending_info_reason: null,
    })
    .eq("id", jobId);

  if (jobErr) throw jobErr;

  revalidatePath(`/locations/${locationId}`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/calendar`);
}
