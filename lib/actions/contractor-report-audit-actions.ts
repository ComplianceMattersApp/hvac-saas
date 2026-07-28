"use server";

import { createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";

type ReportAuditAction = "viewed" | "printed";

export async function recordContractorFailureReportAudit(input: {
  jobId: string;
  action: ReportAuditAction;
  mode?: "saved" | "current";
}) {
  const jobId = String(input.jobId ?? "").trim();
  const action = input.action === "printed" ? "printed" : "viewed";
  if (!jobId) throw new Error("Missing jobId");

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Not authenticated");

  const { data: contractorUser } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, contractor_id, contractors:contractor_id ( owner_user_id )")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!job) throw new Error("Job not found");

  const actorType = contractorUser?.contractor_id ? "contractor" : "internal";
  if (actorType === "contractor") {
    if (String(job.contractor_id ?? "") !== String(contractorUser?.contractor_id ?? "")) {
      throw new Error("Not authorized");
    }
  } else {
    const internal = await requireInternalUser({ supabase, userId: auth.user.id });
    const contractorRelation = job.contractors as unknown as
      { owner_user_id?: string | null } | Array<{ owner_user_id?: string | null }> | null;
    const ownerUserId = Array.isArray(contractorRelation)
      ? contractorRelation[0]?.owner_user_id
      : contractorRelation?.owner_user_id;
    if (
      String(ownerUserId ?? "") !==
      String(internal.internalUser.account_owner_user_id ?? "")
    ) {
      throw new Error("Not authorized");
    }
  }

  const eventType = `contractor_failure_report_${action}`;
  const { data: duplicate } = await supabase
    .from("job_events")
    .select("id")
    .eq("job_id", jobId)
    .eq("event_type", eventType)
    .eq("user_id", auth.user.id)
    .gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .limit(1)
    .maybeSingle();
  if (duplicate?.id) return { recorded: false };

  const { error: insertError } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: eventType,
    user_id: auth.user.id,
    message: action === "printed" ? "Contractor failure report printed" : "Contractor failure report viewed",
    meta: {
      actor_type: actorType,
      report_mode: input.mode === "current" ? "current" : "saved",
    },
  });
  if (insertError) throw new Error(insertError.message);
  return { recorded: true };
}
