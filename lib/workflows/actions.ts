"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
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

type NormalizedMilestoneDefinition = {
  milestoneKey: string | null;
  displayName: string;
  description: string | null;
  sortOrder: number;
  metadataJson: Record<string, unknown> | null;
};

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
