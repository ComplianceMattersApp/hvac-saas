import { getCloseoutNeeds } from "@/lib/utils/closeout";

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
  field_complete?: boolean | null;
  invoice_complete?: boolean | null;
  certs_complete?: boolean | null;
};

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

export function getOpsBoardReasonLabel(job: OpsBoardReasonJob): OpsBoardReasonOption | null {
  const opsStatus = String(job.ops_status ?? "").trim().toLowerCase();
  const jobType = String(job.job_type ?? "").trim().toLowerCase();
  const text = reasonText(job);

  if (opsStatus === "invoice_required" || opsStatus === "paperwork_required") {
    const needs = getCloseoutNeeds(job);
    if (needs.needsInvoice && needs.needsCerts) return OPTION_BY_KEY.get("needs_invoice_and_certs") ?? null;
    if (needs.needsInvoice) return OPTION_BY_KEY.get("needs_invoice") ?? null;
    if (needs.needsCerts) return OPTION_BY_KEY.get("needs_certs") ?? null;
    return null;
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

export function buildOpsBoardReasonOptions(rows: OpsBoardReasonJob[]): OpsBoardReasonOption[] {
  const keys = new Set<OpsBoardReasonKey>();
  for (const row of rows ?? []) {
    const reason = getOpsBoardReasonLabel(row);
    if (reason) keys.add(reason.key);
  }

  return OPS_BOARD_REASON_OPTIONS.filter((option) => keys.has(option.key));
}

export function filterOpsBoardRowsByReason<T extends OpsBoardReasonJob>(
  rows: T[],
  reason: OpsBoardReasonKey | null,
): T[] {
  if (!reason) return rows ?? [];
  return (rows ?? []).filter((row) => getOpsBoardReasonLabel(row)?.key === reason);
}
