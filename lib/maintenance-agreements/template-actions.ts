"use server";

import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import {
  MAINTENANCE_AGREEMENT_FREQUENCIES,
  MAINTENANCE_AGREEMENT_TYPES,
} from "@/lib/maintenance-agreements/read-model";
import {
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

type CreateMaintenanceAgreementTemplateParams = {
  templateName: string;
  agreementType: string;
  frequency: string;
  defaultVisitScopeSummary?: string | null;
  defaultVisitScopeItemsJson?: string | null;
  internalNotesDefault?: string | null;
};

type UpdateMaintenanceAgreementTemplateParams = CreateMaintenanceAgreementTemplateParams & {
  templateId: string;
};

type ArchiveMaintenanceAgreementTemplateParams = {
  templateId: string;
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

  return { success: true, templateId: cleanString(data.id) };
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
