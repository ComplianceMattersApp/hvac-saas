"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import { canManageMaintenanceAgreementPolicy } from "@/lib/maintenance-agreements/role-policy";
import {
  MAINTENANCE_AGREEMENT_FREQUENCIES,
  MAINTENANCE_AGREEMENT_TYPES,
} from "@/lib/maintenance-agreements/read-model";
import {
  MAINTENANCE_AGREEMENT_TEMPLATE_REQUIRED_LOCKED_FIELD_KEYS,
  normalizeMaintenanceAgreementTemplateInternalNotes,
  normalizeMaintenanceAgreementTemplateName,
} from "@/lib/maintenance-agreements/template-read-model";
import {
  sanitizeVisitScopeItems,
  sanitizeVisitScopeSummary,
  type VisitScopeItem,
} from "@/lib/jobs/visit-scope";

type TemplateMutationResult =
  | { success: true; templateId: string }
  | { success: false; error: string };

type ChecklistItemInput = {
  item_label: string;
  default_guidance: string | null;
  sort_order: number;
};

function parseChecklistItemsJson(value: unknown): { ok: true; value: ChecklistItemInput[] } | { ok: false; error: string } {
  const normalized = cleanString(value);
  if (!normalized) return { ok: true, value: [] };

  try {
    const parsed = JSON.parse(normalized);
    if (!Array.isArray(parsed)) return { ok: true, value: [] };

    const items: ChecklistItemInput[] = [];
    for (const raw of parsed) {
      const label = cleanString(raw?.item_label);
      if (!label) continue;
      items.push({
        item_label: label.slice(0, 200),
        default_guidance: cleanString(raw?.default_guidance).slice(0, 500) || null,
        sort_order: Number.isInteger(Number(raw?.sort_order)) ? Number(raw.sort_order) : items.length,
      });
    }
    return { ok: true, value: items.slice(0, 30) };
  } catch {
    return { ok: false, error: "Checklist items must be valid JSON." };
  }
}

type CreateMaintenanceAgreementTemplateParams = {
  templateName: string;
  agreementType: string;
  frequency: string;
  defaultVisitScopeSummary?: string | null;
  defaultVisitScopeItemsJson?: string | null;
  internalNotesDefault?: string | null;
  checklistItemsJson?: string | null;
};

type UpdateMaintenanceAgreementTemplateParams = CreateMaintenanceAgreementTemplateParams & {
  templateId: string;
  checklistItemsJson?: string | null;
};

type ArchiveMaintenanceAgreementTemplateParams = {
  templateId: string;
};

type DuplicateMaintenanceAgreementTemplateParams = {
  templateId: string;
};

type DuplicateTemplateSourceRow = {
  id: string;
  template_name: string;
  agreement_type: string;
  frequency: string;
  default_visit_scope_summary: string | null;
  default_visit_scope_items: unknown;
  internal_notes_default: string | null;
  locked_field_keys: unknown;
  lock_policy_version: unknown;
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function parseEnumValue(value: unknown, allowedValues: readonly string[], fieldLabel: string) {
  const normalized = cleanString(value).toLowerCase();
  if (!allowedValues.includes(normalized)) {
    return { ok: false as const, error: `${fieldLabel} is invalid.` };
  }
  return { ok: true as const, value: normalized };
}

function parseVisitScopeItemsJson(value: unknown) {
  const normalized = cleanString(value);
  if (!normalized) {
    return { ok: true as const, value: [] as VisitScopeItem[] };
  }

  try {
    const parsed = JSON.parse(normalized);
    return { ok: true as const, value: sanitizeVisitScopeItems(parsed) };
  } catch {
    return {
      ok: false as const,
      error: "Default Work Items must be valid visit scope items.",
    };
  }
}

function normalizeLockedFieldKeys(value: unknown) {
  if (!Array.isArray(value)) {
    return [...MAINTENANCE_AGREEMENT_TEMPLATE_REQUIRED_LOCKED_FIELD_KEYS];
  }

  const deduped = Array.from(
    new Set(
      value
        .map((item) => cleanString(item))
        .filter(Boolean),
    ),
  );

  return deduped.length > 0
    ? deduped
    : [...MAINTENANCE_AGREEMENT_TEMPLATE_REQUIRED_LOCKED_FIELD_KEYS];
}

function normalizeLockPolicyVersion(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function buildDuplicateTemplateName(baseName: string, existingNames: string[]) {
  const normalizedBase = normalizeMaintenanceAgreementTemplateName(baseName);
  const fallbackBase = normalizedBase || "Template";
  const copyBase = `${fallbackBase} Copy`;

  const lowerTaken = new Set(existingNames.map((name) => normalizeMaintenanceAgreementTemplateName(name).toLowerCase()));
  if (!lowerTaken.has(copyBase.toLowerCase())) {
    return copyBase;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const candidate = `${copyBase} ${suffix}`;
    if (!lowerTaken.has(candidate.toLowerCase())) {
      return candidate;
    }
    suffix += 1;
  }

  return `${copyBase} ${Date.now()}`;
}

async function resolveTemplateMutationScope() {
  if (!isMaintenanceAgreementsEnabled()) {
    return { success: false as const, error: "Maintenance Agreements are currently unavailable." };
  }

  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { success: false as const, error: "Authentication required." };
      }
      return { success: false as const, error: "Active internal user required." };
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const userId = cleanString(authz.userId);
  if (!accountOwnerUserId || !userId) {
    return { success: false as const, error: "Internal account scope is required." };
  }

  const entitlement = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId,
    supabase,
  });

  if (!entitlement.authorized) {
    return {
      success: false as const,
      error: "Maintenance agreement updates are unavailable for this account.",
    };
  }

  if (
    !canManageMaintenanceAgreementPolicy({
      actorUserId: userId,
      internalUser: authz.internalUser,
    })
  ) {
    return {
      success: false as const,
      error: "Owner/admin internal role required for Service Plan template management.",
    };
  }

  return {
    success: true as const,
    supabase,
    accountOwnerUserId,
    userId,
  };
}

export async function createMaintenanceAgreementTemplate(
  params: CreateMaintenanceAgreementTemplateParams,
): Promise<TemplateMutationResult> {
  const scope = await resolveTemplateMutationScope();
  if (!scope.success) return scope;

  const templateName = normalizeMaintenanceAgreementTemplateName(params.templateName);
  if (!templateName) {
    return { success: false, error: "Template name is required." };
  }

  const agreementTypeResult = parseEnumValue(
    params.agreementType,
    MAINTENANCE_AGREEMENT_TYPES,
    "Agreement type",
  );
  if (!agreementTypeResult.ok) return { success: false, error: agreementTypeResult.error };

  const frequencyResult = parseEnumValue(
    params.frequency,
    MAINTENANCE_AGREEMENT_FREQUENCIES,
    "Frequency",
  );
  if (!frequencyResult.ok) return { success: false, error: frequencyResult.error };

  const defaultVisitScopeSummary = sanitizeVisitScopeSummary(params.defaultVisitScopeSummary);

  const defaultVisitScopeItemsResult = parseVisitScopeItemsJson(params.defaultVisitScopeItemsJson);
  if (!defaultVisitScopeItemsResult.ok) {
    return { success: false, error: defaultVisitScopeItemsResult.error };
  }

  const internalNotesDefault = normalizeMaintenanceAgreementTemplateInternalNotes(
    params.internalNotesDefault,
  );

  const checklistItemsResult = parseChecklistItemsJson(params.checklistItemsJson);
  if (!checklistItemsResult.ok) {
    return { success: false, error: checklistItemsResult.error };
  }

  const { data, error } = await scope.supabase
    .from("maintenance_agreement_templates")
    .insert({
      account_owner_user_id: scope.accountOwnerUserId,
      template_name: templateName,
      agreement_type: agreementTypeResult.value,
      frequency: frequencyResult.value,
      default_visit_scope_summary: defaultVisitScopeSummary,
      default_visit_scope_items: defaultVisitScopeItemsResult.value,
      internal_notes_default: internalNotesDefault,
      lifecycle_status: "active",
      created_by_user_id: scope.userId,
      updated_by_user_id: scope.userId,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return { success: false, error: error?.message ?? "Failed to create maintenance agreement template." };
  }

  const templateId = cleanString(data.id);

  if (checklistItemsResult.value.length > 0) {
    const admin = createAdminClient();
    await admin
      .from("maintenance_agreement_template_checklist_items")
      .insert(
        checklistItemsResult.value.map((item) => ({
          account_owner_user_id: scope.accountOwnerUserId,
          template_id: templateId,
          item_label: item.item_label,
          default_guidance: item.default_guidance,
          sort_order: item.sort_order,
          created_by_user_id: scope.userId,
        })),
      );
    // Non-fatal: checklist items failing to insert does not roll back the template.
    // Items can be re-added on edit.
  }

  return { success: true, templateId };
}

export async function updateMaintenanceAgreementTemplate(
  params: UpdateMaintenanceAgreementTemplateParams,
): Promise<TemplateMutationResult> {
  const scope = await resolveTemplateMutationScope();
  if (!scope.success) return scope;

  const templateId = cleanString(params.templateId);
  if (!templateId) {
    return { success: false, error: "Template id is required." };
  }

  const templateName = normalizeMaintenanceAgreementTemplateName(params.templateName);
  if (!templateName) {
    return { success: false, error: "Template name is required." };
  }

  const agreementTypeResult = parseEnumValue(
    params.agreementType,
    MAINTENANCE_AGREEMENT_TYPES,
    "Agreement type",
  );
  if (!agreementTypeResult.ok) return { success: false, error: agreementTypeResult.error };

  const frequencyResult = parseEnumValue(
    params.frequency,
    MAINTENANCE_AGREEMENT_FREQUENCIES,
    "Frequency",
  );
  if (!frequencyResult.ok) return { success: false, error: frequencyResult.error };

  const defaultVisitScopeSummary = sanitizeVisitScopeSummary(params.defaultVisitScopeSummary);

  const defaultVisitScopeItemsResult = parseVisitScopeItemsJson(params.defaultVisitScopeItemsJson);
  if (!defaultVisitScopeItemsResult.ok) {
    return { success: false, error: defaultVisitScopeItemsResult.error };
  }

  const internalNotesDefault = normalizeMaintenanceAgreementTemplateInternalNotes(
    params.internalNotesDefault,
  );

  const checklistItemsResult = parseChecklistItemsJson(params.checklistItemsJson);
  if (!checklistItemsResult.ok) {
    return { success: false, error: checklistItemsResult.error };
  }

  const { data, error } = await scope.supabase
    .from("maintenance_agreement_templates")
    .update({
      template_name: templateName,
      agreement_type: agreementTypeResult.value,
      frequency: frequencyResult.value,
      default_visit_scope_summary: defaultVisitScopeSummary,
      default_visit_scope_items: defaultVisitScopeItemsResult.value,
      internal_notes_default: internalNotesDefault,
      updated_by_user_id: scope.userId,
    })
    .eq("id", templateId)
    .eq("account_owner_user_id", scope.accountOwnerUserId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message ?? "Failed to update maintenance agreement template." };
  }
  if (!data?.id) {
    return { success: false, error: "Maintenance agreement template is out of scope." };
  }

  const admin = createAdminClient();
  // Delete-and-reinsert: checklist items are template-level definitions (not historical records).
  // No lock applies to checklist items since they are new in V1.
  await admin
    .from("maintenance_agreement_template_checklist_items")
    .delete()
    .eq("template_id", templateId)
    .eq("account_owner_user_id", scope.accountOwnerUserId);

  if (checklistItemsResult.value.length > 0) {
    await admin
      .from("maintenance_agreement_template_checklist_items")
      .insert(
        checklistItemsResult.value.map((item) => ({
          account_owner_user_id: scope.accountOwnerUserId,
          template_id: templateId,
          item_label: item.item_label,
          default_guidance: item.default_guidance,
          sort_order: item.sort_order,
          created_by_user_id: scope.userId,
        })),
      );
  }

  return { success: true, templateId: cleanString(data.id) };
}

export async function archiveMaintenanceAgreementTemplate(
  params: ArchiveMaintenanceAgreementTemplateParams,
): Promise<TemplateMutationResult> {
  const scope = await resolveTemplateMutationScope();
  if (!scope.success) return scope;

  const templateId = cleanString(params.templateId);
  if (!templateId) {
    return { success: false, error: "Template id is required." };
  }

  const { data, error } = await scope.supabase
    .from("maintenance_agreement_templates")
    .update({
      lifecycle_status: "archived",
      updated_by_user_id: scope.userId,
    })
    .eq("id", templateId)
    .eq("account_owner_user_id", scope.accountOwnerUserId)
    .neq("lifecycle_status", "archived")
    .select("id")
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message ?? "Failed to archive maintenance agreement template." };
  }

  if (!data?.id) {
    const { data: scopedTemplate, error: scopedTemplateError } = await scope.supabase
      .from("maintenance_agreement_templates")
      .select("id")
      .eq("id", templateId)
      .eq("account_owner_user_id", scope.accountOwnerUserId)
      .maybeSingle();

    if (scopedTemplateError) {
      return {
        success: false,
        error: scopedTemplateError.message ?? "Failed to archive maintenance agreement template.",
      };
    }

    if (scopedTemplate?.id) {
      return { success: true, templateId };
    }

    return { success: false, error: "Maintenance agreement template is out of scope." };
  }

  return { success: true, templateId: cleanString(data.id) };
}

export async function duplicateMaintenanceAgreementTemplate(
  params: DuplicateMaintenanceAgreementTemplateParams,
): Promise<TemplateMutationResult> {
  const scope = await resolveTemplateMutationScope();
  if (!scope.success) return scope;

  const templateId = cleanString(params.templateId);
  if (!templateId) {
    return { success: false, error: "Template id is required." };
  }

  const { data: sourceTemplate, error: sourceTemplateError } = await scope.supabase
    .from("maintenance_agreement_templates")
    .select(
      [
        "id",
        "template_name",
        "agreement_type",
        "frequency",
        "default_visit_scope_summary",
        "default_visit_scope_items",
        "internal_notes_default",
        "locked_field_keys",
        "lock_policy_version",
      ].join(", "),
    )
    .eq("id", templateId)
    .eq("account_owner_user_id", scope.accountOwnerUserId)
    .maybeSingle();

  if (sourceTemplateError) {
    return {
      success: false,
      error:
        sourceTemplateError.message ??
        "Failed to load maintenance agreement template for duplication.",
    };
  }

  const sourceTemplateRow = (sourceTemplate ?? null) as DuplicateTemplateSourceRow | null;

  if (!sourceTemplateRow?.id) {
    return { success: false, error: "Maintenance agreement template is out of scope." };
  }

  const sourceTemplateName = normalizeMaintenanceAgreementTemplateName(sourceTemplateRow.template_name);
  const { data: siblingTemplateRows, error: siblingTemplateRowsError } = await scope.supabase
    .from("maintenance_agreement_templates")
    .select("template_name")
    .eq("account_owner_user_id", scope.accountOwnerUserId)
    .limit(500);

  if (siblingTemplateRowsError) {
    return {
      success: false,
      error:
        siblingTemplateRowsError.message ??
        "Failed to resolve duplicate template naming.",
    };
  }

  const duplicateTemplateName = buildDuplicateTemplateName(
    sourceTemplateName,
    (Array.isArray(siblingTemplateRows) ? siblingTemplateRows : []).map((row: any) =>
      String(row?.template_name ?? ""),
    ),
  );

  const { data: duplicatedTemplate, error: duplicateError } = await scope.supabase
    .from("maintenance_agreement_templates")
    .insert({
      account_owner_user_id: scope.accountOwnerUserId,
      template_name: duplicateTemplateName,
      agreement_type: cleanString(sourceTemplateRow.agreement_type).toLowerCase(),
      frequency: cleanString(sourceTemplateRow.frequency).toLowerCase(),
      default_visit_scope_summary: sanitizeVisitScopeSummary(sourceTemplateRow.default_visit_scope_summary),
      default_visit_scope_items: sanitizeVisitScopeItems(sourceTemplateRow.default_visit_scope_items),
      internal_notes_default: normalizeMaintenanceAgreementTemplateInternalNotes(
        sourceTemplateRow.internal_notes_default,
      ),
      locked_field_keys: normalizeLockedFieldKeys(sourceTemplateRow.locked_field_keys),
      lock_policy_version: normalizeLockPolicyVersion(sourceTemplateRow.lock_policy_version),
      lifecycle_status: "active",
      created_by_user_id: scope.userId,
      updated_by_user_id: scope.userId,
    })
    .select("id")
    .single();

  if (duplicateError || !duplicatedTemplate?.id) {
    return {
      success: false,
      error:
        duplicateError?.message ?? "Failed to duplicate maintenance agreement template.",
    };
  }

  return { success: true, templateId: cleanString(duplicatedTemplate.id) };
}

const TEMPLATE_FORM_LOCKED_FIELD_ERROR = "maintenance_agreement_locked_field_update_blocked";
const ADMIN_ROUTE = "/ops/admin/service-plan-templates";

async function resolveFormMutationScope(): Promise<
  | { success: true; accountOwnerUserId: string; userId: string }
  | never
> {
  if (!isMaintenanceAgreementsEnabled()) {
    redirect(`${ADMIN_ROUTE}?error=${encodeURIComponent("Maintenance Agreements are currently unavailable.")}`);
  }

  const supabase = await createClient();
  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect(`${ADMIN_ROUTE}?error=${encodeURIComponent("Active internal user required.")}`);
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const userId = cleanString(authz.userId);

  if (!canManageMaintenanceAgreementPolicy({ actorUserId: userId, internalUser: authz.internalUser })) {
    redirect(`${ADMIN_ROUTE}?error=${encodeURIComponent("Owner/admin internal role required for Service Plan template management.")}`);
  }

  return { success: true, accountOwnerUserId, userId };
}

export async function createServicePlanTemplateFromForm(formData: FormData): Promise<void> {
  const scope = await resolveFormMutationScope();

  const templateName = normalizeMaintenanceAgreementTemplateName(formData.get("template_name"));
  if (!templateName) {
    redirect(`${ADMIN_ROUTE}?action=create&error=${encodeURIComponent("Template name is required.")}`);
  }

  const agreementType = cleanString(formData.get("agreement_type")).toLowerCase() || "maintenance";
  if (!MAINTENANCE_AGREEMENT_TYPES.includes(agreementType as any)) {
    redirect(`${ADMIN_ROUTE}?action=create&error=${encodeURIComponent("Agreement type is invalid.")}`);
  }

  const frequency = cleanString(formData.get("frequency")).toLowerCase();
  if (!MAINTENANCE_AGREEMENT_FREQUENCIES.includes(frequency as any)) {
    redirect(`${ADMIN_ROUTE}?action=create&error=${encodeURIComponent("Frequency is invalid.")}`);
  }

  const defaultVisitScopeSummary = sanitizeVisitScopeSummary(formData.get("default_visit_scope_summary"));
  const scopeItemsResult = parseVisitScopeItemsJson(formData.get("default_visit_scope_items_json"));
  if (!scopeItemsResult.ok) {
    redirect(`${ADMIN_ROUTE}?action=create&error=${encodeURIComponent(scopeItemsResult.error)}`);
  }
  const internalNotesDefault = normalizeMaintenanceAgreementTemplateInternalNotes(formData.get("internal_notes_default"));
  const checklistItemsResult = parseChecklistItemsJson(formData.get("checklist_items_json"));
  if (!checklistItemsResult.ok) {
    redirect(`${ADMIN_ROUTE}?action=create&error=${encodeURIComponent(checklistItemsResult.error)}`);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("maintenance_agreement_templates")
    .insert({
      account_owner_user_id: scope.accountOwnerUserId,
      template_name: templateName,
      agreement_type: agreementType,
      frequency,
      default_visit_scope_summary: defaultVisitScopeSummary,
      default_visit_scope_items: scopeItemsResult.value,
      internal_notes_default: internalNotesDefault,
      lifecycle_status: "active",
      created_by_user_id: scope.userId,
      updated_by_user_id: scope.userId,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    redirect(`${ADMIN_ROUTE}?action=create&error=${encodeURIComponent(error?.message ?? "Failed to create template.")}`);
  }

  if (checklistItemsResult.value.length > 0) {
    await admin
      .from("maintenance_agreement_template_checklist_items")
      .insert(
        checklistItemsResult.value.map((item) => ({
          account_owner_user_id: scope.accountOwnerUserId,
          template_id: data.id,
          item_label: item.item_label,
          default_guidance: item.default_guidance,
          sort_order: item.sort_order,
          created_by_user_id: scope.userId,
        })),
      );
    // Non-fatal: items failing here do not block the template creation redirect.
  }

  revalidatePath(ADMIN_ROUTE);
  redirect(`${ADMIN_ROUTE}?notice=template_created`);
}

export async function updateServicePlanTemplateFromForm(formData: FormData): Promise<void> {
  const scope = await resolveFormMutationScope();

  const templateId = cleanString(formData.get("template_id"));
  if (!templateId) {
    redirect(`${ADMIN_ROUTE}?error=${encodeURIComponent("Template id is required.")}`);
  }

  const submittedFrequency = cleanString(formData.get("frequency"));
  const submittedAgreementType = cleanString(formData.get("agreement_type"));
  if (submittedFrequency || submittedAgreementType) {
    redirect(
      `${ADMIN_ROUTE}?action=edit&tplId=${encodeURIComponent(templateId)}&error=${encodeURIComponent(
        `${TEMPLATE_FORM_LOCKED_FIELD_ERROR}: Cadence cannot be changed after a template is created.`,
      )}`,
    );
  }

  const templateName = normalizeMaintenanceAgreementTemplateName(formData.get("template_name"));
  if (!templateName) {
    redirect(`${ADMIN_ROUTE}?action=edit&tplId=${encodeURIComponent(templateId)}&error=${encodeURIComponent("Template name is required.")}`);
  }

  const defaultVisitScopeSummary = sanitizeVisitScopeSummary(formData.get("default_visit_scope_summary"));
  const scopeItemsResult = parseVisitScopeItemsJson(formData.get("default_visit_scope_items_json"));
  if (!scopeItemsResult.ok) {
    redirect(`${ADMIN_ROUTE}?action=edit&tplId=${encodeURIComponent(templateId)}&error=${encodeURIComponent(scopeItemsResult.error)}`);
  }
  const internalNotesDefault = normalizeMaintenanceAgreementTemplateInternalNotes(formData.get("internal_notes_default"));
  const checklistItemsResult = parseChecklistItemsJson(formData.get("checklist_items_json"));
  if (!checklistItemsResult.ok) {
    redirect(`${ADMIN_ROUTE}?action=edit&tplId=${encodeURIComponent(templateId)}&error=${encodeURIComponent(checklistItemsResult.error)}`);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("maintenance_agreement_templates")
    .update({
      template_name: templateName,
      default_visit_scope_summary: defaultVisitScopeSummary,
      default_visit_scope_items: scopeItemsResult.value,
      internal_notes_default: internalNotesDefault,
      updated_by_user_id: scope.userId,
    })
    .eq("id", templateId)
    .eq("account_owner_user_id", scope.accountOwnerUserId)
    .select("id")
    .maybeSingle();

  if (error) {
    redirect(`${ADMIN_ROUTE}?action=edit&tplId=${encodeURIComponent(templateId)}&error=${encodeURIComponent(error.message ?? "Failed to update template.")}`);
  }
  if (!data?.id) {
    redirect(`${ADMIN_ROUTE}?error=${encodeURIComponent("Template is out of scope.")}`);
  }

  // Delete-and-reinsert checklist items (template definitions, not historical records).
  await admin
    .from("maintenance_agreement_template_checklist_items")
    .delete()
    .eq("template_id", templateId)
    .eq("account_owner_user_id", scope.accountOwnerUserId);

  if (checklistItemsResult.value.length > 0) {
    await admin
      .from("maintenance_agreement_template_checklist_items")
      .insert(
        checklistItemsResult.value.map((item) => ({
          account_owner_user_id: scope.accountOwnerUserId,
          template_id: templateId,
          item_label: item.item_label,
          default_guidance: item.default_guidance,
          sort_order: item.sort_order,
          created_by_user_id: scope.userId,
        })),
      );
  }

  revalidatePath(ADMIN_ROUTE);
  redirect(`${ADMIN_ROUTE}?notice=template_updated`);
}

export async function archiveServicePlanTemplateFromForm(formData: FormData): Promise<void> {
  const scope = await resolveFormMutationScope();

  const templateId = cleanString(formData.get("template_id"));
  if (!templateId) {
    redirect(`${ADMIN_ROUTE}?error=${encodeURIComponent("Template id is required.")}`);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("maintenance_agreement_templates")
    .update({ lifecycle_status: "archived", updated_by_user_id: scope.userId })
    .eq("id", templateId)
    .eq("account_owner_user_id", scope.accountOwnerUserId);

  if (error) {
    redirect(`${ADMIN_ROUTE}?error=${encodeURIComponent(error.message ?? "Failed to archive template.")}`);
  }

  revalidatePath(ADMIN_ROUTE);
  revalidatePath("/service-plans");
  redirect(`${ADMIN_ROUTE}?notice=template_archived`);
}

export async function restoreServicePlanTemplateFromForm(formData: FormData): Promise<void> {
  const scope = await resolveFormMutationScope();

  const templateId = cleanString(formData.get("template_id"));
  if (!templateId) {
    redirect(`${ADMIN_ROUTE}?error=${encodeURIComponent("Template id is required.")}`);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("maintenance_agreement_templates")
    .update({ lifecycle_status: "active", updated_by_user_id: scope.userId })
    .eq("id", templateId)
    .eq("account_owner_user_id", scope.accountOwnerUserId);

  if (error) {
    redirect(`${ADMIN_ROUTE}?error=${encodeURIComponent(error.message ?? "Failed to restore template.")}`);
  }

  revalidatePath(ADMIN_ROUTE);
  revalidatePath("/service-plans");
  redirect(`${ADMIN_ROUTE}?notice=template_restored`);
}
