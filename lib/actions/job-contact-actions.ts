"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
type AttemptMethod = "call" | "text";

function addDays(dateYYYYMMDD: string, days: number) {
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function todayYYYYMMDD() {
  // en-CA gives YYYY-MM-DD format
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}


/**
 * Eddie cadence rule (hard-coded for now; easy to move to settings later):
 * - First 3 attempts: next follow-up = +1 day (daily)
 * - After that: next follow-up = +3 days (roughly twice per week)
 */
function nextFollowUpDate(attemptCountAfterInsert: number) {
  const base = todayYYYYMMDD();
  const daysToAdd = attemptCountAfterInsert <= 3 ? 1 : 3;
  return addDays(base, daysToAdd);
}

export async function logCustomerContactAttemptFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();

    // Actor (for timeline attribution)
  const { data: userData } = await supabase.auth.getUser();
  const actorId = userData?.user?.id ?? null;

  const jobId = String(formData.get("job_id") || "").trim();
  const method = String(formData.get("method") || "").trim() as AttemptMethod;
  const result = String(formData.get("result") || "").trim() || "no_answer";

  if (!jobId) throw new Error("Missing job_id");
  if (method !== "call" && method !== "text") throw new Error("Invalid method");

  // 1) Get existing attempt count + first attempt date
  const { data: attemptEvents, error: attemptsErr } = await supabase
    .from("job_events")
    .select("created_at, meta")
    .eq("job_id", jobId)
    .eq("event_type", "customer_attempt")
    .order("created_at", { ascending: true });

  if (attemptsErr) throw new Error(attemptsErr.message);

  const attemptCountBefore = attemptEvents?.length ?? 0;
  const attemptCountAfter = attemptCountBefore + 1;

  const firstAttemptDate =
    attemptEvents && attemptEvents.length > 0
      ? String(attemptEvents[0].created_at).slice(0, 10)
      : todayYYYYMMDD();

  // 2) Insert the attempt event (CYA)
const { error: insertErr } = await supabase.from("job_events").insert({
  job_id: jobId,
  user_id: actorId,   // 👈 new
  event_type: "customer_attempt",
  message: "Customer contact attempt logged",
  meta: {
    method,
    result,
    attempt_number: attemptCountAfter,
  },
});

if (insertErr) throw new Error(insertErr.message);

  // 3) Auto-set follow-up date based on cadence
  const followUp = nextFollowUpDate(attemptCountAfter);

  const { error: updateErr } = await supabase
    .from("jobs")
    .update({
      action_required_by: "customer",
      follow_up_date: followUp,
    })
    .eq("id", jobId);

  if (updateErr) throw new Error(updateErr.message);

  // 4) End-of-week escalation breadcrumb (>= 7 days since first attempt)
  const today = todayYYYYMMDD();
  // Compare YYYY-MM-DD strings works because ISO order is lexicographic
  const weekMark = addDays(firstAttemptDate, 7);

  if (today >= weekMark) {
    const { error: escErr } = await supabase.from("job_events").insert({
      job_id: jobId,
      event_type: "customer_escalation_suggested",
      message: "Customer unresponsive ~1 week. Consider notifying contractor for support.",
      meta: {
        first_attempt_date: firstAttemptDate,
        attempt_count: attemptCountAfter,
      },
      
    });
    

    if (escErr) throw new Error(escErr.message);
  }
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?tab=ops`);
}
