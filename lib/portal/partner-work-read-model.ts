import type { SupabaseClient } from "@supabase/supabase-js";

export type PartnerWorkSourceLabel = "Sent to Rater" | "Created by Rater";

type PartnerWorkSourceRequestRow = {
  source_job_id: string | null;
  handoff_status: string | null;
  sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isActiveFormalHandoffStatus(value: string) {
  return ["sent", "accepted", "completed"].includes(value);
}

function compareRequestRows(left: PartnerWorkSourceRequestRow, right: PartnerWorkSourceRequestRow) {
  return (
    toTimestamp(right.updated_at ?? right.sent_at ?? right.created_at) -
    toTimestamp(left.updated_at ?? left.sent_at ?? left.created_at)
  );
}

function isMissingWorkflowHandoffRequestsTable(error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  if (!error) return false;

  const message = [error.message, error.details, error.hint]
    .map((entry) => normalizeText(entry).toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (!message.includes("workflow_handoff_requests")) {
    return false;
  }

  return error.code === "42P01"
    || error.code === "PGRST205"
    || message.includes("not found")
    || message.includes("does not exist")
    || message.includes("schema cache");
}

export function buildPartnerWorkSourceLabelMap(input: {
  jobIds: string[];
  requestRows: PartnerWorkSourceRequestRow[];
}) {
  const labelByJobId = new Map<string, PartnerWorkSourceLabel>();

  for (const jobId of input.jobIds) {
    const normalizedJobId = normalizeText(jobId);
    if (normalizedJobId) {
      labelByJobId.set(normalizedJobId, "Created by Rater");
    }
  }

  const requestsByJobId = new Map<string, PartnerWorkSourceRequestRow[]>();
  for (const requestRow of input.requestRows) {
    const sourceJobId = normalizeText(requestRow.source_job_id);
    if (!sourceJobId) continue;
    if (!requestsByJobId.has(sourceJobId)) requestsByJobId.set(sourceJobId, []);
    requestsByJobId.get(sourceJobId)!.push(requestRow);
  }

  for (const [jobId, requestRows] of requestsByJobId.entries()) {
    const latestRequest = requestRows.slice().sort(compareRequestRows)[0] ?? null;
    if (!latestRequest) continue;

    const handoffStatus = normalizeText(latestRequest.handoff_status).toLowerCase();
    if (isActiveFormalHandoffStatus(handoffStatus)) {
      labelByJobId.set(jobId, "Sent to Rater");
    }
  }

  return labelByJobId;
}

export async function listPartnerWorkSourceLabelMapForJobs(input: {
  supabase: SupabaseClient;
  jobIds: string[];
}) {
  const normalizedJobIds = Array.from(new Set(input.jobIds.map((jobId) => normalizeText(jobId)).filter(Boolean)));
  if (normalizedJobIds.length === 0) {
    return new Map<string, PartnerWorkSourceLabel>();
  }

  const { data, error } = await input.supabase
    .from("workflow_handoff_requests")
    .select("source_job_id, handoff_status, sent_at, created_at, updated_at")
    .eq("handoff_kind", "ecc")
    .in("source_job_id", normalizedJobIds)
    .in("handoff_status", ["sent", "accepted", "completed"])
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingWorkflowHandoffRequestsTable(error)) {
      return buildPartnerWorkSourceLabelMap({ jobIds: normalizedJobIds, requestRows: [] });
    }

    throw error;
  }

  return buildPartnerWorkSourceLabelMap({
    jobIds: normalizedJobIds,
    requestRows: (data ?? []) as PartnerWorkSourceRequestRow[],
  });
}
