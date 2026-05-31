"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { WORKFLOW_MILESTONE_STATUSES, type WorkflowMilestoneStatus } from "@/lib/workflows/read-model";
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
