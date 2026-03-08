//app/locations/[id]/retest-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function scheduleRetest(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const locationId = String(formData.get("locationId") ?? "").trim();
  const jobId = String(formData.get("jobId") ?? "").trim();
  const scheduledAt = String(formData.get("scheduledAt") ?? "").trim();

  const windowStart = String(formData.get("windowStart") ?? "").trim();
  const windowEnd = String(formData.get("windowEnd") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!locationId || !jobId || !scheduledAt) {
    throw new Error("Missing required fields");
  }

  // Determine next visit number for this job
  const { data: existing, error: existingErr } = await supabase
    .from("job_visits")
    .select("visit_number")
    .eq("job_id", jobId)
    .order("visit_number", { ascending: false })
    .limit(1);

  if (existingErr) throw existingErr;

  const maxVisit = existing?.[0]?.visit_number ?? 0;
  const nextVisitNumber = maxVisit + 1;

  // Read current job snapshot before schedule update
  const { data: beforeJob, error: beforeErr } = await supabase
    .from("jobs")
    .select("scheduled_date, window_start, window_end, ops_status, parent_job_id")
    .eq("id", jobId)
    .maybeSingle();

  if (beforeErr) throw beforeErr;

  // Create the next visit already scheduled
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

  // Sync the child retest job schedule
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

  // Child timeline event
  const { error: childEventErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "retest_scheduled",
    user_id: user.id,
    meta: {
      visit_number: nextVisitNumber,
      scheduled_date: scheduledAt,
      window_start: windowStart || null,
      window_end: windowEnd || null,
      note: notes || null,
      before: {
        scheduled_date: beforeJob?.scheduled_date ?? null,
        window_start: beforeJob?.window_start ?? null,
        window_end: beforeJob?.window_end ?? null,
        ops_status: beforeJob?.ops_status ?? null,
      },
      after: {
        scheduled_date: scheduledAt,
        window_start: windowStart || null,
        window_end: windowEnd || null,
        ops_status: "scheduled",
      },
    },
  });

  if (childEventErr) throw childEventErr;

  // Parent breadcrumb if this retest job is linked to an original job
  const parentJobId = String(beforeJob?.parent_job_id ?? "").trim();
  if (parentJobId) {
    const { error: parentEventErr } = await supabase.from("job_events").insert({
      job_id: parentJobId,
      event_type: "retest_scheduled",
      user_id: user.id,
      meta: {
        child_job_id: jobId,
        visit_number: nextVisitNumber,
        scheduled_date: scheduledAt,
        window_start: windowStart || null,
        window_end: windowEnd || null,
      },
    });

    if (parentEventErr) throw parentEventErr;
  }

  revalidatePath(`/locations/${locationId}`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/ops`);
  revalidatePath(`/calendar`);
}