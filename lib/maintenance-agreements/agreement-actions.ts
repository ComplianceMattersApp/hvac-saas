"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import {
  MAINTENANCE_AGREEMENT_FREQUENCIES,
  MAINTENANCE_AGREEMENT_STATUSES,
  MAINTENANCE_AGREEMENT_TYPES,
  projectMaintenanceAgreementVisitCountReview,
} from "@/lib/maintenance-agreements/read-model";
import { sanitizeVisitScopeItems, type VisitScopeItem } from "@/lib/jobs/visit-scope";

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
  defaultVisitScopeItemsJson?: string | null;
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

  const defaultVisitScopeItemsResult = parseVisitScopeItemsJson(params.defaultVisitScopeItemsJson);
  if (!defaultVisitScopeItemsResult.ok) {
    return { success: false, error: defaultVisitScopeItemsResult.error };
  }

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
    default_visit_scope_items: defaultVisitScopeItemsResult.value,
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

  const defaultVisitScopeItemsResult = parseVisitScopeItemsJson(params.defaultVisitScopeItemsJson);
  if (!defaultVisitScopeItemsResult.ok) {
    return { success: false, error: defaultVisitScopeItemsResult.error };
  }

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
      default_visit_scope_items: defaultVisitScopeItemsResult.value,
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
    defaultVisitScopeItemsJson: nullableString(formData.get("default_visit_scope_items_json")),
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
  accountOwnerUserId?: string;
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

    const admin = createAdminClient();

    let accountOwnerUserId = cleanString(params.accountOwnerUserId ?? "");

    // If accountOwnerUserId is not provided, look it up from internal_users
    if (!accountOwnerUserId) {
      const { data: internalUserRow, error: internalUserErr } = await admin
        .from("internal_users")
        .select("account_owner_user_id, is_active")
        .eq("user_id", createdByUserId)
        .maybeSingle();

      if (internalUserErr || !internalUserRow?.account_owner_user_id || internalUserRow.is_active === false) {
        return false;
      }

      accountOwnerUserId = cleanString(internalUserRow.account_owner_user_id);
    }

    // Validate agreement belongs to account scope
    const { data: agreement, error: agreementErr } = await admin
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

    const { data: job, error: jobErr } = await admin
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

    const { data: scopedCustomer, error: customerErr } = await admin
      .from("customers")
      .select("id")
      .eq("id", agreementCustomerId)
      .eq("owner_user_id", accountOwnerUserId)
      .maybeSingle();

    if (customerErr || !scopedCustomer?.id) {
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

    const { error: linkErr } = await admin
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

function jobBannerPath(jobIdRaw: string, banner: string) {
  const jobId = cleanString(jobIdRaw);
  if (!jobId) return `/ops?banner=${encodeURIComponent(banner)}`;
  return `/jobs/${encodeURIComponent(jobId)}?banner=${encodeURIComponent(banner)}`;
}

export async function markMaintenanceAgreementVisitCountedFromForm(formData: FormData): Promise<void> {
  const jobId = cleanString(formData.get("job_id"));
  const linkId = cleanString(formData.get("maintenance_agreement_visit_link_id"));

  if (!jobId || !linkId) {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_missing_link"));
  }

  if (!isMaintenanceAgreementsEnabled()) {
    revalidatePath(`/jobs/${jobId}`);
    redirect(jobBannerPath(jobId, "maintenance_visit_count_unavailable"));
  }

  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        redirect("/login");
      }
      redirect(`/jobs/${encodeURIComponent(jobId)}?notice=not_authorized`);
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const actingUserId = cleanString(authz.userId);

  if (!accountOwnerUserId || !actingUserId) {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_out_of_scope"));
  }

  const entitlement = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId,
    supabase,
  });

  if (!entitlement.authorized) {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_unavailable"));
  }

  const admin = createAdminClient();

  const { data: linkRow, error: linkError } = await admin
    .from("maintenance_agreement_visits")
    .select(
      [
        "id",
        "account_owner_user_id",
        "agreement_id",
        "job_id",
        "count_status",
        "counts_toward_visit_balance",
      ].join(", "),
    )
    .eq("id", linkId)
    .maybeSingle();

  const link = (linkRow ?? null) as {
    id?: string | null;
    account_owner_user_id?: string | null;
    agreement_id?: string | null;
    job_id?: string | null;
    count_status?: string | null;
    counts_toward_visit_balance?: boolean | null;
  } | null;

  if (linkError) {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_failed"));
  }

  if (!link?.id) {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_missing_link"));
  }

  const scopedLinkAccountOwnerUserId = cleanString(link.account_owner_user_id);
  const scopedLinkJobId = cleanString(link.job_id);
  const scopedLinkAgreementId = cleanString(link.agreement_id);
  const scopedLinkCountStatus = cleanString(link.count_status).toLowerCase();
  const scopedLinkCountsToward = Boolean(link.counts_toward_visit_balance);

  if (
    !scopedLinkAccountOwnerUserId ||
    scopedLinkAccountOwnerUserId !== accountOwnerUserId ||
    !scopedLinkAgreementId ||
    scopedLinkJobId !== jobId
  ) {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_out_of_scope"));
  }

  if (scopedLinkCountStatus === "counted" && scopedLinkCountsToward) {
    revalidatePath(`/jobs/${jobId}`);
    redirect(jobBannerPath(jobId, "maintenance_visit_count_already_counted"));
  }

  if (scopedLinkCountStatus === "excluded" || scopedLinkCountStatus === "reversed") {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_excluded_or_reversed"));
  }

  if ((scopedLinkCountStatus !== "linked" && scopedLinkCountStatus !== "eligible") || scopedLinkCountsToward) {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_not_eligible"));
  }

  const { data: jobRow, error: jobError } = await admin
    .from("jobs")
    .select(
      [
        "id",
        "customer_id",
        "job_type",
        "status",
        "ops_status",
        "field_complete",
        "service_visit_type",
        "service_visit_outcome",
      ].join(", "),
    )
    .eq("id", jobId)
    .maybeSingle();

  const job = (jobRow ?? null) as {
    id?: string | null;
    customer_id?: string | null;
    job_type?: string | null;
    status?: string | null;
    ops_status?: string | null;
    field_complete?: boolean | null;
    service_visit_type?: string | null;
    service_visit_outcome?: string | null;
  } | null;

  if (jobError || !job?.id) {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_out_of_scope"));
  }

  const { data: agreementRow, error: agreementError } = await admin
    .from("maintenance_agreements")
    .select("id, account_owner_user_id, customer_id, status")
    .eq("id", scopedLinkAgreementId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  const agreement = (agreementRow ?? null) as {
    id?: string | null;
    account_owner_user_id?: string | null;
    customer_id?: string | null;
    status?: string | null;
  } | null;

  if (agreementError || !agreement?.id) {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_out_of_scope"));
  }

  const agreementStatus = cleanString(agreement.status).toLowerCase();
  const agreementCustomerId = cleanString(agreement.customer_id);
  const jobCustomerId = cleanString(job.customer_id);
  if (!agreementCustomerId || !jobCustomerId || agreementCustomerId !== jobCustomerId) {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_out_of_scope"));
  }

  if (agreementStatus !== "active") {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_not_eligible"));
  }

  const projectedLabel = projectMaintenanceAgreementVisitCountReview({
    link: {
      count_status: scopedLinkCountStatus,
      counts_toward_visit_balance: scopedLinkCountsToward,
    },
    job: {
      id: job.id,
      status: job.status,
      ops_status: job.ops_status,
      job_type: job.job_type,
      field_complete: job.field_complete,
      service_visit_type: job.service_visit_type,
      service_visit_outcome: job.service_visit_outcome,
    },
  });

  if (projectedLabel !== "eligible_for_count_review") {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_not_eligible"));
  }

  const nowIso = new Date().toISOString();

  const { data: updatedLink, error: updateError } = await admin
    .from("maintenance_agreement_visits")
    .update({
      count_status: "counted",
      counts_toward_visit_balance: true,
      counted_at: nowIso,
      counted_by_user_id: actingUserId,
      updated_by_user_id: actingUserId,
    })
    .eq("id", linkId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("job_id", jobId)
    .eq("agreement_id", scopedLinkAgreementId)
    .in("count_status", ["linked", "eligible"])
    .eq("counts_toward_visit_balance", false)
    .select("id")
    .maybeSingle();

  if (updateError) {
    redirect(jobBannerPath(jobId, "maintenance_visit_count_failed"));
  }

  if (!updatedLink?.id) {
    const { data: recheckRow, error: recheckError } = await admin
      .from("maintenance_agreement_visits")
      .select("count_status, counts_toward_visit_balance")
      .eq("id", linkId)
      .maybeSingle();

    const recheck = (recheckRow ?? null) as {
      count_status?: string | null;
      counts_toward_visit_balance?: boolean | null;
    } | null;

    if (recheckError) {
      redirect(jobBannerPath(jobId, "maintenance_visit_count_failed"));
    }

    const recheckStatus = cleanString(recheck?.count_status).toLowerCase();
    const recheckCountsToward = Boolean(recheck?.counts_toward_visit_balance);
    if (recheckStatus === "counted" && recheckCountsToward) {
      revalidatePath(`/jobs/${jobId}`);
      revalidatePath(`/service-plans`);
      redirect(jobBannerPath(jobId, "maintenance_visit_count_already_counted"));
    }

    redirect(jobBannerPath(jobId, "maintenance_visit_count_not_eligible"));
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/service-plans`);
  redirect(jobBannerPath(jobId, "maintenance_visit_count_saved"));
}

/**
 * Confirm and apply the suggested next due date to a maintenance agreement.
 * This action updates only agreement.next_due_date and updated_by_user_id.
 * Stale-state guard prevents writes if agreement.next_due_date changed after suggestion render.
 */
export async function confirmMaintenanceAgreementNextDueDateFromForm(formData: FormData): Promise<void> {
  const jobId = cleanString(formData.get("job_id"));
  const agreementId = cleanString(formData.get("agreement_id"));
  const suggestedNextDueDate = cleanString(formData.get("suggested_next_due_date"));
  const baselineNextDueDate = cleanString(formData.get("baseline_next_due_date"));

  if (!jobId || !agreementId || !suggestedNextDueDate || !baselineNextDueDate) {
    redirect(jobBannerPath(jobId, "confirm_next_due_missing_params"));
  }

  // Validate date formats
  if (!DATE_RE.test(suggestedNextDueDate) || !DATE_RE.test(baselineNextDueDate)) {
    redirect(jobBannerPath(jobId, "confirm_next_due_invalid_date"));
  }

  if (!isMaintenanceAgreementsEnabled()) {
    revalidatePath(`/jobs/${jobId}`);
    redirect(jobBannerPath(jobId, "confirm_next_due_unavailable"));
  }

  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        redirect("/login");
      }
      redirect(`/jobs/${encodeURIComponent(jobId)}?notice=not_authorized`);
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const actingUserId = cleanString(authz.userId);

  if (!accountOwnerUserId || !actingUserId) {
    redirect(jobBannerPath(jobId, "confirm_next_due_out_of_scope"));
  }

  const entitlement = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId,
    supabase,
  });

  if (!entitlement.authorized) {
    redirect(jobBannerPath(jobId, "confirm_next_due_unavailable"));
  }

  const admin = createAdminClient();

  // Verify link exists and is counted
  const { data: linkRow, error: linkError } = await admin
    .from("maintenance_agreement_visits")
    .select("id, account_owner_user_id, job_id, agreement_id, count_status, counts_toward_visit_balance")
    .eq("job_id", jobId)
    .eq("agreement_id", agreementId)
    .maybeSingle();

  if (linkError || !linkRow?.id) {
    redirect(jobBannerPath(jobId, "confirm_next_due_missing_link"));
  }

  const linkAccountOwnerUserId = cleanString(linkRow.account_owner_user_id);
  const linkCountStatus = cleanString(linkRow.count_status).toLowerCase();
  const linkCountsToward = Boolean(linkRow.counts_toward_visit_balance);

  if (linkAccountOwnerUserId !== accountOwnerUserId || linkCountStatus !== "counted" || !linkCountsToward) {
    redirect(jobBannerPath(jobId, "confirm_next_due_not_counted"));
  }

  // Verify agreement exists and is active
  const { data: agreementRow, error: agreementError } = await admin
    .from("maintenance_agreements")
    .select("id, account_owner_user_id, customer_id, status, frequency, next_due_date")
    .eq("id", agreementId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (agreementError || !agreementRow?.id) {
    redirect(jobBannerPath(jobId, "confirm_next_due_agreement_not_found"));
  }

  const agreementAccountOwnerUserId = cleanString(agreementRow.account_owner_user_id);
  const agreementStatus = cleanString(agreementRow.status).toLowerCase();
  const agreementFrequency = cleanString(agreementRow.frequency).toLowerCase();
  const currentAgreementNextDueDate = cleanString(agreementRow.next_due_date ?? "");

  // Verify scope and status
  if (agreementAccountOwnerUserId !== accountOwnerUserId || agreementStatus !== "active") {
    redirect(jobBannerPath(jobId, "confirm_next_due_agreement_inactive"));
  }

  // Verify frequency is interval-based (not custom/manual)
  const INTERVAL_FREQUENCIES = ["monthly", "quarterly", "semi_annual", "annual"] as const;
  if (!INTERVAL_FREQUENCIES.includes(agreementFrequency as any)) {
    redirect(jobBannerPath(jobId, "confirm_next_due_custom_frequency"));
  }

  // Stale-state guard: verify agreement.next_due_date still matches baseline
  if (currentAgreementNextDueDate !== baselineNextDueDate) {
    redirect(jobBannerPath(jobId, "confirm_next_due_stale_state"));
  }

  // Verify job customer matches agreement customer
  const { data: jobRow, error: jobError } = await admin
    .from("jobs")
    .select("id, customer_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !jobRow?.id) {
    redirect(jobBannerPath(jobId, "confirm_next_due_job_not_found"));
  }

  const jobCustomerId = cleanString(jobRow.customer_id ?? "");
  const agreementCustomerId = cleanString(agreementRow.customer_id ?? "");

  if (!jobCustomerId || !agreementCustomerId || jobCustomerId !== agreementCustomerId) {
    redirect(jobBannerPath(jobId, "confirm_next_due_scope_mismatch"));
  }

  // Update agreement with new next_due_date
  const { data: updatedAgreement, error: updateError } = await admin
    .from("maintenance_agreements")
    .update({
      next_due_date: suggestedNextDueDate,
      updated_by_user_id: actingUserId,
    })
    .eq("id", agreementId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("customer_id", agreementCustomerId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (updateError) {
    redirect(jobBannerPath(jobId, "confirm_next_due_update_failed"));
  }

  if (!updatedAgreement?.id) {
    redirect(jobBannerPath(jobId, "confirm_next_due_update_failed"));
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/service-plans`);
  revalidatePath(`/customers/${agreementCustomerId}`);
  redirect(jobBannerPath(jobId, "confirm_next_due_saved"));
}
