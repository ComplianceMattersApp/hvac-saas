"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
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

async function requireOperationalContactMutationEntitlementAccessOrRedirect(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
}) {
  const access = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId: String(params.accountOwnerUserId ?? "").trim(),
    supabase: params.supabase,
  });

  if (access.authorized) {
    return;
  }

  const search = new URLSearchParams({
    err: "entitlement_blocked",
    reason: access.reason,
  });
  redirect(`/ops/admin/company-profile?${search.toString()}`);
}

export async function logCustomerContactAttemptFromForm(formData: FormData): Promise<void> {
  const timingEnabled = process.env.CONTACT_ATTEMPT_TIMING_DEBUG === "true";
  const actionStartMs = Date.now();
  let phaseStartMs = actionStartMs;
  const phaseDurationsMs: Record<string, number> = {};
  let returnToPresent = false;
  let returnToRevalidated = false;
  let escalationInserted = false;

  const completePhase = (phaseName: string) => {
    if (!timingEnabled) return;
    const nowMs = Date.now();
    phaseDurationsMs[phaseName] = nowMs - phaseStartMs;
    phaseStartMs = nowMs;
  };

  const setPhaseValue = (phaseName: string, durationMs: number) => {
    if (!timingEnabled) return;
    phaseDurationsMs[phaseName] = durationMs;
  };

  const emitTimingLog = (redirectTarget: string) => {
    if (!timingEnabled) return;
    console.info(
      "[contact-attempt-timing]",
      JSON.stringify({
        jobId,
        method,
        result,
        returnToPresent,
        returnToRevalidated,
        escalationInserted,
        totalActionMs: Date.now() - actionStartMs,
        redirectTarget,
        phasesMs: {
          parseInput: phaseDurationsMs.parseInput ?? 0,
          requireInternalUserAuth: phaseDurationsMs.requireInternalUserAuth ?? 0,
          scopedJobMutationCheck: phaseDurationsMs.scopedJobMutationCheck ?? 0,
          entitlementCheck: phaseDurationsMs.entitlementCheck ?? 0,
          priorCustomerAttemptRead: phaseDurationsMs.priorCustomerAttemptRead ?? 0,
          jobEventsInsert: phaseDurationsMs.jobEventsInsert ?? 0,
          jobsFollowUpUpdate: phaseDurationsMs.jobsFollowUpUpdate ?? 0,
          escalationBreadcrumbInsert: phaseDurationsMs.escalationBreadcrumbInsert ?? 0,
          revalidateJobPath: phaseDurationsMs.revalidateJobPath ?? 0,
          conditionalReturnToRevalidate: phaseDurationsMs.conditionalReturnToRevalidate ?? 0,
          redirectTargetPreparation: phaseDurationsMs.redirectTargetPreparation ?? 0,
        },
      }),
    );
  };

  const supabase = await createClient();
  if (timingEnabled) {
    phaseStartMs = Date.now();
  }

  const jobId = String(formData.get("job_id") || "").trim();
  const method = String(formData.get("method") || "").trim() as AttemptMethod;
  const result = String(formData.get("result") || "").trim() || "no_answer";
  const returnToRaw = String(formData.get("return_to") || "").trim();
  const successBannerRaw = String(formData.get("success_banner") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (method !== "call" && method !== "text") throw new Error("Invalid method");
  completePhase("parseInput");

  let actorId = "";
  let accountOwnerUserId = "";

  try {
    const authz = await requireInternalUser({ supabase });
    actorId = authz.userId;
    accountOwnerUserId = String(authz.internalUser.account_owner_user_id ?? "").trim();
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        redirect("/login");
      }
      redirect(`/jobs/${jobId}?notice=not_authorized`);
    }
    throw error;
  }
  completePhase("requireInternalUserAuth");

  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId,
    jobId,
    select: "id",
  });

  if (!scopedJob?.id) {
    redirect(`/jobs/${jobId}?notice=not_authorized`);
  }
  completePhase("scopedJobMutationCheck");

  await requireOperationalContactMutationEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });
  completePhase("entitlementCheck");

  // 1) Get existing attempt count + first attempt date
  const { data: attemptEvents, error: attemptsErr } = await supabase
    .from("job_events")
    .select("created_at, meta")
    .eq("job_id", jobId)
    .eq("event_type", "customer_attempt")
    .order("created_at", { ascending: true });

  if (attemptsErr) throw new Error(attemptsErr.message);
  completePhase("priorCustomerAttemptRead");

  const attemptCountBefore = attemptEvents?.length ?? 0;
  const attemptCountAfter = attemptCountBefore + 1;

  const firstAttemptDate =
    attemptEvents && attemptEvents.length > 0
      ? String(attemptEvents[0].created_at).slice(0, 10)
      : todayYYYYMMDD();

  // 2) Insert the attempt event (CYA)
  const { error: insertErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    user_id: actorId,
    event_type: "customer_attempt",
    message: "Customer contact attempt logged",
    meta: {
      method,
      result,
      attempt_number: attemptCountAfter,
    },
  });

  if (insertErr) throw new Error(insertErr.message);
  completePhase("jobEventsInsert");

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
  completePhase("jobsFollowUpUpdate");

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
    escalationInserted = true;
    completePhase("escalationBreadcrumbInsert");
  } else {
    setPhaseValue("escalationBreadcrumbInsert", 0);
  }

  revalidatePath(`/jobs/${jobId}`);
  completePhase("revalidateJobPath");

  returnToPresent = returnToRaw.startsWith("/") && !returnToRaw.startsWith("//");

  if (returnToPresent) {
    const redirectPrepStartMs = Date.now();
    const [pathOnly, searchRaw = ""] = returnToRaw.split("?");
    const search = new URLSearchParams(searchRaw);
    if (successBannerRaw) search.set("banner", successBannerRaw);
    setPhaseValue("redirectTargetPreparation", Date.now() - redirectPrepStartMs);
    if (timingEnabled) {
      phaseStartMs = Date.now();
    }

    if (pathOnly) {
      revalidatePath(pathOnly);
      returnToRevalidated = true;
      completePhase("conditionalReturnToRevalidate");
    } else {
      setPhaseValue("conditionalReturnToRevalidate", 0);
    }

    const redirectTarget = `${pathOnly}?${search.toString()}`;
    emitTimingLog(redirectTarget);
    redirect(redirectTarget);
  }

  setPhaseValue("conditionalReturnToRevalidate", 0);
  setPhaseValue("redirectTargetPreparation", 0);
  const redirectTarget = `/jobs/${jobId}?tab=ops&banner=contact_attempt_logged`;
  emitTimingLog(redirectTarget);
  redirect(redirectTarget);
}
