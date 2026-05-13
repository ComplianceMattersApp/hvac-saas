"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import {
  MAINTENANCE_AGREEMENT_FREQUENCIES,
  MAINTENANCE_AGREEMENT_STATUSES,
  MAINTENANCE_AGREEMENT_TYPES,
} from "@/lib/maintenance-agreements/read-model";

type MutationResult =
  | { success: true; agreementId: string }
  | { success: false; error: string };

type CreateMaintenanceAgreementParams = {
  customerId: string;
  agreementName: string;
  agreementType: string;
  frequency: string;
  nextDueDate: string;
  startDate: string;
  renewalDate?: string | null;
  primaryLocationId?: string | null;
  defaultVisitScopeSummary?: string | null;
  internalNotes?: string | null;
};

type UpdateMaintenanceAgreementParams = CreateMaintenanceAgreementParams & {
  agreementId: string;
  status: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function nullableString(value: unknown) {
  const cleaned = cleanString(value);
  return cleaned ? cleaned : null;
}

function parseRequiredDate(value: unknown, fieldLabel: string) {
  const normalized = cleanString(value);
  if (!DATE_RE.test(normalized)) {
    return { ok: false as const, error: `${fieldLabel} must be a valid date (YYYY-MM-DD).` };
  }
  return { ok: true as const, value: normalized };
}

function parseOptionalDate(value: unknown, fieldLabel: string) {
  const normalized = cleanString(value);
  if (!normalized) return { ok: true as const, value: null };
  if (!DATE_RE.test(normalized)) {
    return { ok: false as const, error: `${fieldLabel} must be a valid date (YYYY-MM-DD).` };
  }
  return { ok: true as const, value: normalized };
}

function parseEnumValue(value: unknown, allowedValues: readonly string[], fieldLabel: string) {
  const normalized = cleanString(value).toLowerCase();
  if (!allowedValues.includes(normalized)) {
    return { ok: false as const, error: `${fieldLabel} is invalid.` };
  }
  return { ok: true as const, value: normalized };
}

async function resolveMutationScope(customerIdRaw: string) {
  if (!isMaintenanceAgreementsEnabled()) {
    return { success: false as const, error: "Maintenance Agreements are currently unavailable." };
  }

  const customerId = cleanString(customerIdRaw);
  if (!customerId) {
    return { success: false as const, error: "Customer is required." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = cleanString(internalUser.account_owner_user_id);
  const userId = cleanString(internalUser.user_id);
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

  const admin = createAdminClient();
  const { data: scopedCustomer, error: customerScopeErr } = await admin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (customerScopeErr) throw customerScopeErr;
  if (!scopedCustomer?.id) {
    return { success: false as const, error: "Customer is out of scope for this account." };
  }

  return {
    success: true as const,
    supabase,
    admin,
    accountOwnerUserId,
    userId,
    customerId,
  };
}

async function validatePrimaryLocationScope(params: {
  admin: any;
  accountOwnerUserId: string;
  customerId: string;
  primaryLocationId: string | null;
}) {
  if (!params.primaryLocationId) {
    return { success: true as const };
  }

  const { data: scopedLocation, error: scopedLocationErr } = await params.admin
    .from("locations")
    .select("id")
    .eq("id", params.primaryLocationId)
    .eq("owner_user_id", params.accountOwnerUserId)
    .eq("customer_id", params.customerId)
    .maybeSingle();

  if (scopedLocationErr) throw scopedLocationErr;
  if (!scopedLocation?.id) {
    return {
      success: false as const,
      error: "Primary location must belong to this customer and account.",
    };
  }

  return { success: true as const };
}

export async function createMaintenanceAgreement(
  params: CreateMaintenanceAgreementParams,
): Promise<MutationResult> {
  const scope = await resolveMutationScope(params.customerId);
  if (!scope.success) return scope;

  const agreementName = cleanString(params.agreementName);
  if (!agreementName) {
    return { success: false, error: "Agreement name is required." };
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

  const nextDueDateResult = parseRequiredDate(params.nextDueDate, "Next due date");
  if (!nextDueDateResult.ok) return { success: false, error: nextDueDateResult.error };

  const startDateResult = parseRequiredDate(params.startDate, "Start date");
  if (!startDateResult.ok) return { success: false, error: startDateResult.error };

  const renewalDateResult = parseOptionalDate(params.renewalDate, "Renewal date");
  if (!renewalDateResult.ok) return { success: false, error: renewalDateResult.error };

  const primaryLocationId = nullableString(params.primaryLocationId);
  const locationScopeResult = await validatePrimaryLocationScope({
    admin: scope.admin,
    accountOwnerUserId: scope.accountOwnerUserId,
    customerId: scope.customerId,
    primaryLocationId,
  });
  if (!locationScopeResult.success) {
    return { success: false, error: locationScopeResult.error };
  }

  const payload = {
    account_owner_user_id: scope.accountOwnerUserId,
    customer_id: scope.customerId,
    agreement_name: agreementName,
    agreement_type: agreementTypeResult.value,
    frequency: frequencyResult.value,
    next_due_date: nextDueDateResult.value,
    start_date: startDateResult.value,
    renewal_date: renewalDateResult.value,
    primary_location_id: primaryLocationId,
    default_visit_scope_summary: nullableString(params.defaultVisitScopeSummary),
    internal_notes: nullableString(params.internalNotes),
    created_by_user_id: scope.userId,
    updated_by_user_id: scope.userId,
  };

  const { data, error } = await scope.supabase
    .from("maintenance_agreements")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    return { success: false, error: error?.message ?? "Failed to create maintenance agreement." };
  }

  return { success: true, agreementId: String(data.id) };
}

export async function updateMaintenanceAgreement(
  params: UpdateMaintenanceAgreementParams,
): Promise<MutationResult> {
  const scope = await resolveMutationScope(params.customerId);
  if (!scope.success) return scope;

  const agreementId = cleanString(params.agreementId);
  if (!agreementId) {
    return { success: false, error: "Agreement id is required." };
  }

  const agreementName = cleanString(params.agreementName);
  if (!agreementName) {
    return { success: false, error: "Agreement name is required." };
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

  const statusResult = parseEnumValue(params.status, MAINTENANCE_AGREEMENT_STATUSES, "Status");
  if (!statusResult.ok) return { success: false, error: statusResult.error };

  const nextDueDateResult = parseRequiredDate(params.nextDueDate, "Next due date");
  if (!nextDueDateResult.ok) return { success: false, error: nextDueDateResult.error };

  const startDateResult = parseRequiredDate(params.startDate, "Start date");
  if (!startDateResult.ok) return { success: false, error: startDateResult.error };

  const renewalDateResult = parseOptionalDate(params.renewalDate, "Renewal date");
  if (!renewalDateResult.ok) return { success: false, error: renewalDateResult.error };

  const primaryLocationId = nullableString(params.primaryLocationId);
  const locationScopeResult = await validatePrimaryLocationScope({
    admin: scope.admin,
    accountOwnerUserId: scope.accountOwnerUserId,
    customerId: scope.customerId,
    primaryLocationId,
  });
  if (!locationScopeResult.success) {
    return { success: false, error: locationScopeResult.error };
  }

  const { data, error } = await scope.supabase
    .from("maintenance_agreements")
    .update({
      agreement_name: agreementName,
      agreement_type: agreementTypeResult.value,
      frequency: frequencyResult.value,
      next_due_date: nextDueDateResult.value,
      start_date: startDateResult.value,
      renewal_date: renewalDateResult.value,
      primary_location_id: primaryLocationId,
      default_visit_scope_summary: nullableString(params.defaultVisitScopeSummary),
      internal_notes: nullableString(params.internalNotes),
      status: statusResult.value,
      updated_by_user_id: scope.userId,
    })
    .eq("id", agreementId)
    .eq("account_owner_user_id", scope.accountOwnerUserId)
    .eq("customer_id", scope.customerId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message ?? "Failed to update maintenance agreement." };
  }
  if (!data?.id) {
    return { success: false, error: "Maintenance agreement is out of scope for this customer." };
  }

  return { success: true, agreementId: String(data.id) };
}

function toCreateParams(formData: FormData): CreateMaintenanceAgreementParams {
  return {
    customerId: cleanString(formData.get("customer_id")),
    agreementName: cleanString(formData.get("agreement_name")),
    agreementType: cleanString(formData.get("agreement_type")),
    frequency: cleanString(formData.get("frequency")),
    nextDueDate: cleanString(formData.get("next_due_date")),
    startDate: cleanString(formData.get("start_date")),
    renewalDate: nullableString(formData.get("renewal_date")),
    primaryLocationId: nullableString(formData.get("primary_location_id")),
    defaultVisitScopeSummary: nullableString(formData.get("default_visit_scope_summary")),
    internalNotes: nullableString(formData.get("internal_notes")),
  };
}

function toUpdateParams(formData: FormData): UpdateMaintenanceAgreementParams {
  return {
    agreementId: cleanString(formData.get("agreement_id")),
    status: cleanString(formData.get("status")),
    ...toCreateParams(formData),
  };
}

export async function createMaintenanceAgreementFromForm(customerPath: string, formData: FormData) {
  const result = await createMaintenanceAgreement(toCreateParams(formData));
  if (!result.success) {
    redirect(`${customerPath}?maError=${encodeURIComponent(result.error)}`);
  }

  revalidatePath(customerPath);
  redirect(`${customerPath}?maSaved=created`);
}

export async function updateMaintenanceAgreementFromForm(customerPath: string, formData: FormData) {
  const result = await updateMaintenanceAgreement(toUpdateParams(formData));
  if (!result.success) {
    redirect(`${customerPath}?maError=${encodeURIComponent(result.error)}`);
  }

  revalidatePath(customerPath);
  redirect(`${customerPath}?maSaved=updated`);
}

/**
 * Create a link row in maintenance_agreement_visits when a job is created from a service plan prefill.
 * This is called internally during job creation flow and does not throw or redirect.
 * Returns true if link was created, false if skipped (silently fails on invalid scopes).
 */
export async function createMaintenanceAgreementVisitLinkFromJobCreation(params: {
  agreementId: string;
  jobId: string;
  createdByUserId: string;
}): Promise<boolean> {
  try {
    // Feature flag check
    if (!isMaintenanceAgreementsEnabled()) {
      return false;
    }

    const agreementId = cleanString(params.agreementId);
    const jobId = cleanString(params.jobId);
    const createdByUserId = cleanString(params.createdByUserId);

    if (!agreementId || !jobId || !createdByUserId) {
      return false;
    }

    const supabase = await createClient();

    // Get current user and validate they're internal
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return false;
    }

    const { data: internalUserRow, error: internalUserErr } = await supabase
      .from("internal_users")
      .select("account_owner_user_id, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (internalUserErr || !internalUserRow?.account_owner_user_id) {
      return false;
    }

    const accountOwnerUserId = cleanString(internalUserRow.account_owner_user_id);

    // Validate agreement belongs to account scope
    const { data: agreement, error: agreementErr } = await supabase
      .from("maintenance_agreements")
      .select("id, customer_id, account_owner_user_id")
      .eq("id", agreementId)
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle();

    if (agreementErr || !agreement?.id) {
      return false;
    }

    const agreementCustomerId = cleanString(agreement.customer_id ?? "");
    if (!agreementCustomerId) {
      return false;
    }

    // Validate job belongs to same account/customer scope
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, customer_id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr || !job?.id) {
      return false;
    }

    const jobCustomerId = cleanString(job.customer_id ?? "");

    // Job must belong to same customer as agreement
    if (jobCustomerId !== agreementCustomerId) {
      return false;
    }

    // Create link row with ON CONFLICT DO NOTHING for duplicate-safe behavior
    const linkPayload = {
      account_owner_user_id: accountOwnerUserId,
      agreement_id: agreementId,
      job_id: jobId,
      link_source: "service_plan_prefill",
      count_status: "linked",
      counts_toward_visit_balance: false,
      created_by_user_id: createdByUserId,
      updated_by_user_id: createdByUserId,
    };

    const { error: linkErr } = await supabase
      .from("maintenance_agreement_visits")
      .insert(linkPayload)
      .select("id")
      .maybeSingle();

    // Handle duplicate key constraint gracefully (on conflict for unique (agreement_id, job_id))
    // A 23505 error code means unique constraint violation, which we treat as success (idempotent)
    if (linkErr) {
      const isDuplicateConstraint = linkErr.code === "23505";
      if (!isDuplicateConstraint) {
        return false;
      }
    }

    return true;
  } catch {
    // Silently fail on any error; don't block job creation
    return false;
  }
}
