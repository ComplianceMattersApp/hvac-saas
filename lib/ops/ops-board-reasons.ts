import { getCloseoutNeeds, isInCloseoutQueue } from "@/lib/utils/closeout";

export type OpsBoardReasonKey =
  | "needs_scheduling"
  | "needs_information"
  | "pending_contractor"
  | "pending_customer"
  | "waiting_on_contractor"
  | "waiting_on_customer"
  | "waiting_on_approval"
  | "waiting_on_parts"
  | "waiting_on_permit"
  | "waiting_on_photos_docs"
  | "on_hold"
  | "failed_ecc_test"
  | "needs_retest"
  | "needs_correction"
  | "needs_parts"
  | "needs_permit"
  | "missing_information"
  | "blocked"
  | "needs_invoice"
  | "needs_certs"
  | "needs_invoice_and_certs";

export type OpsBoardReasonOption = { key: OpsBoardReasonKey; label: string };
export type OpsBoardVisibleReason = { label: string; detail: string | null; source: "mapped" | "fallback" };

export const OPS_BOARD_REASON_OPTIONS: OpsBoardReasonOption[] = [
  { key: "needs_invoice_and_certs", label: "Needs invoice and certs" },
  { key: "needs_invoice", label: "Needs invoice" },
  { key: "needs_certs", label: "Needs certs" },
  { key: "failed_ecc_test", label: "Failed ECC test" },
  { key: "needs_retest", label: "Needs retest" },
  { key: "needs_correction", label: "Needs correction" },
  { key: "needs_permit", label: "Needs permit" },
  { key: "needs_parts", label: "Needs parts" },
  { key: "missing_information", label: "Missing information" },
  { key: "blocked", label: "Blocked" },
  { key: "waiting_on_approval", label: "Waiting on approval" },
  { key: "waiting_on_permit", label: "Waiting on permit" },
  { key: "waiting_on_parts", label: "Waiting on parts" },
  { key: "waiting_on_photos_docs", label: "Waiting on photos/docs" },
  { key: "waiting_on_contractor", label: "Waiting on contractor" },
  { key: "waiting_on_customer", label: "Waiting on customer" },
  { key: "pending_contractor", label: "Pending contractor" },
  { key: "pending_customer", label: "Pending customer" },
  { key: "needs_scheduling", label: "Needs scheduling" },
  { key: "needs_information", label: "Needs information" },
  { key: "on_hold", label: "On hold" },
];

const OPTION_BY_KEY = new Map(OPS_BOARD_REASON_OPTIONS.map((option) => [option.key, option]));

type OpsBoardReasonJob = {
  job_type?: string | null;
  ops_status?: string | null;
  pending_info_reason?: string | null;
  on_hold_reason?: string | null;
  next_action_note?: string | null;
  ops_board_failure_detail?: string | null;
  permit_number?: string | null;
  field_complete?: boolean | null;
  invoice_complete?: boolean | null;
  certs_complete?: boolean | null;
};

type OpsBoardReasonContext = {
  queueKey?: string | null;
};

type OpsBoardVisibleReasonFallback = string | (() => string);

export function normalizeOpsBoardReason(value: unknown): OpsBoardReasonKey | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return OPTION_BY_KEY.has(normalized as OpsBoardReasonKey) ? (normalized as OpsBoardReasonKey) : null;
}

function reasonText(job: OpsBoardReasonJob): string {
  return `${job.pending_info_reason ?? ""} ${job.on_hold_reason ?? ""}`.toLowerCase();
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function pendingReasonFromText(text: string): OpsBoardReasonKey | null {
  if (hasAny(text, ["part", "material", "equipment"])) return "waiting_on_parts";
  if (text.includes("permit")) return "waiting_on_permit";
  if (hasAny(text, ["photo", "picture", "doc", "document", "paperwork"])) return "waiting_on_photos_docs";
  if (hasAny(text, ["approval", "approve", "authorization", "authorized"])) return "waiting_on_approval";
  if (text.includes("contractor")) return "pending_contractor";
  if (hasAny(text, ["customer", "homeowner", "client", "tenant"])) return "pending_customer";
  return null;
}

function exceptionReasonFromText(text: string): OpsBoardReasonKey | null {
  if (hasAny(text, ["part", "material", "equipment"])) return "needs_parts";
  if (text.includes("permit")) return "needs_permit";
  if (hasAny(text, ["information", "info", "missing", "photo", "picture", "doc", "document"])) return "missing_information";
  if (hasAny(text, ["blocked", "blocker", "unable", "access"])) return "blocked";
  return null;
}

function closeoutReasonLabel(job: OpsBoardReasonJob, requireQueueEligibility = false): OpsBoardReasonOption | null {
  const opsStatus = String(job.ops_status ?? "").trim().toLowerCase();
  if (requireQueueEligibility && (!isInCloseoutQueue(job) || opsStatus === "closed")) return null;

  const needs = getCloseoutNeeds(job);
  if (needs.needsInvoice && needs.needsCerts) return OPTION_BY_KEY.get("needs_invoice_and_certs") ?? null;
  if (needs.needsInvoice) return OPTION_BY_KEY.get("needs_invoice") ?? null;
  if (needs.needsCerts) return OPTION_BY_KEY.get("needs_certs") ?? null;
  return null;
}

function cleanVisibleReasonDetail(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const normalized = text.toLowerCase();
  if (/^[a-z_]+$/.test(normalized) && normalized.includes("_")) return "";
  if (
    [
      "pending_info",
      "on_hold",
      "waiting",
      "failed",
      "retest_needed",
      "pending_office_review",
      "paperwork_required",
      "invoice_required",
      "need_to_schedule",
      "scheduled",
      "closed",
    ].includes(normalized)
  ) {
    return "";
  }

  for (const prefix of [
    "Materials Needed",
    "Approval Needed",
    "Other",
    "Waiting on part",
    "Waiting on parts",
    "Waiting on customer approval",
    "Waiting on approval",
    "Waiting on information",
    "Waiting on info",
    "Waiting on access",
  ]) {
    const marker = `${prefix}:`;
    if (normalized.startsWith(marker.toLowerCase())) {
      return text.slice(marker.length).trim();
    }
  }

  return text;
}

function normalizeVisibleText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDuplicateVisibleReasonDetail(label: string, detail: string): boolean {
  const normalizedLabel = normalizeVisibleText(label);
  const normalizedDetail = normalizeVisibleText(detail);
  if (!normalizedLabel || !normalizedDetail) return false;
  if (normalizedLabel === normalizedDetail) return true;
  if (normalizedLabel.startsWith("needs ") && normalizedLabel.replace(/^needs /, "") === normalizedDetail) return true;
  if (normalizedLabel.startsWith("waiting on ") && normalizedLabel.replace(/^waiting on /, "") === normalizedDetail) return true;
  return false;
}

function visibleDetailFromJob(job: OpsBoardReasonJob, mappedReason: OpsBoardReasonOption | null, context: OpsBoardReasonContext): string | null {
  if (!mappedReason) return null;
  if (context.queueKey === "closeout" && mappedReason.key.startsWith("needs_")) return null;

  const opsStatus = String(job.ops_status ?? "").trim().toLowerCase();
  const rawDetail =
    mappedReason.key === "failed_ecc_test"
      ? job.next_action_note ?? job.ops_board_failure_detail ?? job.pending_info_reason ?? job.on_hold_reason
      : opsStatus === "on_hold"
      ? job.on_hold_reason ?? job.pending_info_reason
      : job.pending_info_reason ?? job.on_hold_reason;
  const detail = cleanVisibleReasonDetail(rawDetail);
  if (!detail || isDuplicateVisibleReasonDetail(mappedReason.label, detail)) return null;
  return detail;
}

export function getOpsBoardReasonLabel(
  job: OpsBoardReasonJob,
  context: OpsBoardReasonContext = {},
): OpsBoardReasonOption | null {
  const opsStatus = String(job.ops_status ?? "").trim().toLowerCase();
  const jobType = String(job.job_type ?? "").trim().toLowerCase();
  const text = reasonText(job);

  if (context.queueKey === "closeout") {
    const closeoutReason = closeoutReasonLabel(job, true);
    if (closeoutReason) return closeoutReason;
  }

  if (opsStatus === "invoice_required" || opsStatus === "paperwork_required") {
    return closeoutReasonLabel(job);
  }

  if (opsStatus === "need_to_schedule") return OPTION_BY_KEY.get("needs_scheduling") ?? null;

  if (opsStatus === "on_hold") return OPTION_BY_KEY.get("on_hold") ?? null;

  if (opsStatus === "pending_info" || opsStatus === "waiting") {
    const derived = pendingReasonFromText(text);
    if (derived) return OPTION_BY_KEY.get(derived) ?? null;
    return OPTION_BY_KEY.get("needs_information") ?? null;
  }

  if (opsStatus === "failed") {
    if (jobType === "ecc") return OPTION_BY_KEY.get("failed_ecc_test") ?? null;
    return OPTION_BY_KEY.get(exceptionReasonFromText(text) ?? "needs_correction") ?? null;
  }

  if (opsStatus === "retest_needed") return OPTION_BY_KEY.get("needs_retest") ?? null;
  if (opsStatus === "pending_office_review") return OPTION_BY_KEY.get("needs_correction") ?? null;
  if (opsStatus === "problem") return OPTION_BY_KEY.get(exceptionReasonFromText(text) ?? "blocked") ?? null;

  return null;
}

export function getOpsBoardVisibleReasonLabel(
  job: OpsBoardReasonJob,
  fallback: OpsBoardVisibleReasonFallback,
  context: OpsBoardReasonContext = {},
): string {
  return getOpsBoardVisibleReason(job, fallback, context).label;
}

export function getOpsBoardVisibleReason(
  job: OpsBoardReasonJob,
  fallback: OpsBoardVisibleReasonFallback,
  context: OpsBoardReasonContext = {},
): OpsBoardVisibleReason {
  const mappedReason = getOpsBoardReasonLabel(job, context);
  if (mappedReason) {
    return {
      label: mappedReason.label,
      detail: visibleDetailFromJob(job, mappedReason, context),
      source: "mapped",
    };
  }

  const fallbackLabel = typeof fallback === "function" ? fallback() : fallback;
  const fallbackParts = splitFallbackVisibleReason(fallbackLabel);
  return {
    label: fallbackParts.label,
    detail: fallbackParts.detail,
    source: "fallback",
  };
}

function splitFallbackVisibleReason(value: string): { label: string; detail: string | null } {
  const text = String(value ?? "").trim();
  if (!text) return { label: "Operational Update", detail: null };
  const separatorIndex = text.indexOf(":");
  if (separatorIndex < 0) return { label: text, detail: null };

  const label = text.slice(0, separatorIndex).trim() || "Operational Update";
  const detail = cleanVisibleReasonDetail(text.slice(separatorIndex + 1));
  return {
    label,
    detail: detail && !isDuplicateVisibleReasonDetail(label, detail) ? detail : null,
  };
}

export function formatOpsBoardVisibleReasonText(reason: OpsBoardVisibleReason): string {
  return reason.detail ? `${reason.label}: ${reason.detail}` : reason.label;
}

export function getOpsBoardVisibleReasonDetail(
  job: OpsBoardReasonJob,
  context: OpsBoardReasonContext = {},
): string | null {
  const mappedLabel = getOpsBoardReasonLabel(job, context)?.label;
  if (!mappedLabel) return null;
  return getOpsBoardVisibleReason(job, "", context).detail;
}

export function buildOpsBoardReasonOptions(
  rows: OpsBoardReasonJob[],
  context: OpsBoardReasonContext = {},
): OpsBoardReasonOption[] {
  const keys = new Set<OpsBoardReasonKey>();
  for (const row of rows ?? []) {
    const reason = getOpsBoardReasonLabel(row, context);
    if (reason) keys.add(reason.key);
  }

  return OPS_BOARD_REASON_OPTIONS.filter((option) => keys.has(option.key));
}

export function filterOpsBoardRowsByReason<T extends OpsBoardReasonJob>(
  rows: T[],
  reason: OpsBoardReasonKey | null,
  context: OpsBoardReasonContext = {},
): T[] {
  if (!reason) return rows ?? [];
  return (rows ?? []).filter((row) => getOpsBoardReasonLabel(row, context)?.key === reason);
}
