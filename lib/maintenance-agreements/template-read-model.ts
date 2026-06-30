import {
  sanitizeVisitScopeItems,
  sanitizeVisitScopeSummary,
  type VisitScopeItem,
} from "@/lib/jobs/visit-scope";
import {
  MAINTENANCE_AGREEMENT_FREQUENCIES,
  MAINTENANCE_AGREEMENT_TYPES,
  type MaintenanceAgreementFrequency,
  type MaintenanceAgreementType,
} from "@/lib/maintenance-agreements/read-model";

export const MAINTENANCE_AGREEMENT_TEMPLATE_SELECT = [
  "id",
  "account_owner_user_id",
  "template_name",
  "agreement_type",
  "frequency",
  "default_visit_scope_summary",
  "default_visit_scope_items",
  "internal_notes_default",
  "lifecycle_status",
  "locked_field_keys",
  "lock_policy_version",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

export const MAINTENANCE_AGREEMENT_TEMPLATE_REQUIRED_LOCKED_FIELD_KEYS = [
  "agreement_name",
  "agreement_type",
  "frequency",
  "default_visit_scope_summary",
  "default_visit_scope_items",
] as const;

export const MAINTENANCE_AGREEMENT_TEMPLATE_LIFECYCLE_STATUSES = ["active", "archived"] as const;

export type MaintenanceAgreementTemplateLifecycleStatus =
  (typeof MAINTENANCE_AGREEMENT_TEMPLATE_LIFECYCLE_STATUSES)[number];

export type MaintenanceAgreementTemplateRow = {
  id: string;
  account_owner_user_id: string;
  template_name: string;
  agreement_type: MaintenanceAgreementType | string;
  frequency: MaintenanceAgreementFrequency | string;
  default_visit_scope_summary: string | null;
  default_visit_scope_items: VisitScopeItem[];
  internal_notes_default: string | null;
  lifecycle_status: MaintenanceAgreementTemplateLifecycleStatus | string;
  locked_field_keys: string[];
  lock_policy_version: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type SupabaseLike = {
  from(table: string): any;
};

type ListMaintenanceAgreementTemplatesParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  includeArchived?: boolean;
  limit?: number | null;
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLimit(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return 200;
  return Math.min(Math.max(Math.trunc(Number(value)), 1), 500);
}

export function isMaintenanceAgreementTemplateLifecycleStatus(
  value: string | null | undefined,
): value is MaintenanceAgreementTemplateLifecycleStatus {
  return MAINTENANCE_AGREEMENT_TEMPLATE_LIFECYCLE_STATUSES.includes(cleanString(value).toLowerCase() as any);
}

export function normalizeMaintenanceAgreementTemplateName(value: unknown) {
  return cleanString(value).replace(/\s+/g, " ");
}

export function normalizeMaintenanceAgreementTemplateInternalNotes(value: unknown) {
  const normalized = cleanString(value).replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

export function normalizeMaintenanceAgreementTemplateLifecycleStatus(
  value: unknown,
): MaintenanceAgreementTemplateLifecycleStatus {
  return cleanString(value).toLowerCase() === "archived" ? "archived" : "active";
}

function parseTemplateRow(raw: any): MaintenanceAgreementTemplateRow {
  const lockPolicyVersionRaw = Number(raw?.lock_policy_version);
  const lockPolicyVersion = Number.isInteger(lockPolicyVersionRaw) && lockPolicyVersionRaw > 0
    ? lockPolicyVersionRaw
    : 1;

  const lockedFieldKeysRaw = Array.isArray(raw?.locked_field_keys)
    ? raw.locked_field_keys
    : MAINTENANCE_AGREEMENT_TEMPLATE_REQUIRED_LOCKED_FIELD_KEYS;
  const lockedFieldKeySet = new Set<string>();
  for (const entry of lockedFieldKeysRaw as unknown[]) {
    const normalized = cleanString(entry);
    if (normalized) {
      lockedFieldKeySet.add(normalized);
    }
  }
  const lockedFieldKeys = Array.from(lockedFieldKeySet);

  return {
    id: cleanString(raw?.id),
    account_owner_user_id: cleanString(raw?.account_owner_user_id),
    template_name: normalizeMaintenanceAgreementTemplateName(raw?.template_name),
    agreement_type: cleanString(raw?.agreement_type),
    frequency: cleanString(raw?.frequency),
    default_visit_scope_summary: sanitizeVisitScopeSummary(raw?.default_visit_scope_summary),
    default_visit_scope_items: sanitizeVisitScopeItems(raw?.default_visit_scope_items),
    internal_notes_default: normalizeMaintenanceAgreementTemplateInternalNotes(raw?.internal_notes_default),
    lifecycle_status: normalizeMaintenanceAgreementTemplateLifecycleStatus(raw?.lifecycle_status),
    locked_field_keys:
      lockedFieldKeys.length > 0
        ? lockedFieldKeys
        : [...MAINTENANCE_AGREEMENT_TEMPLATE_REQUIRED_LOCKED_FIELD_KEYS],
    lock_policy_version: lockPolicyVersion,
    created_by_user_id: cleanString(raw?.created_by_user_id),
    updated_by_user_id: cleanString(raw?.updated_by_user_id),
    created_at: cleanString(raw?.created_at),
    updated_at: cleanString(raw?.updated_at),
  };
}

export type TemplateChecklistItem = {
  id: string;
  item_label: string;
  default_guidance: string | null;
  sort_order: number;
};

type ListChecklistItemsParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  templateId?: string | null;
  agreementId?: string | null;
};

function parseChecklistItemRow(raw: any): TemplateChecklistItem {
  return {
    id: cleanString(raw?.id),
    item_label: cleanString(raw?.item_label),
    default_guidance: cleanString(raw?.default_guidance) || null,
    sort_order: Number.isInteger(Number(raw?.sort_order)) ? Number(raw.sort_order) : 0,
  };
}

export async function listChecklistItemsForTemplate(
  params: ListChecklistItemsParams,
): Promise<TemplateChecklistItem[]> {
  const accountOwnerUserId = cleanString(params.accountOwnerUserId);
  if (!accountOwnerUserId) return [];

  let query = params.supabase
    .from("maintenance_agreement_template_checklist_items")
    .select("id, item_label, default_guidance, sort_order")
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(50);

  if (params.templateId) {
    query = query.eq("template_id", params.templateId);
  } else if (params.agreementId) {
    query = query.eq("agreement_id", params.agreementId);
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  return rows.map(parseChecklistItemRow);
}

export async function listMaintenanceAgreementTemplatesForAccount(
  params: ListMaintenanceAgreementTemplatesParams,
): Promise<MaintenanceAgreementTemplateRow[]> {
  const accountOwnerUserId = cleanString(params.accountOwnerUserId);
  if (!accountOwnerUserId) return [];

  const includeArchived = Boolean(params.includeArchived);
  const limit = normalizeLimit(params.limit);

  let query = params.supabase
    .from("maintenance_agreement_templates")
    .select(MAINTENANCE_AGREEMENT_TEMPLATE_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("template_name", { ascending: true })
    .limit(limit);

  if (!includeArchived) {
    query = query.eq("lifecycle_status", "active");
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  return rows.map(parseTemplateRow);
}
