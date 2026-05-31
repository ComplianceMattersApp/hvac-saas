"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { WORKFLOW_MILESTONE_STATUSES, type WorkflowMilestoneStatus } from "@/lib/workflows/read-model";
import {
  resolveActiveAuthorizedHandoffRecipientSelection,
} from "@/lib/workflows/authorized-handoff-recipients-read";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import {
  loadScopedInternalJobForMutation,
  loadScopedInternalServiceCaseForMutation,
} from "@/lib/auth/internal-job-scope";

type WorkflowAssignmentResult =
  | {
      success: true;
      workflowInstanceId: string;
      created: boolean;
      milestoneCount: number;
      linkedJobCount: number;
    }
  | {
      success: false;
      error: string;
    };

type AssignWorkflowPresetToServiceCaseParams = {
  serviceCaseId: string;
  workflowPresetTemplateId: string;
  explicitJobIds?: string[] | null;
};

type UpdateWorkflowMilestoneStatusParams = {
  workflowInstanceId: string;
  milestoneId: string;
  status: string;
  statusReason?: string | null;
};

type RecordExternalEccCompletionForWorkflowMilestoneParams = {
  workflowInstanceId: string;
  milestoneId: string;
  completionNote: string;
  evidenceReference?: string | null;
};

type LinkInternalEccJobToWorkflowMilestoneParams = {
  workflowInstanceId: string;
  milestoneId: string;
  jobId: string;
};

type ConfirmLinkedInternalEccCompletionForWorkflowMilestoneParams = {
  workflowInstanceId: string;
  milestoneId: string;
  reviewNote?: string | null;
};

type SendWorkflowEccMilestoneToAuthorizedRaterParams = {
  workflowInstanceId: string;
  milestoneId: string;
  authorizedRecipientId?: string | null;
  jobId?: string | null;
};
type RespondToWorkflowHandoffRequestParams = {
  handoffRequestId: string;
  responseStatus: string;
  responseNote?: string | null;
  evidenceReference?: string | null;
};

type WorkflowMilestoneStatusUpdateResult =
  | {
      success: true;
      workflowInstanceId: string;
      milestoneId: string;
      status: WorkflowMilestoneStatus;
    }
  | {
      success: false;
      error: string;
    };

type ExternalEccWorkflowMilestoneUpdateResult =
  | {
      success: true;
      workflowInstanceId: string;
      milestoneId: string;
      status: "completed";
      statusReason: string;
    }
  | {
      success: false;
      error: string;
    };

type LinkInternalEccJobToWorkflowMilestoneResult =
  | {
      success: true;
      workflowInstanceId: string;
      milestoneId: string;
      jobId: string;
      workflowInstanceJobLinkId: string;
      created: boolean;
    }
  | {
      success: false;
      error: string;
    };

type ConfirmLinkedInternalEccCompletionForWorkflowMilestoneResult =
  | {
      success: true;
      workflowInstanceId: string;
      milestoneId: string;
      status: "completed";
      statusReason: string;
      jobId: string;
    }
  | {
      success: false;
      error: string;
    };

type SendWorkflowEccMilestoneToAuthorizedRaterResult =
  | {
      success: true;
      workflowInstanceId: string;
      milestoneId: string;
      status: "waiting";
      statusReason: string;
      authorizedRecipientId: string;
      recipientDisplayName: string;
      handoffRequestId: string;
      handoffRequestCreated: boolean;
    }
  | {
      success: false;
      error: string;
    };
type WorkflowHandoffResponseResult =
  | {
      success: true;
      handoffRequestId: string;
      handoffStatus: "accepted" | "completed" | "rejected";
      responseNote: string | null;
      evidenceReference: string | null;
    }
  | {
      success: false;
      error: string;
    };
function isSupportedWorkflowHandoffResponseStatus(value: string): value is "accepted" | "completed" | "rejected" {
  return value === "accepted" || value === "completed" || value === "rejected";
}

function isAllowedWorkflowHandoffStatusTransition(currentStatus: string, nextStatus: "accepted" | "completed" | "rejected") {
  if (currentStatus === "sent") {
    return nextStatus === "accepted" || nextStatus === "completed" || nextStatus === "rejected";
  }

  if (currentStatus === "accepted") {
    return nextStatus === "completed" || nextStatus === "rejected";
  }

  return false;
}

type EnsureInstallWithPermitWorkflowPresetResult =
  | {
      success: true;
      workflowPresetTemplateId: string;
      created: boolean;
    }
  | {
      success: false;
      error: string;
    };

type AssignInstallWithPermitWorkflowToJobParams = {
  jobId: string;
};

type AssignInstallWithPermitWorkflowToJobResult =
  | {
      success: true;
      workflowInstanceId: string;
      workflowPresetTemplateId: string;
      presetCreated: boolean;
      created: boolean;
      milestoneCount: number;
      linkedJobCount: number;
    }
  | {
      success: false;
      error: string;
    };

type NormalizedMilestoneDefinition = {
  milestoneKey: string | null;
  displayName: string;
  description: string | null;
  sortOrder: number;
  metadataJson: Record<string, unknown> | null;
};

const INSTALL_WITH_PERMIT_TEMPLATE_NAME = "Install with Permit";
const ECC_HANDOFF_COMPLETION_MILESTONE_KEY = "ecc_handoff_completion";
const ECC_HANDOFF_COMPLETION_MILESTONE_TITLE = "ecc handoff/completion";

const INSTALL_WITH_PERMIT_MILESTONE_DEFINITIONS = [
  {
    milestone_key: "install_work",
    display_name: "Install work",
    milestone_description: null,
    sort_order: 0,
    metadata_json: null,
  },
  {
    milestone_key: "ecc_handoff_completion",
    display_name: "ECC handoff/completion",
    milestone_description: null,
    sort_order: 1,
    metadata_json: null,
  },
  {
    milestone_key: "final_inspection",
    display_name: "Final inspection",
    milestone_description: null,
    sort_order: 2,
    metadata_json: null,
  },
  {
    milestone_key: "closeout",
    display_name: "Closeout",
    milestone_description: null,
    sort_order: 3,
    metadata_json: null,
  },
];

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullableString(value: unknown) {
  const normalized = cleanString(value);
  return normalized ? normalized : null;
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

function normalizeSortOrder(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function toNormalizedMilestoneDefinitions(value: unknown): NormalizedMilestoneDefinition[] {
  if (!Array.isArray(value)) return [];

  const normalized = value.map((entry, index) => {
    const raw = parseObject(entry);

    const milestoneKey = cleanNullableString(
      raw.milestone_key ?? raw.key ?? raw.id,
    );

    const displayName =
      cleanString(
        raw.display_name ?? raw.milestone_title ?? raw.title ?? raw.name,
      ) || `Milestone ${index + 1}`;

    const description = cleanNullableString(
      raw.milestone_description ?? raw.description,
    );

    const sortOrder = normalizeSortOrder(raw.sort_order ?? raw.order, index);

    const metadataJson = parseNullableObject(
      raw.metadata_json ?? raw.metadata,
    );

    return {
      milestoneKey,
      displayName,
      description,
      sortOrder,
      metadataJson,
      sourceIndex: index,
    };
  });

  normalized.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }

    return a.sourceIndex - b.sourceIndex;
  });

  return normalized.map(({ sourceIndex: _sourceIndex, ...row }, index) => ({
    ...row,
    sortOrder: index,
  }));
}

function normalizeExplicitJobIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];

  const seen = new Set<string>();
  const rows: string[] = [];

  for (const raw of value) {
    const jobId = cleanString(raw);
    if (!jobId || seen.has(jobId)) continue;
    seen.add(jobId);
    rows.push(jobId);
  }

  return rows;
}

function isAllowedMilestoneStatus(value: string): value is WorkflowMilestoneStatus {
  return (WORKFLOW_MILESTONE_STATUSES as readonly string[]).includes(value);
}

function canManageWorkflowPresetLifecycle(role: string) {
  const normalized = cleanString(role).toLowerCase();
  return normalized === "owner" || normalized === "admin";
}

function normalizeMilestoneTitleForComparison(value: unknown) {
  return cleanString(value).toLowerCase().replace(/\s+/g, " ");
}

function isEccHandoffCompletionMilestone(milestone: {
  milestone_key?: unknown;
  milestone_title?: unknown;
}) {
  const milestoneKey = cleanString(milestone.milestone_key).toLowerCase();
  if (milestoneKey) {
    return milestoneKey === ECC_HANDOFF_COMPLETION_MILESTONE_KEY;
  }

  const milestoneTitle = normalizeMilestoneTitleForComparison(milestone.milestone_title);
  return milestoneTitle === ECC_HANDOFF_COMPLETION_MILESTONE_TITLE;
}

function isCompletedOrFieldCompleteJob(job: {
  status?: unknown;
  field_complete?: unknown;
}) {
  return Boolean(job.field_complete) || cleanString(job.status).toLowerCase() === "completed";
}

function formatLinkedInternalEccCompletionReason(input: {
  jobDisplayNumber?: unknown;
  jobId: string;
  reviewNote: string;
}) {
  const jobDisplayNumber = cleanString(input.jobDisplayNumber);
  const jobReference = jobDisplayNumber ? `Job #${jobDisplayNumber}` : `Job ${input.jobId.slice(0, 8)}`;
  return `${jobReference}: ${input.reviewNote}`;
}

function withBanner(returnTo: string, banner: string) {
  const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/jobs";
  const [pathWithoutHash, hash = ""] = safeReturnTo.split("#", 2);
  const separator = pathWithoutHash.includes("?") ? "&" : "?";
  return `${pathWithoutHash}${separator}banner=${encodeURIComponent(banner)}${hash ? `#${hash}` : ""}`;
}

export async function ensureInstallWithPermitWorkflowPreset(): Promise<EnsureInstallWithPermitWorkflowPresetResult> {
  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required." };
      }
      return { success: false, error: "Active internal user required." };
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const actingUserId = cleanString(authz.userId);
  const role = cleanString(authz.internalUser.role).toLowerCase();

  if (!accountOwnerUserId || !actingUserId) {
    return { success: false, error: "Internal account scope is required." };
  }

  const admin = createAdminClient();

  const { data: existingRows, error: existingError } = await admin
    .from("workflow_preset_templates")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("template_name", INSTALL_WITH_PERMIT_TEMPLATE_NAME)
    .eq("lifecycle_status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (existingError) {
    return {
      success: false,
      error: existingError.message ?? "Failed to check workflow preset template.",
    };
  }

  const existingRowsList = Array.isArray(existingRows) ? existingRows : [];
  const existingId = cleanString((existingRowsList[0] as any)?.id);
  if (existingId) {
    return {
      success: true,
      workflowPresetTemplateId: existingId,
      created: false,
    };
  }

  if (!canManageWorkflowPresetLifecycle(role)) {
    return {
      success: false,
      error: "Owner/admin role required to create workflow guidance preset.",
    };
  }

  const { data: insertedPreset, error: insertError } = await admin
    .from("workflow_preset_templates")
    .insert({
      account_owner_user_id: accountOwnerUserId,
      template_name: INSTALL_WITH_PERMIT_TEMPLATE_NAME,
      template_description: "Default workflow guidance for permit-bound installation jobs.",
      lifecycle_status: "active",
      milestone_definition_json: INSTALL_WITH_PERMIT_MILESTONE_DEFINITIONS,
      created_by_user_id: actingUserId,
      updated_by_user_id: actingUserId,
    })
    .select("id")
    .single();

  if (insertError || !insertedPreset?.id) {
    const { data: fallbackRows, error: fallbackError } = await admin
      .from("workflow_preset_templates")
      .select("id")
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("template_name", INSTALL_WITH_PERMIT_TEMPLATE_NAME)
      .eq("lifecycle_status", "active")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (fallbackError) {
      return {
        success: false,
        error: insertError?.message ?? fallbackError.message ?? "Failed to create workflow preset template.",
      };
    }

    const fallbackRowsList = Array.isArray(fallbackRows) ? fallbackRows : [];
    const fallbackId = cleanString((fallbackRowsList[0] as any)?.id);
    if (fallbackId) {
      return {
        success: true,
        workflowPresetTemplateId: fallbackId,
        created: false,
      };
    }

    return {
      success: false,
      error: insertError?.message ?? "Failed to create workflow preset template.",
    };
  }

  return {
    success: true,
    workflowPresetTemplateId: cleanString(insertedPreset.id),
    created: true,
  };
}

export async function assignInstallWithPermitWorkflowToJob(
  params: AssignInstallWithPermitWorkflowToJobParams,
): Promise<AssignInstallWithPermitWorkflowToJobResult> {
  const jobId = cleanString(params.jobId);
  if (!jobId) {
    return { success: false, error: "job_id is required." };
  }

  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required." };
      }
      return { success: false, error: "Active internal user required." };
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const actorRole = cleanString(authz.internalUser.role).toLowerCase();
  if (!accountOwnerUserId) {
    return { success: false, error: "Internal account scope is required." };
  }

  if (!canManageWorkflowPresetLifecycle(actorRole)) {
    return {
      success: false,
      error: "Owner/admin role required to attach workflow guidance.",
    };
  }

  const admin = createAdminClient();

  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId,
    jobId,
    select: "id, service_case_id",
    admin,
  });

  if (!scopedJob?.id) {
    return {
      success: false,
      error: "job_id not found in this account.",
    };
  }

  const serviceCaseId = cleanString((scopedJob as any).service_case_id);
  if (!serviceCaseId) {
    return {
      success: false,
      error: "job_id is not attached to a service_case_id.",
    };
  }

  const ensuredPreset = await ensureInstallWithPermitWorkflowPreset();
  if (!ensuredPreset.success) {
    return ensuredPreset;
  }

  const assignment = await assignWorkflowPresetToServiceCase({
    serviceCaseId,
    workflowPresetTemplateId: ensuredPreset.workflowPresetTemplateId,
  });

  if (!assignment.success) {
    return assignment;
  }

  return {
    success: true,
    workflowInstanceId: assignment.workflowInstanceId,
    workflowPresetTemplateId: ensuredPreset.workflowPresetTemplateId,
    presetCreated: ensuredPreset.created,
    created: assignment.created,
    milestoneCount: assignment.milestoneCount,
    linkedJobCount: assignment.linkedJobCount,
  };
}

export async function assignWorkflowPresetToServiceCase(
  params: AssignWorkflowPresetToServiceCaseParams,
): Promise<WorkflowAssignmentResult> {
  const serviceCaseId = cleanString(params.serviceCaseId);
  const workflowPresetTemplateId = cleanString(params.workflowPresetTemplateId);
  const explicitJobIds = normalizeExplicitJobIds(params.explicitJobIds);

  if (!serviceCaseId) {
    return { success: false, error: "service_case_id is required." };
  }

  if (!workflowPresetTemplateId) {
    return { success: false, error: "workflow_preset_template_id is required." };
  }

  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required." };
      }
      return { success: false, error: "Active internal user required." };
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const actingUserId = cleanString(authz.userId);

  if (!accountOwnerUserId || !actingUserId) {
    return { success: false, error: "Internal account scope is required." };
  }

  const admin = createAdminClient();

  const scopedServiceCase = await loadScopedInternalServiceCaseForMutation({
    accountOwnerUserId,
    serviceCaseId,
    admin,
  });

  if (!scopedServiceCase?.id) {
    return { success: false, error: "service_case_id not found in this account." };
  }

  const { data: presetRowRaw, error: presetError } = await admin
    .from("workflow_preset_templates")
    .select(
      [
        "id",
        "account_owner_user_id",
        "template_name",
        "lifecycle_status",
        "milestone_definition_json",
        "updated_at",
      ].join(", "),
    )
    .eq("id", workflowPresetTemplateId)
    .maybeSingle();

  if (presetError) {
    return {
      success: false,
      error: presetError.message ?? "Failed to load workflow preset template.",
    };
  }

  const presetRow = (presetRowRaw ?? null) as Record<string, unknown> | null;

  if (!presetRow?.id) {
    return {
      success: false,
      error: "workflow_preset_template_id not found.",
    };
  }

  const presetOwnerUserId = cleanString(presetRow.account_owner_user_id);
  if (!presetOwnerUserId || presetOwnerUserId !== accountOwnerUserId) {
    return {
      success: false,
      error: "workflow_preset_template_id is out of account scope.",
    };
  }

  const presetLifecycleStatus = cleanString(presetRow.lifecycle_status).toLowerCase();
  if (presetLifecycleStatus !== "active") {
    return {
      success: false,
      error: "workflow preset template must be active.",
    };
  }

  const { data: existingRows, error: existingError } = await admin
    .from("workflow_instances")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("service_case_id", serviceCaseId)
    .eq("workflow_preset_template_id", workflowPresetTemplateId)
    .in("workflow_status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingError) {
    return {
      success: false,
      error: existingError.message ?? "Failed to check existing workflow assignment.",
    };
  }

  const existingRowsList = Array.isArray(existingRows) ? existingRows : [];
  const existingWorkflowInstanceId = cleanString((existingRowsList[0] as any)?.id);
  if (existingWorkflowInstanceId) {
    const { count: milestoneCount } = await admin
      .from("workflow_instance_milestones")
      .select("id", { count: "exact", head: true })
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("workflow_instance_id", existingWorkflowInstanceId);

    const { count: linkedJobCount } = await admin
      .from("workflow_instance_job_links")
      .select("id", { count: "exact", head: true })
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("workflow_instance_id", existingWorkflowInstanceId);

    return {
      success: true,
      workflowInstanceId: existingWorkflowInstanceId,
      created: false,
      milestoneCount: Number(milestoneCount ?? 0),
      linkedJobCount: Number(linkedJobCount ?? 0),
    };
  }

  const milestoneDefinitions = toNormalizedMilestoneDefinitions(
    presetRow.milestone_definition_json,
  );

  const templateSnapshotJson = {
    template_id: cleanString(presetRow.id),
    template_name: cleanString(presetRow.template_name),
    template_lifecycle_status: presetLifecycleStatus,
    template_updated_at: cleanNullableString(presetRow.updated_at),
    assigned_at: new Date().toISOString(),
    milestone_definitions: milestoneDefinitions.map((row) => ({
      milestone_key: row.milestoneKey,
      display_name: row.displayName,
      milestone_description: row.description,
      sort_order: row.sortOrder,
      metadata_json: row.metadataJson,
    })),
  };

  const workflowNameSnapshot = cleanString(presetRow.template_name) || "Workflow";

  const { data: insertedWorkflowInstance, error: insertedWorkflowError } = await admin
    .from("workflow_instances")
    .insert({
      account_owner_user_id: accountOwnerUserId,
      service_case_id: serviceCaseId,
      workflow_preset_template_id: workflowPresetTemplateId,
      workflow_name_snapshot: workflowNameSnapshot,
      workflow_status: "active",
      progress_percent: 0,
      template_snapshot_json: templateSnapshotJson,
      created_by_user_id: actingUserId,
      updated_by_user_id: actingUserId,
    })
    .select("id")
    .single();

  if (insertedWorkflowError || !insertedWorkflowInstance?.id) {
    return {
      success: false,
      error: insertedWorkflowError?.message ?? "Failed to assign workflow preset.",
    };
  }

  const workflowInstanceId = cleanString(insertedWorkflowInstance.id);

  if (milestoneDefinitions.length > 0) {
    const milestoneRows = milestoneDefinitions.map((definition, index) => ({
      account_owner_user_id: accountOwnerUserId,
      workflow_instance_id: workflowInstanceId,
      milestone_key: definition.milestoneKey,
      milestone_title: definition.displayName,
      milestone_description: definition.description,
      sort_order: definition.sortOrder,
      milestone_status: index === 0 ? "ready" : "planned",
      metadata_json: definition.metadataJson,
      created_by_user_id: actingUserId,
      updated_by_user_id: actingUserId,
    }));

    const { error: milestoneInsertError } = await admin
      .from("workflow_instance_milestones")
      .insert(milestoneRows);

    if (milestoneInsertError) {
      return {
        success: false,
        error:
          milestoneInsertError.message ??
          "Failed to materialize workflow milestones from preset.",
      };
    }
  }

  if (explicitJobIds.length > 0) {
    const linkRows: Array<Record<string, unknown>> = [];

    for (const jobId of explicitJobIds) {
      const scopedJob = await loadScopedInternalJobForMutation({
        accountOwnerUserId,
        jobId,
        admin,
      });

      if (!scopedJob?.id) {
        return {
          success: false,
          error: `job_id ${jobId} is out of scope for this account.`,
        };
      }

      const jobServiceCaseId = cleanString((scopedJob as any).service_case_id);
      if (!jobServiceCaseId || jobServiceCaseId !== serviceCaseId) {
        return {
          success: false,
          error: `job_id ${jobId} must belong to service_case_id ${serviceCaseId}.`,
        };
      }

      linkRows.push({
        account_owner_user_id: accountOwnerUserId,
        workflow_instance_id: workflowInstanceId,
        workflow_instance_milestone_id: null,
        job_id: jobId,
        link_role: "supporting",
        is_primary: false,
        linked_by_user_id: actingUserId,
        updated_by_user_id: actingUserId,
      });
    }

    if (linkRows.length > 0) {
      const { error: linkInsertError } = await admin
        .from("workflow_instance_job_links")
        .insert(linkRows);

      if (linkInsertError) {
        return {
          success: false,
          error:
            linkInsertError.message ??
            "Failed to link workflow assignment jobs.",
        };
      }
    }
  }

  return {
    success: true,
    workflowInstanceId,
    created: true,
    milestoneCount: milestoneDefinitions.length,
    linkedJobCount: explicitJobIds.length,
  };
}

export async function updateWorkflowMilestoneStatus(
  params: UpdateWorkflowMilestoneStatusParams,
): Promise<WorkflowMilestoneStatusUpdateResult> {
  const workflowInstanceId = cleanString(params.workflowInstanceId);
  const milestoneId = cleanString(params.milestoneId);
  const status = cleanString(params.status).toLowerCase();
  const statusReason = cleanNullableString(params.statusReason);

  if (!workflowInstanceId) {
    return { success: false, error: "workflow_instance_id is required." };
  }

  if (!milestoneId) {
    return { success: false, error: "milestone_id is required." };
  }

  if (!status) {
    return { success: false, error: "status is required." };
  }

  if (!isAllowedMilestoneStatus(status)) {
    return {
      success: false,
      error: "Invalid milestone status.",
    };
  }

  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required." };
      }
      return { success: false, error: "Active internal user required." };
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const actingUserId = cleanString(authz.userId);

  if (!accountOwnerUserId || !actingUserId) {
    return { success: false, error: "Internal account scope is required." };
  }

  const admin = createAdminClient();

  const { data: workflowInstance, error: workflowInstanceError } = await admin
    .from("workflow_instances")
    .select("id, account_owner_user_id")
    .eq("id", workflowInstanceId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (workflowInstanceError) {
    return {
      success: false,
      error: workflowInstanceError.message ?? "Failed to load workflow instance.",
    };
  }

  if (!workflowInstance?.id) {
    return {
      success: false,
      error: "workflow_instance_id not found in this account.",
    };
  }

  const { data: milestoneRow, error: milestoneReadError } = await admin
    .from("workflow_instance_milestones")
    .select("id, account_owner_user_id, workflow_instance_id")
    .eq("id", milestoneId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (milestoneReadError) {
    return {
      success: false,
      error: milestoneReadError.message ?? "Failed to load workflow milestone.",
    };
  }

  if (!milestoneRow?.id) {
    return {
      success: false,
      error: "milestone_id not found in this account.",
    };
  }

  const milestoneWorkflowInstanceId = cleanString(milestoneRow.workflow_instance_id);
  if (milestoneWorkflowInstanceId !== workflowInstanceId) {
    return {
      success: false,
      error: "milestone_id does not belong to workflow_instance_id.",
    };
  }

  const { data: updatedMilestone, error: milestoneUpdateError } = await admin
    .from("workflow_instance_milestones")
    .update({
      milestone_status: status,
      status_reason: statusReason,
      updated_by_user_id: actingUserId,
    })
    .eq("id", milestoneId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("workflow_instance_id", workflowInstanceId)
    .select("id, milestone_status")
    .maybeSingle();

  if (milestoneUpdateError || !updatedMilestone?.id) {
    return {
      success: false,
      error: milestoneUpdateError?.message ?? "Failed to update workflow milestone status.",
    };
  }

  return {
    success: true,
    workflowInstanceId,
    milestoneId: cleanString(updatedMilestone.id),
    status,
  };
}

export async function recordExternalEccCompletionForWorkflowMilestone(
  params: RecordExternalEccCompletionForWorkflowMilestoneParams,
): Promise<ExternalEccWorkflowMilestoneUpdateResult> {
  const workflowInstanceId = cleanString(params.workflowInstanceId);
  const milestoneId = cleanString(params.milestoneId);
  const completionNote = cleanString(params.completionNote);
  const evidenceReference = cleanNullableString(params.evidenceReference);

  if (!workflowInstanceId) {
    return { success: false, error: "workflow_instance_id is required." };
  }

  if (!milestoneId) {
    return { success: false, error: "milestone_id is required." };
  }

  if (!completionNote) {
    return { success: false, error: "completion_note is required." };
  }

  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required." };
      }
      return { success: false, error: "Active internal user required." };
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const actingUserId = cleanString(authz.userId);
  if (!accountOwnerUserId || !actingUserId) {
    return { success: false, error: "Internal account scope is required." };
  }

  const admin = createAdminClient();

  const { data: workflowInstance, error: workflowInstanceError } = await admin
    .from("workflow_instances")
    .select("id, account_owner_user_id")
    .eq("id", workflowInstanceId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (workflowInstanceError) {
    return {
      success: false,
      error: workflowInstanceError.message ?? "Failed to load workflow instance.",
    };
  }

  if (!workflowInstance?.id) {
    return {
      success: false,
      error: "workflow_instance_id not found in this account.",
    };
  }

  const { data: milestoneRow, error: milestoneReadError } = await admin
    .from("workflow_instance_milestones")
    .select("id, account_owner_user_id, workflow_instance_id, milestone_key, milestone_title")
    .eq("id", milestoneId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (milestoneReadError) {
    return {
      success: false,
      error: milestoneReadError.message ?? "Failed to load workflow milestone.",
    };
  }

  if (!milestoneRow?.id) {
    return {
      success: false,
      error: "milestone_id not found in this account.",
    };
  }

  const milestoneWorkflowInstanceId = cleanString(milestoneRow.workflow_instance_id);
  if (milestoneWorkflowInstanceId !== workflowInstanceId) {
    return {
      success: false,
      error: "milestone_id does not belong to workflow_instance_id.",
    };
  }

  if (!isEccHandoffCompletionMilestone(milestoneRow)) {
    return {
      success: false,
      error: "milestone_id is not ECC handoff/completion milestone.",
    };
  }

  const statusReason = evidenceReference
    ? `${completionNote} | Evidence: ${evidenceReference}`
    : completionNote;

  const { data: updatedMilestone, error: milestoneUpdateError } = await admin
    .from("workflow_instance_milestones")
    .update({
      milestone_status: "completed",
      status_reason: statusReason,
      updated_by_user_id: actingUserId,
    })
    .eq("id", milestoneId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("workflow_instance_id", workflowInstanceId)
    .select("id, milestone_status")
    .maybeSingle();

  if (milestoneUpdateError || !updatedMilestone?.id) {
    return {
      success: false,
      error: milestoneUpdateError?.message ?? "Failed to record external ECC completion.",
    };
  }

  return {
    success: true,
    workflowInstanceId,
    milestoneId: cleanString(updatedMilestone.id),
    status: "completed",
    statusReason,
  };
}

export async function linkInternalEccJobToWorkflowMilestone(
  params: LinkInternalEccJobToWorkflowMilestoneParams,
): Promise<LinkInternalEccJobToWorkflowMilestoneResult> {
  const workflowInstanceId = cleanString(params.workflowInstanceId);
  const milestoneId = cleanString(params.milestoneId);
  const jobId = cleanString(params.jobId);

  if (!workflowInstanceId) {
    return { success: false, error: "workflow_instance_id is required." };
  }

  if (!milestoneId) {
    return { success: false, error: "milestone_id is required." };
  }

  if (!jobId) {
    return { success: false, error: "job_id is required." };
  }

  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required." };
      }
      return { success: false, error: "Active internal user required." };
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const actingUserId = cleanString(authz.userId);
  if (!accountOwnerUserId || !actingUserId) {
    return { success: false, error: "Internal account scope is required." };
  }

  const admin = createAdminClient();

  const { data: workflowInstance, error: workflowInstanceError } = await admin
    .from("workflow_instances")
    .select("id, account_owner_user_id, service_case_id")
    .eq("id", workflowInstanceId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (workflowInstanceError) {
    return {
      success: false,
      error: workflowInstanceError.message ?? "Failed to load workflow instance.",
    };
  }

  if (!workflowInstance?.id) {
    return {
      success: false,
      error: "workflow_instance_id not found in this account.",
    };
  }

  const workflowServiceCaseId = cleanString(workflowInstance.service_case_id);
  if (!workflowServiceCaseId) {
    return {
      success: false,
      error: "workflow_instance_id is not attached to a service_case_id.",
    };
  }

  const { data: milestoneRow, error: milestoneReadError } = await admin
    .from("workflow_instance_milestones")
    .select("id, account_owner_user_id, workflow_instance_id, milestone_key, milestone_title")
    .eq("id", milestoneId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (milestoneReadError) {
    return {
      success: false,
      error: milestoneReadError.message ?? "Failed to load workflow milestone.",
    };
  }

  if (!milestoneRow?.id) {
    return {
      success: false,
      error: "milestone_id not found in this account.",
    };
  }

  const milestoneWorkflowInstanceId = cleanString(milestoneRow.workflow_instance_id);
  if (milestoneWorkflowInstanceId !== workflowInstanceId) {
    return {
      success: false,
      error: "milestone_id does not belong to workflow_instance_id.",
    };
  }

  if (!isEccHandoffCompletionMilestone(milestoneRow)) {
    return {
      success: false,
      error: "milestone_id is not ECC handoff/completion milestone.",
    };
  }

  const { data: targetJob, error: targetJobError } = await admin
    .from("jobs")
    .select("id, customer_id, service_case_id, job_type, deleted_at")
    .eq("id", jobId)
    .maybeSingle();

  if (targetJobError) {
    return {
      success: false,
      error: targetJobError.message ?? "Failed to load target job.",
    };
  }

  if (!targetJob?.id) {
    return {
      success: false,
      error: "job_id not found in this account.",
    };
  }

  if (targetJob.deleted_at != null) {
    return {
      success: false,
      error: "job_id is deleted and cannot be linked.",
    };
  }

  const targetJobCustomerId = cleanString(targetJob.customer_id);
  const targetJobServiceCaseId = cleanString(targetJob.service_case_id);
  const targetJobType = cleanString(targetJob.job_type).toLowerCase();

  if (!targetJobCustomerId) {
    return {
      success: false,
      error: "job_id not found in this account.",
    };
  }

  const { data: targetJobCustomer, error: targetJobCustomerError } = await admin
    .from("customers")
    .select("id")
    .eq("id", targetJobCustomerId)
    .eq("owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (targetJobCustomerError) {
    return {
      success: false,
      error: targetJobCustomerError.message ?? "Failed to scope target job.",
    };
  }

  if (!targetJobCustomer?.id) {
    return {
      success: false,
      error: "job_id not found in this account.",
    };
  }

  if (!targetJobServiceCaseId || targetJobServiceCaseId !== workflowServiceCaseId) {
    return {
      success: false,
      error: "job_id must belong to the same service_case_id as workflow_instance_id.",
    };
  }

  if (targetJobType !== "ecc") {
    return {
      success: false,
      error: "job_id must be an ECC job.",
    };
  }

  const { data: existingLinks, error: existingLinksError } = await admin
    .from("workflow_instance_job_links")
    .select("id, job_id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("workflow_instance_id", workflowInstanceId)
    .eq("workflow_instance_milestone_id", milestoneId);

  if (existingLinksError) {
    return {
      success: false,
      error: existingLinksError.message ?? "Failed to load existing milestone job links.",
    };
  }

  const existingLinkRows = Array.isArray(existingLinks) ? existingLinks : [];
  const matchingExistingLink = existingLinkRows.find(
    (row) => cleanString((row as any)?.job_id) === jobId,
  );

  if (matchingExistingLink) {
    return {
      success: true,
      workflowInstanceId,
      milestoneId,
      jobId,
      workflowInstanceJobLinkId: cleanString((matchingExistingLink as any)?.id),
      created: false,
    };
  }

  if (existingLinkRows.length > 0) {
    return {
      success: false,
      error: "ECC milestone already has a linked internal ECC job.",
    };
  }

  const { data: insertedLink, error: insertLinkError } = await admin
    .from("workflow_instance_job_links")
    .insert({
      account_owner_user_id: accountOwnerUserId,
      workflow_instance_id: workflowInstanceId,
      workflow_instance_milestone_id: milestoneId,
      job_id: jobId,
      link_role: "supporting",
      is_primary: false,
      linked_by_user_id: actingUserId,
      updated_by_user_id: actingUserId,
    })
    .select("id")
    .maybeSingle();

  if (insertLinkError || !insertedLink?.id) {
    return {
      success: false,
      error: insertLinkError?.message ?? "Failed to link internal ECC job.",
    };
  }

  return {
    success: true,
    workflowInstanceId,
    milestoneId,
    jobId,
    workflowInstanceJobLinkId: cleanString(insertedLink.id),
    created: true,
  };
}

export async function confirmLinkedInternalEccCompletionForWorkflowMilestone(
  params: ConfirmLinkedInternalEccCompletionForWorkflowMilestoneParams,
): Promise<ConfirmLinkedInternalEccCompletionForWorkflowMilestoneResult> {
  const workflowInstanceId = cleanString(params.workflowInstanceId);
  const milestoneId = cleanString(params.milestoneId);
  const reviewNote =
    cleanNullableString(params.reviewNote) ?? "Linked internal ECC job reviewed and completed.";

  if (!workflowInstanceId) {
    return { success: false, error: "workflow_instance_id is required." };
  }

  if (!milestoneId) {
    return { success: false, error: "milestone_id is required." };
  }

  if (!reviewNote) {
    return { success: false, error: "review_note is required." };
  }

  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required." };
      }
      return { success: false, error: "Active internal user required." };
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const actingUserId = cleanString(authz.userId);

  if (!accountOwnerUserId || !actingUserId) {
    return { success: false, error: "Internal account scope is required." };
  }

  const admin = createAdminClient();

  const { data: workflowInstance, error: workflowInstanceError } = await admin
    .from("workflow_instances")
    .select("id, service_case_id")
    .eq("id", workflowInstanceId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (workflowInstanceError) {
    return {
      success: false,
      error: workflowInstanceError.message ?? "Failed to load workflow instance.",
    };
  }

  if (!workflowInstance?.id) {
    return { success: false, error: "workflow_instance_id not found in this account." };
  }

  const workflowServiceCaseId = cleanString(workflowInstance.service_case_id);
  if (!workflowServiceCaseId) {
    return {
      success: false,
      error: "workflow_instance_id is not attached to a service_case_id.",
    };
  }

  const { data: milestoneRow, error: milestoneReadError } = await admin
    .from("workflow_instance_milestones")
    .select("id, workflow_instance_id, milestone_key, milestone_title")
    .eq("id", milestoneId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (milestoneReadError) {
    return {
      success: false,
      error: milestoneReadError.message ?? "Failed to load workflow milestone.",
    };
  }

  if (!milestoneRow?.id) {
    return { success: false, error: "milestone_id not found in this account." };
  }

  if (cleanString(milestoneRow.workflow_instance_id) !== workflowInstanceId) {
    return {
      success: false,
      error: "milestone_id does not belong to workflow_instance_id.",
    };
  }

  if (!isEccHandoffCompletionMilestone(milestoneRow)) {
    return {
      success: false,
      error: "milestone_id is not ECC handoff/completion milestone.",
    };
  }

  const { data: linkedJobRows, error: linkedJobsError } = await admin
    .from("workflow_instance_job_links")
    .select("job_id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("workflow_instance_id", workflowInstanceId)
    .eq("workflow_instance_milestone_id", milestoneId);

  if (linkedJobsError) {
    return {
      success: false,
      error: linkedJobsError.message ?? "Failed to load linked ECC jobs.",
    };
  }

  const linkedJobIds = (Array.isArray(linkedJobRows) ? linkedJobRows : [])
    .map((row) => cleanString((row as any)?.job_id))
    .filter(Boolean);

  if (linkedJobIds.length === 0) {
    return {
      success: false,
      error: "ECC milestone does not have a linked internal ECC job.",
    };
  }

  const { data: linkedJob, error: linkedJobError } = await admin
    .from("jobs")
    .select("id, customer_id, service_case_id, job_type, status, field_complete, job_display_number")
    .eq("id", linkedJobIds[0])
    .maybeSingle();

  if (linkedJobError) {
    return {
      success: false,
      error: linkedJobError.message ?? "Failed to load linked ECC job.",
    };
  }

  if (!linkedJob?.id) {
    return {
      success: false,
      error: "linked ECC job is not complete yet.",
    };
  }

  const linkedJobId = cleanString(linkedJob.id);
  const linkedJobCustomerId = cleanString(linkedJob.customer_id);
  const linkedJobServiceCaseId = cleanString(linkedJob.service_case_id);
  const linkedJobType = cleanString(linkedJob.job_type).toLowerCase();

  if (!linkedJobCustomerId) {
    return {
      success: false,
      error: "linked job is out of account scope.",
    };
  }

  const { data: linkedJobCustomer, error: linkedJobCustomerError } = await admin
    .from("customers")
    .select("id")
    .eq("id", linkedJobCustomerId)
    .eq("owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (linkedJobCustomerError) {
    return {
      success: false,
      error: linkedJobCustomerError.message ?? "Failed to scope linked ECC job.",
    };
  }

  if (!linkedJobCustomer?.id) {
    return {
      success: false,
      error: "linked job is out of account scope.",
    };
  }

  if (!linkedJobServiceCaseId || linkedJobServiceCaseId !== workflowServiceCaseId) {
    return {
      success: false,
      error: "linked job must belong to the same service_case_id as workflow_instance_id.",
    };
  }

  if (linkedJobType !== "ecc") {
    return {
      success: false,
      error: "linked job must be an ECC job.",
    };
  }

  if (!isCompletedOrFieldCompleteJob(linkedJob)) {
    return {
      success: false,
      error: "linked ECC job is not complete yet.",
    };
  }

  const statusReason = formatLinkedInternalEccCompletionReason({
    jobDisplayNumber: linkedJob.job_display_number,
    jobId: linkedJobId,
    reviewNote,
  });

  const { data: updatedMilestone, error: updateError } = await admin
    .from("workflow_instance_milestones")
    .update({
      milestone_status: "completed",
      status_reason: statusReason,
      updated_by_user_id: actingUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", milestoneId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("workflow_instance_id", workflowInstanceId)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedMilestone?.id) {
    return {
      success: false,
      error: updateError?.message ?? "Failed to confirm linked internal ECC completion.",
    };
  }

  return {
    success: true,
    workflowInstanceId,
    milestoneId,
    status: "completed",
    statusReason,
    jobId: linkedJobId,
  };
}

export async function sendWorkflowEccMilestoneToAuthorizedRater(
  params: SendWorkflowEccMilestoneToAuthorizedRaterParams,
): Promise<SendWorkflowEccMilestoneToAuthorizedRaterResult> {
  const workflowInstanceId = cleanString(params.workflowInstanceId);
  const milestoneId = cleanString(params.milestoneId);
  const requestedRecipientId = cleanNullableString(params.authorizedRecipientId);
  const sourceJobIdInput = cleanNullableString(params.jobId);

  if (!workflowInstanceId) {
    return { success: false, error: "workflow_instance_id is required." };
  }

  if (!milestoneId) {
    return { success: false, error: "milestone_id is required." };
  }

  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required." };
      }
      return { success: false, error: "Active internal user required." };
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const actingUserId = cleanString(authz.userId);

  if (!accountOwnerUserId || !actingUserId) {
    return { success: false, error: "Internal account scope is required." };
  }

  const admin = createAdminClient();

  const { data: workflowInstance, error: workflowInstanceError } = await admin
    .from("workflow_instances")
    .select("id, account_owner_user_id, service_case_id")
    .eq("id", workflowInstanceId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (workflowInstanceError) {
    return {
      success: false,
      error: workflowInstanceError.message ?? "Failed to load workflow instance.",
    };
  }

  if (!workflowInstance?.id) {
    return {
      success: false,
      error: "workflow_instance_id not found in this account.",
    };
  }

  const workflowServiceCaseId = cleanString((workflowInstance as { service_case_id?: string | null }).service_case_id);
  if (!workflowServiceCaseId) {
    return {
      success: false,
      error: "workflow_instance_id is not attached to a service_case_id.",
    };
  }

  const { data: milestoneRow, error: milestoneReadError } = await admin
    .from("workflow_instance_milestones")
    .select("id, account_owner_user_id, workflow_instance_id, milestone_key, milestone_title")
    .eq("id", milestoneId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (milestoneReadError) {
    return {
      success: false,
      error: milestoneReadError.message ?? "Failed to load workflow milestone.",
    };
  }

  if (!milestoneRow?.id) {
    return {
      success: false,
      error: "milestone_id not found in this account.",
    };
  }

  if (cleanString(milestoneRow.workflow_instance_id) !== workflowInstanceId) {
    return {
      success: false,
      error: "milestone_id does not belong to workflow_instance_id.",
    };
  }

  if (!isEccHandoffCompletionMilestone(milestoneRow)) {
    return {
      success: false,
      error: "milestone_id is not ECC handoff/completion milestone.",
    };
  }

  const selection = await resolveActiveAuthorizedHandoffRecipientSelection({
    supabase: admin,
    accountOwnerUserId,
    handoffKind: "ecc",
  });

  if (selection.mode === "none") {
    return {
      success: false,
      error: "No active authorized ECC rater is set up yet.",
    };
  }

  if (selection.mode === "multiple" && !requestedRecipientId) {
    return {
      success: false,
      error: "authorized_recipient_id is required when multiple recipients are active.",
    };
  }

  if (selection.mode === "single" && requestedRecipientId && requestedRecipientId !== selection.recipients[0]?.id) {
    return {
      success: false,
      error: "authorized_recipient_id is not an active ECC recipient in this account.",
    };
  }

  const resolvedRecipientId =
    selection.mode === "single"
      ? selection.recipients[0]?.id ?? null
      : requestedRecipientId;

  if (!resolvedRecipientId) {
    return {
      success: false,
      error: "authorized_recipient_id is required.",
    };
  }

  const recipient = selection.recipients.find((row) => row.id === resolvedRecipientId) ?? null;
  if (!recipient) {
    return {
      success: false,
      error: "authorized_recipient_id is not an active ECC recipient in this account.",
    };
  }

  if (cleanString(recipient.recipient_type).toLowerCase() === "connected_account_future") {
    return {
      success: false,
      error: "Connected-account ECC handoff is not available yet.",
    };
  }

  let sourceJobId: string | null = null;
  if (sourceJobIdInput) {
    const scopedJob = await loadScopedInternalJobForMutation({
      accountOwnerUserId,
      jobId: sourceJobIdInput,
      admin,
      select: "service_case_id",
    });

    if (!scopedJob?.id) {
      return {
        success: false,
        error: "job_id not found in this account.",
      };
    }

    const scopedJobServiceCaseId = cleanString((scopedJob as { service_case_id?: string | null }).service_case_id);
    if (!scopedJobServiceCaseId || scopedJobServiceCaseId !== workflowServiceCaseId) {
      return {
        success: false,
        error: "job_id must belong to the same service_case_id as workflow_instance_id.",
      };
    }

    sourceJobId = cleanString(scopedJob.id);
  }

  const handoffSentAt = new Date().toISOString();

  const { data: existingOpenRequest, error: existingOpenRequestError } = await admin
    .from("workflow_handoff_requests")
    .select("id")
    .eq("installer_account_owner_user_id", accountOwnerUserId)
    .eq("workflow_instance_id", workflowInstanceId)
    .eq("workflow_instance_milestone_id", milestoneId)
    .eq("authorized_handoff_recipient_id", recipient.id)
    .in("handoff_status", ["sent", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingOpenRequestError) {
    return {
      success: false,
      error: existingOpenRequestError.message ?? "Failed to load existing workflow handoff request.",
    };
  }

  let handoffRequestId = cleanString((existingOpenRequest as { id?: string | null } | null)?.id);
  let handoffRequestCreated = false;

  if (!handoffRequestId) {
    const { data: insertedRequest, error: insertRequestError } = await admin
      .from("workflow_handoff_requests")
      .insert({
        installer_account_owner_user_id: accountOwnerUserId,
        workflow_instance_id: workflowInstanceId,
        workflow_instance_milestone_id: milestoneId,
        service_case_id: workflowServiceCaseId,
        source_job_id: sourceJobId,
        authorized_handoff_recipient_id: recipient.id,
        recipient_type_snapshot: cleanString(recipient.recipient_type),
        recipient_display_name_snapshot: cleanString(recipient.display_name),
        handoff_kind: "ecc",
        handoff_status: "sent",
        sent_by_user_id: actingUserId,
        sent_at: handoffSentAt,
      })
      .select("id")
      .maybeSingle();

    if (insertRequestError) {
      const uniqueViolation = cleanString((insertRequestError as { code?: string | null }).code) === "23505";
      if (!uniqueViolation) {
        return {
          success: false,
          error: insertRequestError.message ?? "Failed to create workflow handoff request.",
        };
      }

      const { data: racedExistingRequest, error: racedExistingRequestError } = await admin
        .from("workflow_handoff_requests")
        .select("id")
        .eq("installer_account_owner_user_id", accountOwnerUserId)
        .eq("workflow_instance_id", workflowInstanceId)
        .eq("workflow_instance_milestone_id", milestoneId)
        .eq("authorized_handoff_recipient_id", recipient.id)
        .in("handoff_status", ["sent", "accepted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (racedExistingRequestError) {
        return {
          success: false,
          error: racedExistingRequestError.message ?? "Failed to resolve workflow handoff request after duplicate send.",
        };
      }

      handoffRequestId = cleanString((racedExistingRequest as { id?: string | null } | null)?.id);
      if (!handoffRequestId) {
        return {
          success: false,
          error: "Failed to resolve workflow handoff request after duplicate send.",
        };
      }
    } else {
      handoffRequestId = cleanString((insertedRequest as { id?: string | null } | null)?.id);
      if (!handoffRequestId) {
        return {
          success: false,
          error: "Failed to create workflow handoff request.",
        };
      }
      handoffRequestCreated = true;
    }
  }

  const statusReason = `Sent to authorized rater: ${cleanString(recipient.display_name)}`;

  const { data: updatedMilestone, error: updateError } = await admin
    .from("workflow_instance_milestones")
    .update({
      milestone_status: "waiting",
      status_reason: statusReason,
      updated_by_user_id: actingUserId,
      updated_at: handoffSentAt,
    })
    .eq("id", milestoneId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("workflow_instance_id", workflowInstanceId)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedMilestone?.id) {
    return {
      success: false,
      error: updateError?.message ?? "Failed to send ECC milestone to authorized rater.",
    };
  }

  return {
    success: true,
    workflowInstanceId,
    milestoneId,
    status: "waiting",
    statusReason,
    authorizedRecipientId: recipient.id,
    recipientDisplayName: cleanString(recipient.display_name),
    handoffRequestId,
    handoffRequestCreated,
  };
}
export async function respondToWorkflowHandoffRequest(
  params: RespondToWorkflowHandoffRequestParams,
): Promise<WorkflowHandoffResponseResult> {
  const handoffRequestId = cleanString(params.handoffRequestId);
  const responseStatus = cleanString(params.responseStatus).toLowerCase();
  const requestedResponseNote = cleanNullableString(params.responseNote);
  const evidenceReference = cleanNullableString(params.evidenceReference);

  if (!handoffRequestId) {
    return { success: false, error: "handoff_request_id is required." };
  }

  if (!isSupportedWorkflowHandoffResponseStatus(responseStatus)) {
    return { success: false, error: "response_status must be accepted, completed, or rejected." };
  }

  if (responseStatus === "rejected" && !requestedResponseNote) {
    return { success: false, error: "response_note is required when rejecting a handoff request." };
  }

  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required." };
      }
      return { success: false, error: "Active internal user required." };
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const actingUserId = cleanString(authz.userId);

  if (!accountOwnerUserId || !actingUserId) {
    return { success: false, error: "Internal account scope is required." };
  }

  const admin = createAdminClient();

  const { data: handoffRequest, error: handoffRequestError } = await admin
    .from("workflow_handoff_requests")
    .select("id, installer_account_owner_user_id, workflow_instance_id, workflow_instance_milestone_id, handoff_kind, handoff_status")
    .eq("id", handoffRequestId)
    .eq("installer_account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (handoffRequestError) {
    return {
      success: false,
      error: handoffRequestError.message ?? "Failed to load workflow handoff request.",
    };
  }

  if (!handoffRequest?.id) {
    return {
      success: false,
      error: "handoff_request_id not found in this account.",
    };
  }

  const handoffKind = cleanString((handoffRequest as { handoff_kind?: string | null }).handoff_kind).toLowerCase();
  if (handoffKind !== "ecc") {
    return {
      success: false,
      error: "handoff_request_id is not an ECC handoff request.",
    };
  }

  const currentStatus = cleanString((handoffRequest as { handoff_status?: string | null }).handoff_status).toLowerCase();
  if (!isAllowedWorkflowHandoffStatusTransition(currentStatus, responseStatus)) {
    return {
      success: false,
      error: `handoff request cannot transition from ${currentStatus || "unknown"} to ${responseStatus}.`,
    };
  }

  const respondedAt = new Date().toISOString();
  const responseNote = responseStatus === "completed"
    ? requestedResponseNote ?? "ECC completed by authorized rater."
    : requestedResponseNote;

  const { data: updatedRequest, error: updateError } = await admin
    .from("workflow_handoff_requests")
    .update({
      handoff_status: responseStatus,
      responded_by_user_id: actingUserId,
      responded_at: respondedAt,
      response_note: responseNote,
      evidence_reference: evidenceReference,
      updated_at: respondedAt,
    })
    .eq("id", handoffRequestId)
    .eq("installer_account_owner_user_id", accountOwnerUserId)
    .select("id, handoff_status, response_note, evidence_reference")
    .maybeSingle();

  if (updateError || !updatedRequest?.id) {
    return {
      success: false,
      error: updateError?.message ?? "Failed to update workflow handoff request.",
    };
  }

  return {
    success: true,
    handoffRequestId,
    handoffStatus: cleanString((updatedRequest as { handoff_status?: string | null }).handoff_status).toLowerCase() as "accepted" | "completed" | "rejected",
    responseNote: cleanNullableString((updatedRequest as { response_note?: string | null }).response_note),
    evidenceReference: cleanNullableString((updatedRequest as { evidence_reference?: string | null }).evidence_reference),
  };
}

export async function respondToWorkflowHandoffRequestFromForm(formData: FormData) {
  const handoffRequestId = cleanString(formData.get("handoff_request_id"));
  const responseStatus = cleanString(formData.get("response_status"));
  const responseNote = cleanNullableString(formData.get("response_note"));
  const evidenceReference = cleanNullableString(formData.get("evidence_reference"));
  const sourceJobId = cleanString(formData.get("source_job_id"));
  const returnTo = cleanString(formData.get("return_to")) || "/ops/handoffs";

  const result = await respondToWorkflowHandoffRequest({
    handoffRequestId,
    responseStatus,
    responseNote,
    evidenceReference,
  });

  if (!result.success) {
    redirect(withBanner(returnTo, "handoff_response_failed"));
  }

  revalidatePath("/ops/handoffs");
  if (sourceJobId) {
    revalidatePath(`/jobs/${sourceJobId}`);
  }

  const successBanner = result.handoffStatus === "accepted"
    ? "handoff_response_accepted"
    : result.handoffStatus === "completed"
    ? "handoff_response_completed"
    : "handoff_response_rejected";

  redirect(withBanner(returnTo, successBanner));
}

export async function updateWorkflowMilestoneStatusFromForm(formData: FormData) {
  const workflowInstanceId = cleanString(formData.get("workflow_instance_id"));
  const milestoneId = cleanString(formData.get("milestone_id"));
  const status = cleanString(formData.get("status"));
  const statusReason = cleanNullableString(formData.get("status_reason"));

  const result = await updateWorkflowMilestoneStatus({
    workflowInstanceId,
    milestoneId,
    status,
    statusReason,
  });

  if (!result.success) {
    throw new Error(result.error);
  }
}

export async function recordExternalEccCompletionForWorkflowMilestoneFromForm(formData: FormData) {
  const workflowInstanceId = cleanString(formData.get("workflow_instance_id"));
  const milestoneId = cleanString(formData.get("milestone_id"));
  const completionNote = cleanString(formData.get("completion_note"));
  const evidenceReference = cleanNullableString(formData.get("evidence_reference"));

  const result = await recordExternalEccCompletionForWorkflowMilestone({
    workflowInstanceId,
    milestoneId,
    completionNote,
    evidenceReference,
  });

  if (!result.success) {
    throw new Error(result.error);
  }
}

export async function linkInternalEccJobToWorkflowMilestoneFromForm(formData: FormData) {
  const workflowInstanceId = cleanString(formData.get("workflow_instance_id"));
  const milestoneId = cleanString(formData.get("milestone_id"));
  const jobId = cleanString(formData.get("job_id"));

  const result = await linkInternalEccJobToWorkflowMilestone({
    workflowInstanceId,
    milestoneId,
    jobId,
  });

  if (!result.success) {
    throw new Error(result.error);
  }
}

export async function confirmLinkedInternalEccCompletionForWorkflowMilestoneFromForm(formData: FormData) {
  const workflowInstanceId = cleanString(formData.get("workflow_instance_id"));
  const milestoneId = cleanString(formData.get("milestone_id"));
  const reviewNote = cleanNullableString(formData.get("review_note"));

  const result = await confirmLinkedInternalEccCompletionForWorkflowMilestone({
    workflowInstanceId,
    milestoneId,
    reviewNote,
  });

  if (!result.success) {
    throw new Error(result.error);
  }
}

export async function sendWorkflowEccMilestoneToAuthorizedRaterFromForm(formData: FormData) {
  const workflowInstanceId = cleanString(formData.get("workflow_instance_id"));
  const milestoneId = cleanString(formData.get("milestone_id"));
  const authorizedRecipientId = cleanNullableString(formData.get("authorized_recipient_id"));
  const jobId = cleanString(formData.get("job_id"));

  const result = await sendWorkflowEccMilestoneToAuthorizedRater({
    workflowInstanceId,
    milestoneId,
    authorizedRecipientId,
    jobId,
  });

  if (!result.success) {
    throw new Error(result.error);
  }

  if (jobId) {
    revalidatePath(`/jobs/${jobId}`);
  }
}

export async function assignInstallWithPermitWorkflowForJobFromForm(formData: FormData) {
  const jobId = cleanString(formData.get("job_id"));
  const returnTo = cleanString(formData.get("return_to")) || `/jobs/${jobId}#service-chain`;

  const result = await assignInstallWithPermitWorkflowToJob({ jobId });
  if (!result.success) {
    const banner =
      result.error === "job_id is not attached to a service_case_id."
        ? "workflow_guidance_service_case_required"
        : result.error === "Owner/admin role required to attach workflow guidance."
        ? "workflow_guidance_permission_required"
        : "workflow_guidance_add_failed";

    redirect(withBanner(returnTo, banner));
  }

  revalidatePath(`/jobs/${jobId}`);
  const successBanner = result.created
    ? "workflow_guidance_added"
    : "workflow_guidance_already_attached";
  redirect(withBanner(returnTo, successBanner));
}
