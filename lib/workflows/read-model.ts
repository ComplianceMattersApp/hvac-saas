export const WORKFLOW_MILESTONE_STATUSES = [
  "planned",
  "ready",
  "in_progress",
  "completed",
  "skipped",
  "blocked",
  "waiting",
  "needs_attention",
  "superseded",
] as const;

export type WorkflowMilestoneStatus = (typeof WORKFLOW_MILESTONE_STATUSES)[number];

export type WorkflowInstanceRow = {
  id: string;
  account_owner_user_id: string;
  service_case_id: string;
  workflow_preset_template_id: string | null;
  workflow_name_snapshot: string;
  workflow_status: string;
  progress_percent: number;
  template_snapshot_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WorkflowMilestoneRow = {
  id: string;
  account_owner_user_id: string;
  workflow_instance_id: string;
  milestone_key: string | null;
  milestone_title: string;
  milestone_description: string | null;
  sort_order: number;
  milestone_status: WorkflowMilestoneStatus | string;
  status_reason: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowLinkedJobRow = {
  id: string;
  account_owner_user_id: string;
  workflow_instance_id: string;
  workflow_instance_milestone_id: string | null;
  job_id: string;
  link_role: string;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  job: {
    id: string;
    job_display_number: string | null;
    service_case_id: string | null;
    title: string | null;
    status: string | null;
    ops_status: string | null;
    field_complete: boolean;
    scheduled_date: string | null;
    created_at: string | null;
  };
};

export type WorkflowInstanceWithMilestones = {
  instance: WorkflowInstanceRow | null;
  milestones: WorkflowMilestoneRow[];
};

type SupabaseLike = {
  from(table: string): any;
};

type AccountScopedParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
};

type ListInstancesForServiceCaseParams = AccountScopedParams & {
  serviceCaseId: string | null | undefined;
  includeArchived?: boolean;
  limit?: number | null;
};

type GetWorkflowInstanceWithMilestonesParams = AccountScopedParams & {
  workflowInstanceId: string | null | undefined;
};

type ListWorkflowMilestonesParams = AccountScopedParams & {
  workflowInstanceId: string | null | undefined;
};

type ListLinkedJobsParams = AccountScopedParams & {
  workflowInstanceId: string | null | undefined;
  milestoneId?: string | null;
};

const WORKFLOW_INSTANCE_SELECT = [
  "id",
  "account_owner_user_id",
  "service_case_id",
  "workflow_preset_template_id",
  "workflow_name_snapshot",
  "workflow_status",
  "progress_percent",
  "template_snapshot_json",
  "created_at",
  "updated_at",
].join(", ");

const WORKFLOW_MILESTONE_SELECT = [
  "id",
  "account_owner_user_id",
  "workflow_instance_id",
  "milestone_key",
  "milestone_title",
  "milestone_description",
  "sort_order",
  "milestone_status",
  "status_reason",
  "metadata_json",
  "created_at",
  "updated_at",
].join(", ");

const WORKFLOW_LINKED_JOB_SELECT = [
  "id",
  "account_owner_user_id",
  "workflow_instance_id",
  "workflow_instance_milestone_id",
  "job_id",
  "link_role",
  "is_primary",
  "notes",
  "created_at",
  "jobs(id, job_display_number, service_case_id, title, status, ops_status, field_complete, scheduled_date, created_at)",
].join(", ");

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullableString(value: unknown) {
  const normalized = cleanString(value);
  return normalized ? normalized : null;
}

function normalizeLimit(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return 50;
  return Math.min(Math.max(Math.trunc(Number(value)), 1), 250);
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseNullableObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseWorkflowInstanceRow(raw: any): WorkflowInstanceRow {
  const progressRaw = Number(raw?.progress_percent);
  const progressPercent = Number.isFinite(progressRaw)
    ? Math.min(Math.max(Math.trunc(progressRaw), 0), 100)
    : 0;

  return {
    id: cleanString(raw?.id),
    account_owner_user_id: cleanString(raw?.account_owner_user_id),
    service_case_id: cleanString(raw?.service_case_id),
    workflow_preset_template_id: cleanNullableString(raw?.workflow_preset_template_id),
    workflow_name_snapshot: cleanString(raw?.workflow_name_snapshot),
    workflow_status: cleanString(raw?.workflow_status).toLowerCase() || "active",
    progress_percent: progressPercent,
    template_snapshot_json: parseObject(raw?.template_snapshot_json),
    created_at: cleanString(raw?.created_at),
    updated_at: cleanString(raw?.updated_at),
  };
}

function parseWorkflowMilestoneRow(raw: any): WorkflowMilestoneRow {
  const sortOrderRaw = Number(raw?.sort_order);
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.max(0, Math.trunc(sortOrderRaw)) : 0;

  return {
    id: cleanString(raw?.id),
    account_owner_user_id: cleanString(raw?.account_owner_user_id),
    workflow_instance_id: cleanString(raw?.workflow_instance_id),
    milestone_key: cleanNullableString(raw?.milestone_key),
    milestone_title: cleanString(raw?.milestone_title),
    milestone_description: cleanNullableString(raw?.milestone_description),
    sort_order: sortOrder,
    milestone_status: cleanString(raw?.milestone_status).toLowerCase() || "planned",
    status_reason: cleanNullableString(raw?.status_reason),
    metadata_json: parseNullableObject(raw?.metadata_json),
    created_at: cleanString(raw?.created_at),
    updated_at: cleanString(raw?.updated_at),
  };
}

function parseWorkflowLinkedJobRow(raw: any): WorkflowLinkedJobRow {
  const jobRaw = raw?.jobs;
  return {
    id: cleanString(raw?.id),
    account_owner_user_id: cleanString(raw?.account_owner_user_id),
    workflow_instance_id: cleanString(raw?.workflow_instance_id),
    workflow_instance_milestone_id: cleanNullableString(raw?.workflow_instance_milestone_id),
    job_id: cleanString(raw?.job_id),
    link_role: cleanString(raw?.link_role) || "supporting",
    is_primary: Boolean(raw?.is_primary),
    notes: cleanNullableString(raw?.notes),
    created_at: cleanString(raw?.created_at),
    job: {
      id: cleanString(jobRaw?.id),
      job_display_number: cleanNullableString(jobRaw?.job_display_number),
      service_case_id: cleanNullableString(jobRaw?.service_case_id),
      title: cleanNullableString(jobRaw?.title),
      status: cleanNullableString(jobRaw?.status),
      ops_status: cleanNullableString(jobRaw?.ops_status),
      field_complete: Boolean(jobRaw?.field_complete),
      scheduled_date: cleanNullableString(jobRaw?.scheduled_date),
      created_at: cleanNullableString(jobRaw?.created_at),
    },
  };
}

export async function listActiveWorkflowInstancesByServiceCase(
  params: ListInstancesForServiceCaseParams,
): Promise<WorkflowInstanceRow[]> {
  const accountOwnerUserId = cleanString(params.accountOwnerUserId);
  const serviceCaseId = cleanString(params.serviceCaseId);
  if (!accountOwnerUserId || !serviceCaseId) return [];

  const includeArchived = Boolean(params.includeArchived);
  const limit = normalizeLimit(params.limit);

  let query = params.supabase
    .from("workflow_instances")
    .select(WORKFLOW_INSTANCE_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("service_case_id", serviceCaseId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!includeArchived) {
    query = query.in("workflow_status", ["active", "paused"]);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  return rows.map(parseWorkflowInstanceRow);
}

export async function listWorkflowInstanceMilestones(
  params: ListWorkflowMilestonesParams,
): Promise<WorkflowMilestoneRow[]> {
  const accountOwnerUserId = cleanString(params.accountOwnerUserId);
  const workflowInstanceId = cleanString(params.workflowInstanceId);
  if (!accountOwnerUserId || !workflowInstanceId) return [];

  const { data, error } = await params.supabase
    .from("workflow_instance_milestones")
    .select(WORKFLOW_MILESTONE_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("workflow_instance_id", workflowInstanceId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  return rows.map(parseWorkflowMilestoneRow);
}

export async function listLinkedJobsForWorkflow(
  params: ListLinkedJobsParams,
): Promise<WorkflowLinkedJobRow[]> {
  const accountOwnerUserId = cleanString(params.accountOwnerUserId);
  const workflowInstanceId = cleanString(params.workflowInstanceId);
  const milestoneId = cleanString(params.milestoneId);
  if (!accountOwnerUserId || !workflowInstanceId) return [];

  let query = params.supabase
    .from("workflow_instance_job_links")
    .select(WORKFLOW_LINKED_JOB_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("workflow_instance_id", workflowInstanceId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (milestoneId) {
    query = query.eq("workflow_instance_milestone_id", milestoneId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  return rows.map(parseWorkflowLinkedJobRow);
}

export async function getWorkflowInstanceWithMilestones(
  params: GetWorkflowInstanceWithMilestonesParams,
): Promise<WorkflowInstanceWithMilestones> {
  const accountOwnerUserId = cleanString(params.accountOwnerUserId);
  const workflowInstanceId = cleanString(params.workflowInstanceId);
  if (!accountOwnerUserId || !workflowInstanceId) {
    return { instance: null, milestones: [] };
  }

  const { data, error } = await params.supabase
    .from("workflow_instances")
    .select(WORKFLOW_INSTANCE_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("id", workflowInstanceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return { instance: null, milestones: [] };
  }

  const instance = parseWorkflowInstanceRow(data);
  const milestones = await listWorkflowInstanceMilestones({
    supabase: params.supabase,
    accountOwnerUserId,
    workflowInstanceId: instance.id,
  });

  return {
    instance,
    milestones,
  };
}