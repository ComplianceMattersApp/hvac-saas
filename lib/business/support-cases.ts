export type SupportCaseStatus = "open" | "waiting" | "resolved";
export type SupportCasePriority = "normal" | "high" | "urgent";
export type SupportCaseSource = "phone" | "text" | "email" | "in_app" | "internal";
export type SupportCaseNoteType = "internal_note" | "customer_update_summary" | "resolution_note";

export type SupportCaseSummary = {
  id: string;
  accountOwnerUserId: string;
  createdByUserId: string;
  assignedToUserId: string | null;
  status: SupportCaseStatus;
  priority: SupportCasePriority;
  source: SupportCaseSource;
  title: string;
  issueSummary: string;
  resolutionSummary: string | null;
  relatedCustomerId: string | null;
  relatedJobId: string | null;
  relatedInvoiceId: string | null;
  lastActivityAt: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SupportCaseNote = {
  id: string;
  supportCaseId: string;
  authorUserId: string;
  noteType: SupportCaseNoteType;
  body: string;
  createdAt: string | null;
};

export type SupportCaseCounts = {
  open: number;
  waiting: number;
  resolved: number;
};

function normalizeText(value: unknown, maxLength = 4000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function normalizeCount(value: unknown) {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.trunc(count));
}

export function parseSupportCaseStatus(value: unknown): SupportCaseStatus {
  const normalized = normalizeText(value, 40).toLowerCase();
  if (normalized === "open" || normalized === "waiting" || normalized === "resolved") {
    return normalized;
  }
  return "open";
}

export function parseSupportCasePriority(value: unknown): SupportCasePriority {
  const normalized = normalizeText(value, 40).toLowerCase();
  if (normalized === "high" || normalized === "urgent") return normalized;
  return "normal";
}

export function parseSupportCaseSource(value: unknown): SupportCaseSource {
  const normalized = normalizeText(value, 40).toLowerCase();
  if (
    normalized === "phone" ||
    normalized === "text" ||
    normalized === "email" ||
    normalized === "in_app" ||
    normalized === "internal"
  ) {
    return normalized;
  }
  return "phone";
}

export function parseSupportCaseNoteType(value: unknown): SupportCaseNoteType {
  const normalized = normalizeText(value, 40).toLowerCase();
  if (normalized === "customer_update_summary" || normalized === "resolution_note") {
    return normalized;
  }
  return "internal_note";
}

export function formatSupportCaseStatus(value: unknown) {
  const status = parseSupportCaseStatus(value);
  if (status === "open") return "Open";
  if (status === "waiting") return "Waiting";
  return "Resolved";
}

export function formatSupportCasePriority(value: unknown) {
  const priority = parseSupportCasePriority(value);
  if (priority === "urgent") return "Urgent";
  if (priority === "high") return "High";
  return "Normal";
}

export function formatSupportCaseSource(value: unknown) {
  const source = parseSupportCaseSource(value);
  if (source === "in_app") return "In-app";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function normalizeCase(row: any): SupportCaseSummary {
  return {
    id: normalizeText(row?.id),
    accountOwnerUserId: normalizeText(row?.account_owner_user_id),
    createdByUserId: normalizeText(row?.created_by_user_id),
    assignedToUserId: normalizeText(row?.assigned_to_user_id) || null,
    status: parseSupportCaseStatus(row?.status),
    priority: parseSupportCasePriority(row?.priority),
    source: parseSupportCaseSource(row?.source),
    title: normalizeText(row?.title, 200),
    issueSummary: normalizeText(row?.issue_summary, 4000),
    resolutionSummary: normalizeText(row?.resolution_summary, 4000) || null,
    relatedCustomerId: normalizeText(row?.related_customer_id) || null,
    relatedJobId: normalizeText(row?.related_job_id) || null,
    relatedInvoiceId: normalizeText(row?.related_invoice_id) || null,
    lastActivityAt: normalizeText(row?.last_activity_at) || null,
    resolvedAt: normalizeText(row?.resolved_at) || null,
    createdAt: normalizeText(row?.created_at) || null,
    updatedAt: normalizeText(row?.updated_at) || null,
  };
}

function normalizeNote(row: any): SupportCaseNote {
  return {
    id: normalizeText(row?.id),
    supportCaseId: normalizeText(row?.support_case_id),
    authorUserId: normalizeText(row?.author_user_id),
    noteType: parseSupportCaseNoteType(row?.note_type),
    body: normalizeText(row?.body, 4000),
    createdAt: normalizeText(row?.created_at) || null,
  };
}

export async function loadSupportCasesForAccount(params: {
  supabase: any;
  accountOwnerUserId: string;
  limit?: number;
}) {
  const accountOwnerUserId = normalizeText(params.accountOwnerUserId);
  if (!accountOwnerUserId) return [];
  const limit = Math.min(Math.max(Number(params.limit ?? 10) || 10, 1), 50);

  const { data, error } = await params.supabase
    .from("support_cases")
    .select("id, account_owner_user_id, created_by_user_id, assigned_to_user_id, status, priority, source, title, issue_summary, resolution_summary, related_customer_id, related_job_id, related_invoice_id, last_activity_at, resolved_at, created_at, updated_at")
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("last_activity_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(normalizeCase);
}

export async function loadSupportCaseCountsForAccount(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<SupportCaseCounts> {
  const accountOwnerUserId = normalizeText(params.accountOwnerUserId);
  if (!accountOwnerUserId) return { open: 0, waiting: 0, resolved: 0 };

  const [openResult, waitingResult, resolvedResult] = await Promise.all([
    params.supabase
      .from("support_cases")
      .select("id", { count: "exact", head: true })
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("status", "open"),
    params.supabase
      .from("support_cases")
      .select("id", { count: "exact", head: true })
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("status", "waiting"),
    params.supabase
      .from("support_cases")
      .select("id", { count: "exact", head: true })
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("status", "resolved"),
  ]);

  if (openResult.error) throw openResult.error;
  if (waitingResult.error) throw waitingResult.error;
  if (resolvedResult.error) throw resolvedResult.error;

  return {
    open: normalizeCount(openResult.count),
    waiting: normalizeCount(waitingResult.count),
    resolved: normalizeCount(resolvedResult.count),
  };
}

export async function loadSupportCaseById(params: {
  supabase: any;
  supportCaseId: string;
}) {
  const supportCaseId = normalizeText(params.supportCaseId);
  if (!supportCaseId) return null;

  const { data, error } = await params.supabase
    .from("support_cases")
    .select("id, account_owner_user_id, created_by_user_id, assigned_to_user_id, status, priority, source, title, issue_summary, resolution_summary, related_customer_id, related_job_id, related_invoice_id, last_activity_at, resolved_at, created_at, updated_at")
    .eq("id", supportCaseId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeCase(data) : null;
}

export async function loadSupportCaseNotes(params: {
  supabase: any;
  supportCaseId: string;
}) {
  const supportCaseId = normalizeText(params.supportCaseId);
  if (!supportCaseId) return [];

  const { data, error } = await params.supabase
    .from("support_case_notes")
    .select("id, support_case_id, author_user_id, note_type, body, created_at")
    .eq("support_case_id", supportCaseId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []).map(normalizeNote);
}

export async function createSupportCaseRecord(params: {
  supabase: any;
  accountOwnerUserId: string;
  actorUserId: string;
  title: string;
  issueSummary: string;
  priority: SupportCasePriority;
  source: SupportCaseSource;
  relatedCustomerId?: string | null;
}) {
  const title = normalizeText(params.title, 200);
  const issueSummary = normalizeText(params.issueSummary, 4000);
  if (!title) throw new Error("SUPPORT_CASE_TITLE_REQUIRED");
  if (!issueSummary) throw new Error("SUPPORT_CASE_ISSUE_SUMMARY_REQUIRED");

  const { data, error } = await params.supabase
    .from("support_cases")
    .insert({
      account_owner_user_id: normalizeText(params.accountOwnerUserId),
      created_by_user_id: normalizeText(params.actorUserId),
      priority: params.priority,
      source: params.source,
      title,
      issue_summary: issueSummary,
      related_customer_id: normalizeText(params.relatedCustomerId) || null,
      status: "open",
    })
    .select("id, account_owner_user_id, created_by_user_id, assigned_to_user_id, status, priority, source, title, issue_summary, resolution_summary, related_customer_id, related_job_id, related_invoice_id, last_activity_at, resolved_at, created_at, updated_at")
    .single();

  if (error) throw error;
  return normalizeCase(data);
}

export async function addSupportCaseNoteRecord(params: {
  supabase: any;
  supportCaseId: string;
  actorUserId: string;
  body: string;
  noteType: SupportCaseNoteType;
}) {
  const body = normalizeText(params.body, 4000);
  if (!body) throw new Error("SUPPORT_CASE_NOTE_REQUIRED");

  const { data, error } = await params.supabase
    .from("support_case_notes")
    .insert({
      support_case_id: normalizeText(params.supportCaseId),
      author_user_id: normalizeText(params.actorUserId),
      note_type: params.noteType,
      body,
    })
    .select("id, support_case_id, author_user_id, note_type, body, created_at")
    .single();

  if (error) throw error;
  return normalizeNote(data);
}

export async function updateSupportCaseStateRecord(params: {
  supabase: any;
  supportCaseId: string;
  status: SupportCaseStatus;
  priority?: SupportCasePriority;
  resolutionSummary?: string | null;
}) {
  const status = params.status;
  const resolutionSummary = normalizeText(params.resolutionSummary, 4000) || null;
  const patch: Record<string, unknown> = {
    status,
    priority: params.priority,
    resolution_summary: resolutionSummary,
    resolved_at: status === "resolved" ? new Date().toISOString() : null,
    last_activity_at: new Date().toISOString(),
  };

  if (!params.priority) delete patch.priority;

  const { data, error } = await params.supabase
    .from("support_cases")
    .update(patch)
    .eq("id", normalizeText(params.supportCaseId))
    .select("id, account_owner_user_id, created_by_user_id, assigned_to_user_id, status, priority, source, title, issue_summary, resolution_summary, related_customer_id, related_job_id, related_invoice_id, last_activity_at, resolved_at, created_at, updated_at")
    .single();

  if (error) throw error;
  return normalizeCase(data);
}
