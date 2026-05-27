"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { canManageInvoiceLifecycle } from "@/lib/auth/financial-access";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type Banner =
  | "created"
  | "updated"
  | "cancelled"
  | "validation_error"
  | "duplicate_or_overlap_error"
  | "access_denied"
  | "billing_period_invoice_linked"
  | "billing_period_invoice_unlinked"
  | "billing_period_invoice_link_denied"
  | "billing_period_invoice_link_invalid"
  | "billing_period_invoice_link_conflict"
  | "billing_period_invoice_unlink_reason_required";

type AgreementRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string;
};

type BillingPeriodRow = {
  id: string;
  account_owner_user_id: string;
  maintenance_agreement_id: string;
  customer_id: string | null;
  internal_invoice_id: string | null;
  coverage_start_date: string;
  coverage_end_date: string;
  billing_period_status: string;
};

type InternalInvoiceRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string | null;
  job_id: string;
  status: string;
};

type CreateOrUpdateInput = {
  maintenanceAgreementId: string;
  billingPeriodId: string | null;
  coverageStartDate: string;
  coverageEndDate: string;
  billingCadence: string;
  amountDueCents: number;
  currency: string;
  billingPosture: string;
  billingPeriodStatus: string;
  billingDueDate: string | null;
  externalReference: string | null;
  externalNotes: string | null;
  statusReason: string | null;
  internalInvoiceId: string | null;
};

type CancelInput = {
  maintenanceAgreementId: string;
  billingPeriodId: string;
  statusReason: string;
};

type LinkInput = {
  billingPeriodId: string;
  internalInvoiceId: string;
};

type UnlinkInput = {
  billingPeriodId: string;
  statusReason: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_INVOICE_STATUSES = new Set(["draft", "pending_billing"]);
const EXTERNAL_OFF_PLATFORM_STATUSES = new Set(["draft", "externally_billed"]);
const MANUAL_STATUSES = new Set(["draft", "pending_billing"]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function optionalClean(value: unknown) {
  const normalized = clean(value);
  return normalized ? normalized : null;
}

function normalizeCustomerPath(customerPath: string | null | undefined) {
  try {
    return new URL(clean(customerPath) || "/customers", "https://app.local").pathname || "/customers";
  } catch {
    return "/customers";
  }
}

function buildCustomerProfileHref(customerPath: string | null | undefined, banner: Banner) {
  const url = new URL(normalizeCustomerPath(customerPath), "https://app.local");
  url.searchParams.set("banner", banner);
  return `${url.pathname}${url.search}${url.hash}`;
}

function redirectToCustomerProfile(customerPath: string | null | undefined, banner: Banner): never {
  const safePath = normalizeCustomerPath(customerPath);
  revalidatePath(safePath);
  redirect(buildCustomerProfileHref(customerPath, banner));
}

function parseUuid(raw: unknown, fieldLabel: string, required: boolean) {
  const value = clean(raw);
  if (!value) {
    if (required) {
      return { ok: false as const, error: `${fieldLabel} is required.` };
    }
    return { ok: true as const, value: null as string | null };
  }

  if (!UUID_RE.test(value)) {
    return { ok: false as const, error: `${fieldLabel} must be a valid UUID.` };
  }

  return { ok: true as const, value };
}

function parseDate(raw: unknown, fieldLabel: string, required: boolean) {
  const value = clean(raw);
  if (!value) {
    if (required) {
      return { ok: false as const, error: `${fieldLabel} is required.` };
    }
    return { ok: true as const, value: null as string | null };
  }

  if (!DATE_RE.test(value)) {
    return { ok: false as const, error: `${fieldLabel} must be a valid date (YYYY-MM-DD).` };
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { ok: false as const, error: `${fieldLabel} must be a valid date (YYYY-MM-DD).` };
  }

  return { ok: true as const, value };
}

function parseMoneyCents(raw: unknown, fieldLabel: string) {
  const value = clean(raw);
  if (!value) {
    return { ok: false as const, error: `${fieldLabel} is required.` };
  }

  if (!/^\d+$/.test(value)) {
    return { ok: false as const, error: `${fieldLabel} must be a non-negative whole number of cents.` };
  }

  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < 0) {
    return { ok: false as const, error: `${fieldLabel} must be a non-negative whole number of cents.` };
  }

  return { ok: true as const, value: cents };
}

function parseCurrency(raw: unknown) {
  const value = clean(raw).toLowerCase() || "usd";
  if (!/^[a-z]{3}$/.test(value)) {
    return { ok: false as const, error: "Currency must be a 3-letter ISO code." };
  }

  return { ok: true as const, value };
}

function parseCreateOrUpdateForm(formData: FormData, requireBillingPeriodId: boolean) {
  const maintenanceAgreementId = parseUuid(
    formData.get("maintenance_agreement_id"),
    "Maintenance agreement",
    true,
  );
  if (!maintenanceAgreementId.ok) return maintenanceAgreementId;

  const billingPeriodId = parseUuid(
    formData.get("billing_period_id"),
    "Billing period",
    requireBillingPeriodId,
  );
  if (!billingPeriodId.ok) return billingPeriodId;

  const coverageStartDate = parseDate(
    formData.get("coverage_start_date"),
    "Coverage start date",
    true,
  );
  if (!coverageStartDate.ok) return coverageStartDate;

  const coverageEndDate = parseDate(formData.get("coverage_end_date"), "Coverage end date", true);
  if (!coverageEndDate.ok) return coverageEndDate;

  const coverageStartDateValue = coverageStartDate.value as string;
  const coverageEndDateValue = coverageEndDate.value as string;

  if (coverageEndDateValue < coverageStartDateValue) {
    return { ok: false as const, error: "Coverage end date must be on or after coverage start date." };
  }

  const billingCadence = clean(formData.get("billing_cadence"));
  if (!billingCadence) {
    return { ok: false as const, error: "Billing cadence is required." };
  }

  const amountDueCents = parseMoneyCents(formData.get("amount_due_cents"), "Amount due");
  if (!amountDueCents.ok) return amountDueCents;

  const currency = parseCurrency(formData.get("currency"));
  if (!currency.ok) return currency;

  const billingPosture = clean(formData.get("billing_posture")).toLowerCase();
  if (!billingPosture) {
    return { ok: false as const, error: "Billing posture is required." };
  }

  const billingPeriodStatus = clean(formData.get("billing_period_status")).toLowerCase();
  if (!billingPeriodStatus) {
    return { ok: false as const, error: "Billing period status is required." };
  }

  const billingDueDate = parseDate(formData.get("billing_due_date"), "Billing due date", false);
  if (!billingDueDate.ok) return billingDueDate;

  const internalInvoiceId = parseUuid(formData.get("internal_invoice_id"), "Internal invoice", false);
  if (!internalInvoiceId.ok) return internalInvoiceId;

  const statusReason = optionalClean(formData.get("status_reason"));
  const externalReference = optionalClean(formData.get("external_reference"));
  const externalNotes = optionalClean(formData.get("external_notes"));

  return {
    ok: true as const,
    value: {
      maintenanceAgreementId: maintenanceAgreementId.value as string,
      billingPeriodId: billingPeriodId.value,
      coverageStartDate: coverageStartDateValue,
      coverageEndDate: coverageEndDateValue,
      billingCadence,
      amountDueCents: amountDueCents.value,
      currency: currency.value,
      billingPosture,
      billingPeriodStatus,
      billingDueDate: billingDueDate.value,
      externalReference,
      externalNotes,
      statusReason,
      internalInvoiceId: internalInvoiceId.value,
    } satisfies CreateOrUpdateInput,
  };
}

function parseCancelForm(formData: FormData) {
  const maintenanceAgreementId = parseUuid(
    formData.get("maintenance_agreement_id"),
    "Maintenance agreement",
    true,
  );
  if (!maintenanceAgreementId.ok) return maintenanceAgreementId;

  const billingPeriodId = parseUuid(formData.get("billing_period_id"), "Billing period", true);
  if (!billingPeriodId.ok) return billingPeriodId;

  const statusReason = optionalClean(formData.get("status_reason"));
  if (!statusReason) {
    return { ok: false as const, error: "Status reason is required." };
  }

  const internalInvoiceId = parseUuid(formData.get("internal_invoice_id"), "Internal invoice", false);
  if (!internalInvoiceId.ok) return internalInvoiceId;

  return {
    ok: true as const,
    value: {
      maintenanceAgreementId: maintenanceAgreementId.value as string,
      billingPeriodId: billingPeriodId.value as string,
      statusReason,
      internalInvoiceId: internalInvoiceId.value,
    } satisfies CancelInput & { internalInvoiceId: string | null },
  };
}

function parseLinkForm(formData: FormData) {
  const billingPeriodId = parseUuid(formData.get("billing_period_id"), "Billing period", true);
  if (!billingPeriodId.ok) return billingPeriodId;

  const internalInvoiceId = parseUuid(formData.get("internal_invoice_id"), "Internal invoice", true);
  if (!internalInvoiceId.ok) return internalInvoiceId;

  return {
    ok: true as const,
    value: {
      billingPeriodId: billingPeriodId.value as string,
      internalInvoiceId: internalInvoiceId.value as string,
    } satisfies LinkInput,
  };
}

function parseUnlinkForm(formData: FormData) {
  const billingPeriodId = parseUuid(formData.get("billing_period_id"), "Billing period", true);
  if (!billingPeriodId.ok) return billingPeriodId;

  const statusReason = optionalClean(formData.get("status_reason"));
  if (!statusReason) {
    return {
      ok: false as const,
      reasonRequired: true as const,
      error: "Status reason is required.",
    };
  }

  return {
    ok: true as const,
    value: {
      billingPeriodId: billingPeriodId.value as string,
      statusReason,
    } satisfies UnlinkInput,
  };
}

function normalizeStatusForPosture(input: {
  billingPosture: string;
  billingPeriodStatus: string;
  amountDueCents: number;
  statusReason: string | null;
  internalInvoiceId: string | null;
}) {
  const posture = clean(input.billingPosture).toLowerCase();
  const status = clean(input.billingPeriodStatus).toLowerCase();

  if (posture === "internal_invoice") {
    if (input.internalInvoiceId) {
      return { ok: false as const, error: "Internal invoice billing periods cannot accept an invoice id yet." };
    }
    if (!INTERNAL_INVOICE_STATUSES.has(status)) {
      return { ok: false as const, error: "Internal invoice billing periods must be draft or pending billing." };
    }
    if (input.amountDueCents <= 0) {
      return { ok: false as const, error: "Internal invoice billing periods must have a positive amount due." };
    }
    return { ok: true as const, billingPeriodStatus: status };
  }

  if (posture === "external_off_platform") {
    if (!EXTERNAL_OFF_PLATFORM_STATUSES.has(status)) {
      return { ok: false as const, error: "External off-platform billing periods must be draft or externally billed." };
    }
    if (input.amountDueCents <= 0) {
      return { ok: false as const, error: "External off-platform billing periods must have a positive amount due." };
    }
    return { ok: true as const, billingPeriodStatus: status };
  }

  if (posture === "manual") {
    if (!MANUAL_STATUSES.has(status)) {
      return { ok: false as const, error: "Manual billing periods must be draft or pending billing." };
    }
    if (input.amountDueCents <= 0) {
      return { ok: false as const, error: "Manual billing periods must have a positive amount due." };
    }
    return { ok: true as const, billingPeriodStatus: status };
  }

  if (posture === "no_charge") {
    if (input.amountDueCents !== 0) {
      return { ok: false as const, error: "No-charge billing periods must have a zero amount due." };
    }
    return { ok: true as const, billingPeriodStatus: "no_charge" };
  }

  if (posture === "waived") {
    if (!input.statusReason) {
      return { ok: false as const, error: "Waived billing periods require a reason." };
    }
    return { ok: true as const, billingPeriodStatus: "waived" };
  }

  if (posture === "not_billed_through_compliance_matters") {
    if (!input.statusReason) {
      return { ok: false as const, error: "Not-billed billing periods require a reason." };
    }
    return { ok: true as const, billingPeriodStatus: "not_billed" };
  }

  return { ok: false as const, error: "Billing posture is invalid." };
}

function isCancelled(row: Pick<BillingPeriodRow, "billing_period_status">) {
  return clean(row.billing_period_status).toLowerCase() === "cancelled";
}

function overlapsCoverageWindow(
  existingStart: string,
  existingEnd: string,
  startDate: string,
  endDate: string,
) {
  return startDate <= existingEnd && endDate >= existingStart;
}

function parseBillingPeriodRecords(rows: unknown) {
  return (Array.isArray(rows) ? rows : []) as BillingPeriodRow[];
}

async function resolveInternalUserAccess(
  customerPath: string | null | undefined,
  deniedBanner: Banner = "access_denied",
) {
  try {
    const supabase = await createClient();
    const { internalUser, userId } = await requireInternalUser({ supabase });

    if (
      !canManageInvoiceLifecycle({
        actorUserId: userId,
        internalUser,
        resourceAccountOwnerUserId: internalUser.account_owner_user_id,
      })
    ) {
      redirectToCustomerProfile(customerPath, deniedBanner);
    }

    return { internalUser, userId };
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirectToCustomerProfile(customerPath, deniedBanner);
    }

    throw error;
  }
}

async function loadAgreement(admin: any, agreementId: string) {
  const { data, error } = await admin
    .from("maintenance_agreements")
    .select("id, account_owner_user_id, customer_id")
    .eq("id", agreementId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    return { ok: false as const, error: "Maintenance agreement is required." };
  }

  const agreement: AgreementRow = {
    id: clean(data.id),
    account_owner_user_id: clean(data.account_owner_user_id),
    customer_id: clean(data.customer_id),
  };

  if (!agreement.account_owner_user_id || !agreement.customer_id) {
    return { ok: false as const, error: "Maintenance agreement customer is required." };
  }

  const { data: customer, error: customerError } = await admin
    .from("customers")
    .select("id, owner_user_id")
    .eq("id", agreement.customer_id)
    .maybeSingle();

  if (customerError) throw customerError;
  if (!customer?.id) {
    return { ok: false as const, error: "Agreement customer is required." };
  }

  if (clean(customer.owner_user_id) !== agreement.account_owner_user_id) {
    return { ok: false as const, accessDenied: true as const };
  }

  return { ok: true as const, agreement };
}

async function loadBillingPeriod(admin: any, billingPeriodId: string) {
  const { data, error } = await admin
    .from("maintenance_agreement_billing_periods")
    .select(
      "id, account_owner_user_id, maintenance_agreement_id, customer_id, internal_invoice_id, coverage_start_date, coverage_end_date, billing_period_status",
    )
    .eq("id", billingPeriodId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    return { ok: false as const, error: "Billing period is required." };
  }

  return {
    ok: true as const,
    billingPeriod: {
      id: clean(data.id),
      account_owner_user_id: clean(data.account_owner_user_id),
      maintenance_agreement_id: clean(data.maintenance_agreement_id),
      customer_id: clean(data.customer_id) || null,
      internal_invoice_id: clean(data.internal_invoice_id) || null,
      coverage_start_date: clean(data.coverage_start_date),
      coverage_end_date: clean(data.coverage_end_date),
      billing_period_status: clean(data.billing_period_status),
    } as BillingPeriodRow,
  };
}

async function loadInternalInvoice(admin: any, internalInvoiceId: string) {
  const { data, error } = await admin
    .from("internal_invoices")
    .select("id, account_owner_user_id, customer_id, job_id, status")
    .eq("id", internalInvoiceId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    invoice: {
      id: clean(data.id),
      account_owner_user_id: clean(data.account_owner_user_id),
      customer_id: clean(data.customer_id) || null,
      job_id: clean(data.job_id),
      status: clean(data.status).toLowerCase(),
    } as InternalInvoiceRow,
  };
}

async function isInvoiceClaimedByAnotherBillingPeriod(params: {
  admin: any;
  accountOwnerUserId: string;
  internalInvoiceId: string;
  currentBillingPeriodId: string;
}) {
  const { data, error } = await params.admin
    .from("maintenance_agreement_billing_periods")
    .select("id")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("internal_invoice_id", params.internalInvoiceId)
    .neq("id", params.currentBillingPeriodId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

async function hasInvoiceJobLinkedToAgreement(params: {
  admin: any;
  accountOwnerUserId: string;
  agreementId: string;
  jobId: string;
}) {
  const { data, error } = await params.admin
    .from("maintenance_agreement_visits")
    .select("id")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("agreement_id", params.agreementId)
    .eq("job_id", params.jobId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

async function loadAgreementPeriods(
  admin: any,
  agreementId: string,
  accountOwnerUserId: string,
  excludeBillingPeriodId?: string | null,
) {
  const { data, error } = await admin
    .from("maintenance_agreement_billing_periods")
    .select("id, coverage_start_date, coverage_end_date, billing_period_status")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("maintenance_agreement_id", agreementId);

  if (error) throw error;

  return parseBillingPeriodRecords(data)
    .filter((row) => !excludeBillingPeriodId || clean(row.id) !== excludeBillingPeriodId)
    .filter((row) => !isCancelled(row));
}

function hasConflict(
  rows: Array<Pick<BillingPeriodRow, "coverage_start_date" | "coverage_end_date">>,
  startDate: string,
  endDate: string,
) {
  return (
    rows.some((row) => clean(row.coverage_start_date) === startDate && clean(row.coverage_end_date) === endDate) ||
    rows.some((row) =>
      overlapsCoverageWindow(
        clean(row.coverage_start_date),
        clean(row.coverage_end_date),
        startDate,
        endDate,
      ),
    )
  );
}

async function ensureNoConflict(params: {
  admin: any;
  agreement: AgreementRow;
  startDate: string;
  endDate: string;
  excludeBillingPeriodId?: string | null;
}) {
  const rows = await loadAgreementPeriods(
    params.admin,
    params.agreement.id,
    params.agreement.account_owner_user_id,
    params.excludeBillingPeriodId,
  );

  return !hasConflict(rows, params.startDate, params.endDate);
}

function rejectValidation(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "validation_error");
}

function rejectConflict(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "duplicate_or_overlap_error");
}

function rejectAccessDenied(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "access_denied");
}

function rejectInvoiceLinkDenied(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "billing_period_invoice_link_denied");
}

function rejectInvoiceLinkInvalid(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "billing_period_invoice_link_invalid");
}

function rejectInvoiceLinkConflict(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "billing_period_invoice_link_conflict");
}

function rejectInvoiceUnlinkReasonRequired(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "billing_period_invoice_unlink_reason_required");
}

function buildCreatePayload(
  agreement: AgreementRow,
  access: { userId: string },
  parsed: CreateOrUpdateInput,
  billingPeriodStatus: string,
) {
  return {
    account_owner_user_id: agreement.account_owner_user_id,
    maintenance_agreement_id: agreement.id,
    customer_id: agreement.customer_id,
    coverage_start_date: parsed.coverageStartDate,
    coverage_end_date: parsed.coverageEndDate,
    billing_due_date: parsed.billingDueDate,
    billing_cadence: parsed.billingCadence,
    amount_due_cents: parsed.amountDueCents,
    currency: parsed.currency,
    billing_posture: parsed.billingPosture,
    billing_period_status: billingPeriodStatus,
    internal_invoice_id: null,
    external_reference: parsed.externalReference,
    external_notes: parsed.externalNotes,
    status_reason: parsed.statusReason,
    created_by_user_id: access.userId,
    updated_by_user_id: access.userId,
  };
}

async function createBillingPeriod(customerPath: string, formData: FormData) {
  const access = await resolveInternalUserAccess(customerPath);
  const parsed = parseCreateOrUpdateForm(formData, false);
  if (!parsed.ok) {
    rejectValidation(customerPath);
  }

  if (parsed.value.internalInvoiceId) {
    rejectValidation(customerPath);
  }

  const admin = createAdminClient();
  const agreementResult = await loadAgreement(admin, parsed.value.maintenanceAgreementId);
  if (!agreementResult.ok) {
    if (agreementResult.accessDenied) {
      rejectAccessDenied(customerPath);
    }
    rejectValidation(customerPath);
  }

  const agreement = agreementResult.agreement;
  if (agreement.account_owner_user_id !== access.internalUser.account_owner_user_id) {
    rejectAccessDenied(customerPath);
  }

  const statusResult = normalizeStatusForPosture({
    billingPosture: parsed.value.billingPosture,
    billingPeriodStatus: parsed.value.billingPeriodStatus,
    amountDueCents: parsed.value.amountDueCents,
    statusReason: parsed.value.statusReason,
    internalInvoiceId: parsed.value.internalInvoiceId,
  });
  if (!statusResult.ok) {
    rejectValidation(customerPath);
  }

  const noConflict = await ensureNoConflict({
    admin,
    agreement,
    startDate: parsed.value.coverageStartDate,
    endDate: parsed.value.coverageEndDate,
  });
  if (!noConflict) {
    rejectConflict(customerPath);
  }

  const { data, error } = await admin
    .from("maintenance_agreement_billing_periods")
    .insert(buildCreatePayload(agreement, access, parsed.value, statusResult.billingPeriodStatus))
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    rejectValidation(customerPath);
  }

  redirectToCustomerProfile(customerPath, "created");
}

async function updateBillingPeriod(customerPath: string, formData: FormData) {
  const access = await resolveInternalUserAccess(customerPath);
  const parsed = parseCreateOrUpdateForm(formData, true);
  if (!parsed.ok) {
    rejectValidation(customerPath);
  }

  const admin = createAdminClient();
  const billingPeriodResult = await loadBillingPeriod(admin, parsed.value.billingPeriodId as string);
  if (!billingPeriodResult.ok) {
    rejectValidation(customerPath);
  }

  const billingPeriod = billingPeriodResult.billingPeriod;
  if (billingPeriod.account_owner_user_id !== access.internalUser.account_owner_user_id) {
    rejectAccessDenied(customerPath);
  }

  if (billingPeriod.internal_invoice_id) {
    rejectValidation(customerPath);
  }

  const agreementResult = await loadAgreement(admin, billingPeriod.maintenance_agreement_id);
  if (!agreementResult.ok) {
    if (agreementResult.accessDenied) {
      rejectAccessDenied(customerPath);
    }
    rejectValidation(customerPath);
  }

  const agreement = agreementResult.agreement;
  if (parsed.value.maintenanceAgreementId !== agreement.id) {
    rejectValidation(customerPath);
  }

  const statusResult = normalizeStatusForPosture({
    billingPosture: parsed.value.billingPosture,
    billingPeriodStatus: parsed.value.billingPeriodStatus,
    amountDueCents: parsed.value.amountDueCents,
    statusReason: parsed.value.statusReason,
    internalInvoiceId: parsed.value.internalInvoiceId,
  });
  if (!statusResult.ok) {
    rejectValidation(customerPath);
  }

  const noConflict = await ensureNoConflict({
    admin,
    agreement,
    startDate: parsed.value.coverageStartDate,
    endDate: parsed.value.coverageEndDate,
    excludeBillingPeriodId: billingPeriod.id,
  });
  if (!noConflict) {
    rejectConflict(customerPath);
  }

  const { data, error } = await admin
    .from("maintenance_agreement_billing_periods")
    .update({
      coverage_start_date: parsed.value.coverageStartDate,
      coverage_end_date: parsed.value.coverageEndDate,
      billing_due_date: parsed.value.billingDueDate,
      billing_cadence: parsed.value.billingCadence,
      amount_due_cents: parsed.value.amountDueCents,
      currency: parsed.value.currency,
      billing_posture: parsed.value.billingPosture,
      billing_period_status: statusResult.billingPeriodStatus,
      external_reference: parsed.value.externalReference,
      external_notes: parsed.value.externalNotes,
      status_reason: parsed.value.statusReason,
      updated_by_user_id: access.userId,
    })
    .eq("id", billingPeriod.id)
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    rejectValidation(customerPath);
  }

  redirectToCustomerProfile(customerPath, "updated");
}

async function cancelBillingPeriod(customerPath: string, formData: FormData) {
  const access = await resolveInternalUserAccess(customerPath);
  const parsed = parseCancelForm(formData);
  if (!parsed.ok) {
    rejectValidation(customerPath);
  }

  const admin = createAdminClient();
  const billingPeriodResult = await loadBillingPeriod(admin, parsed.value.billingPeriodId);
  if (!billingPeriodResult.ok) {
    rejectValidation(customerPath);
  }

  const billingPeriod = billingPeriodResult.billingPeriod;
  if (billingPeriod.account_owner_user_id !== access.internalUser.account_owner_user_id) {
    rejectAccessDenied(customerPath);
  }

  const agreementResult = await loadAgreement(admin, billingPeriod.maintenance_agreement_id);
  if (!agreementResult.ok) {
    if (agreementResult.accessDenied) {
      rejectAccessDenied(customerPath);
    }
    rejectValidation(customerPath);
  }

  const agreement = agreementResult.agreement;
  if (parsed.value.maintenanceAgreementId !== agreement.id) {
    rejectValidation(customerPath);
  }

  const { data, error } = await admin
    .from("maintenance_agreement_billing_periods")
    .update({
      billing_period_status: "cancelled",
      status_reason: parsed.value.statusReason,
      updated_by_user_id: access.userId,
    })
    .eq("id", billingPeriod.id)
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    rejectValidation(customerPath);
  }

  redirectToCustomerProfile(customerPath, "cancelled");
}

async function linkInternalInvoiceToBillingPeriod(customerPath: string, formData: FormData) {
  const access = await resolveInternalUserAccess(customerPath, "billing_period_invoice_link_denied");
  const parsed = parseLinkForm(formData);
  if (!parsed.ok) {
    rejectInvoiceLinkInvalid(customerPath);
  }

  const admin = createAdminClient();
  const billingPeriodResult = await loadBillingPeriod(admin, parsed.value.billingPeriodId);
  if (!billingPeriodResult.ok) {
    rejectInvoiceLinkInvalid(customerPath);
  }

  const billingPeriod = billingPeriodResult.billingPeriod;
  if (billingPeriod.account_owner_user_id !== access.internalUser.account_owner_user_id) {
    rejectInvoiceLinkDenied(customerPath);
  }

  if (clean(billingPeriod.billing_period_status).toLowerCase() === "cancelled") {
    rejectInvoiceLinkInvalid(customerPath);
  }

  if (billingPeriod.internal_invoice_id) {
    rejectInvoiceLinkConflict(customerPath);
  }

  const agreementResult = await loadAgreement(admin, billingPeriod.maintenance_agreement_id);
  if (!agreementResult.ok) {
    if (agreementResult.accessDenied) {
      rejectInvoiceLinkDenied(customerPath);
    }
    rejectInvoiceLinkInvalid(customerPath);
  }

  const agreement = agreementResult.agreement;
  if (agreement.account_owner_user_id !== access.internalUser.account_owner_user_id) {
    rejectInvoiceLinkDenied(customerPath);
  }

  const invoiceResult = await loadInternalInvoice(admin, parsed.value.internalInvoiceId);
  if (!invoiceResult.ok) {
    rejectInvoiceLinkInvalid(customerPath);
  }

  const invoice = invoiceResult.invoice;
  if (invoice.account_owner_user_id !== agreement.account_owner_user_id) {
    rejectInvoiceLinkDenied(customerPath);
  }

  if (invoice.status === "void") {
    rejectInvoiceLinkInvalid(customerPath);
  }

  const claimedByAnotherPeriod = await isInvoiceClaimedByAnotherBillingPeriod({
    admin,
    accountOwnerUserId: agreement.account_owner_user_id,
    internalInvoiceId: invoice.id,
    currentBillingPeriodId: billingPeriod.id,
  });
  if (claimedByAnotherPeriod) {
    rejectInvoiceLinkConflict(customerPath);
  }

  if (invoice.customer_id && invoice.customer_id !== agreement.customer_id) {
    rejectInvoiceLinkInvalid(customerPath);
  }

  if (!invoice.job_id) {
    rejectInvoiceLinkInvalid(customerPath);
  }

  const linkedToAgreement = await hasInvoiceJobLinkedToAgreement({
    admin,
    accountOwnerUserId: agreement.account_owner_user_id,
    agreementId: agreement.id,
    jobId: invoice.job_id,
  });
  if (!linkedToAgreement) {
    rejectInvoiceLinkInvalid(customerPath);
  }

  const { data, error } = await admin
    .from("maintenance_agreement_billing_periods")
    .update({
      internal_invoice_id: invoice.id,
      billing_period_status: "invoice_linked",
      updated_by_user_id: access.userId,
    })
    .eq("id", billingPeriod.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      rejectInvoiceLinkConflict(customerPath);
    }
    rejectInvoiceLinkInvalid(customerPath);
  }

  if (!data?.id) {
    rejectInvoiceLinkInvalid(customerPath);
  }

  redirectToCustomerProfile(customerPath, "billing_period_invoice_linked");
}

async function unlinkInternalInvoiceFromBillingPeriod(customerPath: string, formData: FormData) {
  const access = await resolveInternalUserAccess(customerPath, "billing_period_invoice_link_denied");
  const parsed = parseUnlinkForm(formData);
  if (!parsed.ok) {
    if ("reasonRequired" in parsed && parsed.reasonRequired) {
      rejectInvoiceUnlinkReasonRequired(customerPath);
    }
    rejectInvoiceLinkInvalid(customerPath);
  }

  const admin = createAdminClient();
  const billingPeriodResult = await loadBillingPeriod(admin, parsed.value.billingPeriodId);
  if (!billingPeriodResult.ok) {
    rejectInvoiceLinkInvalid(customerPath);
  }

  const billingPeriod = billingPeriodResult.billingPeriod;
  if (billingPeriod.account_owner_user_id !== access.internalUser.account_owner_user_id) {
    rejectInvoiceLinkDenied(customerPath);
  }

  if (!billingPeriod.internal_invoice_id) {
    rejectInvoiceLinkInvalid(customerPath);
  }

  const { data, error } = await admin
    .from("maintenance_agreement_billing_periods")
    .update({
      internal_invoice_id: null,
      billing_period_status: "pending_billing",
      status_reason: parsed.value.statusReason,
      updated_by_user_id: access.userId,
    })
    .eq("id", billingPeriod.id)
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    rejectInvoiceLinkInvalid(customerPath);
  }

  redirectToCustomerProfile(customerPath, "billing_period_invoice_unlinked");
}

export async function createMaintenanceAgreementBillingPeriodFromForm(
  customerPath: string,
  formData: FormData,
) {
  await createBillingPeriod(customerPath, formData);
}

export async function updateMaintenanceAgreementBillingPeriodFromForm(
  customerPath: string,
  formData: FormData,
) {
  await updateBillingPeriod(customerPath, formData);
}

export async function cancelMaintenanceAgreementBillingPeriodFromForm(
  customerPath: string,
  formData: FormData,
) {
  await cancelBillingPeriod(customerPath, formData);
}

export async function linkInternalInvoiceToBillingPeriodFromForm(
  customerPath: string,
  formData: FormData,
) {
  await linkInternalInvoiceToBillingPeriod(customerPath, formData);
}

export async function unlinkInternalInvoiceFromBillingPeriodFromForm(
  customerPath: string,
  formData: FormData,
) {
  await unlinkInternalInvoiceFromBillingPeriod(customerPath, formData);
}