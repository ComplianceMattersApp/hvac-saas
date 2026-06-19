export const CONTRACTOR_INTAKE_QUEUE_PAGE_LIMIT = 200;
export const CONTRACTOR_INTAKE_QUEUE_EXPORT_LIMIT = 5000;

export type ContractorIntakeQueueRow = {
  id: string;
  contractorId: string;
  contractorName: string;
  submittedAt: string;
  submittedAtDisplay: string;
  submittedAgeDays: number;
  customerDisplay: string;
  addressDisplay: string;
  jobTypeLabel: string;
  projectTypeLabel: string;
  proposedTitle: string;
  notesPreview: string;
  reviewStatus: string;
  detailHref: string;
};

const CONTRACTOR_INTAKE_QUEUE_SELECT = `
  id,
  contractor_id,
  created_at,
  proposed_customer_first_name,
  proposed_customer_last_name,
  proposed_address_line1,
  proposed_city,
  proposed_state,
  proposed_zip,
  proposed_job_type,
  proposed_project_type,
  proposed_title,
  proposed_job_notes,
  review_status,
  contractors:contractor_id ( name )
`;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function formatSubmittedAt(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function submittedAgeDays(value: string) {
  const submittedAtMs = Date.parse(value);
  if (!Number.isFinite(submittedAtMs)) return 0;
  return Math.max(0, Math.floor((Date.now() - submittedAtMs) / (24 * 60 * 60 * 1000)));
}

function titleCaseToken(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function formatJobTypeLabel(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return "-";
  if (normalized === "ecc") return "ECC";
  return titleCaseToken(normalized);
}

function truncateText(value: unknown, maxLength = 120) {
  const text = normalizeText(value).replace(/\s+/g, " ");
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function contractorNameFromJoin(value: unknown) {
  if (Array.isArray(value)) {
    return normalizeText(value[0]?.name);
  }
  return normalizeText((value as any)?.name);
}

function mapSubmissionRow(row: any): ContractorIntakeQueueRow {
  const id = normalizeText(row?.id);
  const contractorId = normalizeText(row?.contractor_id);
  const submittedAt = normalizeText(row?.created_at);
  const firstName = normalizeText(row?.proposed_customer_first_name);
  const lastName = normalizeText(row?.proposed_customer_last_name);
  const addressLine = normalizeText(row?.proposed_address_line1);
  const city = normalizeText(row?.proposed_city);
  const state = normalizeText(row?.proposed_state);
  const zip = normalizeText(row?.proposed_zip);
  const locality = [[city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");

  return {
    id,
    contractorId,
    contractorName: contractorNameFromJoin(row?.contractors) || "Contractor",
    submittedAt,
    submittedAtDisplay: formatSubmittedAt(submittedAt),
    submittedAgeDays: submittedAgeDays(submittedAt),
    customerDisplay: [firstName, lastName].filter(Boolean).join(" ") || "-",
    addressDisplay: [addressLine, locality].filter(Boolean).join(" - ") || "-",
    jobTypeLabel: formatJobTypeLabel(row?.proposed_job_type),
    projectTypeLabel: titleCaseToken(normalizeText(row?.proposed_project_type)) || "-",
    proposedTitle: normalizeText(row?.proposed_title) || "Untitled intake",
    notesPreview: truncateText(row?.proposed_job_notes),
    reviewStatus: normalizeText(row?.review_status) || "pending",
    detailHref: `/ops/admin/contractor-intake-submissions/${id}`,
  };
}

function applyPendingIntakeScope(query: any, params: {
  accountOwnerUserId: string;
  contractorId?: string | null;
}) {
  let scoped = query
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("review_status", "pending");

  const contractorId = normalizeText(params.contractorId);
  if (contractorId) scoped = scoped.eq("contractor_id", contractorId);
  return scoped;
}

export async function countPendingContractorIntakeQueueRows(params: {
  supabase: any;
  accountOwnerUserId: string;
  contractorId?: string | null;
}): Promise<number> {
  const { count, error } = await applyPendingIntakeScope(
    params.supabase
      .from("contractor_intake_submissions")
      .select("id", { count: "exact", head: true }),
    params,
  );

  if (error) throw error;
  return Number(count ?? 0);
}

export async function listPendingContractorIntakeQueueRows(params: {
  supabase: any;
  accountOwnerUserId: string;
  contractorId?: string | null;
  limit?: number;
}): Promise<ContractorIntakeQueueRow[]> {
  const limit = Math.max(1, Math.min(Number(params.limit ?? CONTRACTOR_INTAKE_QUEUE_PAGE_LIMIT), CONTRACTOR_INTAKE_QUEUE_EXPORT_LIMIT));
  const query = applyPendingIntakeScope(
    params.supabase
      .from("contractor_intake_submissions")
      .select(CONTRACTOR_INTAKE_QUEUE_SELECT),
    params,
  )
    .order("created_at", { ascending: true })
    .limit(limit);

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []).map((row: any) => mapSubmissionRow(row)).filter((row: ContractorIntakeQueueRow) => row.id);
}

function csvEscape(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildContractorIntakeQueueCsv(rows: ContractorIntakeQueueRow[]) {
  const headers = [
    "submission_id",
    "submitted_at",
    "age_days",
    "contractor",
    "proposed_customer",
    "proposed_location",
    "job_type",
    "project_type",
    "proposed_title",
    "notes_preview",
    "review_status",
    "review_url",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.submittedAt,
        String(row.submittedAgeDays),
        row.contractorName,
        row.customerDisplay,
        row.addressDisplay,
        row.jobTypeLabel,
        row.projectTypeLabel,
        row.proposedTitle,
        row.notesPreview,
        row.reviewStatus,
        row.detailHref,
      ]
        .map((value) => csvEscape(String(value)))
        .join(","),
    );
  }

  return lines.join("\r\n");
}
