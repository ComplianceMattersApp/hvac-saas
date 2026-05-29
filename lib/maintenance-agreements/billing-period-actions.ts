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
  | "billing_period_anchor_linked"
  | "billing_period_anchor_link_denied"
  | "billing_period_anchor_link_invalid"
  | "billing_period_anchor_link_conflict"
  | "validation_error"
  | "duplicate_or_overlap_error"
  | "access_denied"
  | "billing_period_invoice_linked"
  | "billing_period_invoice_unlinked"
  | "billing_period_invoice_link_denied"
  | "billing_period_invoice_link_invalid"
  | "billing_period_invoice_link_conflict"
  | "billing_period_invoice_unlink_reason_required"
  | "billing_period_invoice_generated"
  | "billing_period_invoice_generate_denied"
  | "billing_period_invoice_generate_invalid"
  | "billing_period_invoice_generate_anchor_invalid"
  | "billing_period_invoice_generate_conflict";

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

type AnchorJobRow = {
  id: string;
  customer_id: string | null;
  location_id: string | null;
  service_case_id: string | null;
  status: string | null;
  deleted_at: string | null;
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

type GenerateDraftInvoiceInput = {
  billingPeriodId: string;
  anchorJobId: string;
};

type LinkBillingAnchorInput = {
  billingPeriodId: string;
  anchorJobId: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_INVOICE_STATUSES = new Set(["draft", "pending_billing"]);
const EXTERNAL_OFF_PLATFORM_STATUSES = new Set(["draft", "externally_billed"]);
const MANUAL_STATUSES = new Set(["draft", "pending_billing"]);
const DISALLOWED_BILLING_ANCHOR_JOB_STATUSES = new Set([
  "cancelled",
  "canceled",
  "closed",
  "void",
  "voided",
  "archived",
]);

function buildInternalInvoiceNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `INV-${datePart}-${suffix}`;
}

function formatScaledInt(value: number, scale: number) {
  const sign = value < 0 ? "-" : "";
  const normalized = Math.abs(Math.trunc(value));
  const divisor = 10 ** scale;
  const whole = Math.floor(normalized / divisor);
  const fraction = String(normalized % divisor).padStart(scale, "0");
  return `${sign}${whole}.${fraction}`;
}

function formatCoverageRangeForDescription(startDate: string, endDate: string) {
  const start = `${startDate.slice(5, 7)}/${startDate.slice(8, 10)}/${startDate.slice(0, 4)}`;
  const end = `${endDate.slice(5, 7)}/${endDate.slice(8, 10)}/${endDate.slice(0, 4)}`;
  return `${start}-${end}`;
}

function buildGeneratedBillingPeriodLineDescription(params: {
  coverageStartDate: string;
  coverageEndDate: string;
  billingCadence: string;
}) {
  const cadence = clean(params.billingCadence).toLowerCase().replace(/[_\s]+/g, " ");
  const cadenceLabel = cadence || "scheduled";
  const range = formatCoverageRangeForDescription(params.coverageStartDate, params.coverageEndDate);
  return `Service Plan Billing Period (${cadenceLabel}): ${range}`;
}

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

function parseGenerateDraftInvoiceForm(formData: FormData) {
  const billingPeriodId = parseUuid(formData.get("billing_period_id"), "Billing period", true);
  if (!billingPeriodId.ok) return billingPeriodId;

  const anchorJobId = parseUuid(formData.get("anchor_job_id"), "Anchor job", true);
  if (!anchorJobId.ok) return anchorJobId;

  return {
    ok: true as const,
    value: {
      billingPeriodId: billingPeriodId.value as string,
      anchorJobId: anchorJobId.value as string,
    } satisfies GenerateDraftInvoiceInput,
  };
}

function parseLinkBillingAnchorForm(formData: FormData) {
  const billingPeriodId = parseUuid(formData.get("billing_period_id"), "Billing period", true);
  if (!billingPeriodId.ok) return billingPeriodId;

  const anchorJobId = parseUuid(formData.get("anchor_job_id"), "Anchor job", true);
  if (!anchorJobId.ok) return anchorJobId;

  return {
    ok: true as const,
    value: {
      billingPeriodId: billingPeriodId.value as string,
      anchorJobId: anchorJobId.value as string,
    } satisfies LinkBillingAnchorInput,
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

async function loadAnchorJob(admin: any, anchorJobId: string) {
  const { data, error } = await admin
    .from("jobs")
    .select("id, customer_id, location_id, service_case_id, status, deleted_at")
    .eq("id", anchorJobId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    job: {
      id: clean(data.id),
      customer_id: clean(data.customer_id) || null,
      location_id: clean(data.location_id) || null,
      service_case_id: clean(data.service_case_id) || null,
      status: clean(data.status) || null,
      deleted_at: clean(data.deleted_at) || null,
    } satisfies AnchorJobRow,
  };
}

function isUnusableBillingAnchorJob(job: AnchorJobRow) {
  if (job.deleted_at) return true;
  const status = clean(job.status).toLowerCase();
  if (!status) return false;
  return DISALLOWED_BILLING_ANCHOR_JOB_STATUSES.has(status);
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

function rejectInvoiceGenerateDenied(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "billing_period_invoice_generate_denied");
}

function rejectBillingAnchorLinkDenied(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "billing_period_anchor_link_denied");
}

function rejectInvoiceGenerateInvalid(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "billing_period_invoice_generate_invalid");
}

function rejectBillingAnchorLinkInvalid(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "billing_period_anchor_link_invalid");
}

function rejectInvoiceGenerateAnchorInvalid(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "billing_period_invoice_generate_anchor_invalid");
}

function rejectInvoiceGenerateConflict(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "billing_period_invoice_generate_conflict");
}

function rejectBillingAnchorLinkConflict(customerPath: string | null | undefined): never {
  redirectToCustomerProfile(customerPath, "billing_period_anchor_link_conflict");
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

async function generateDraftInvoiceFromBillingPeriod(customerPath: string, formData: FormData) {
  const access = await resolveInternalUserAccess(customerPath, "billing_period_invoice_generate_denied");
  const parsed = parseGenerateDraftInvoiceForm(formData);
  if (!parsed.ok) {
    rejectInvoiceGenerateInvalid(customerPath);
  }

  const admin = createAdminClient();
  const billingPeriodResult = await loadBillingPeriod(admin, parsed.value.billingPeriodId);
  if (!billingPeriodResult.ok) {
    rejectInvoiceGenerateInvalid(customerPath);
  }

  const billingPeriod = billingPeriodResult.billingPeriod;
  if (billingPeriod.account_owner_user_id !== access.internalUser.account_owner_user_id) {
    rejectInvoiceGenerateDenied(customerPath);
  }

  if (clean(billingPeriod.billing_period_status).toLowerCase() === "cancelled") {
    rejectInvoiceGenerateInvalid(customerPath);
  }

  if (billingPeriod.internal_invoice_id) {
    rejectInvoiceGenerateConflict(customerPath);
  }

  const agreementResult = await loadAgreement(admin, billingPeriod.maintenance_agreement_id);
  if (!agreementResult.ok) {
    if (agreementResult.accessDenied) {
      rejectInvoiceGenerateDenied(customerPath);
    }
    rejectInvoiceGenerateInvalid(customerPath);
  }

  const agreement = agreementResult.agreement;
  if (agreement.account_owner_user_id !== access.internalUser.account_owner_user_id) {
    rejectInvoiceGenerateDenied(customerPath);
  }

  const anchorJobResult = await loadAnchorJob(admin, parsed.value.anchorJobId);
  if (!anchorJobResult.ok) {
    rejectInvoiceGenerateAnchorInvalid(customerPath);
  }

  const anchorJob = anchorJobResult.job;
  if (anchorJob.customer_id && anchorJob.customer_id !== agreement.customer_id) {
    rejectInvoiceGenerateAnchorInvalid(customerPath);
  }

  const linkedToAgreement = await hasInvoiceJobLinkedToAgreement({
    admin,
    accountOwnerUserId: agreement.account_owner_user_id,
    agreementId: agreement.id,
    jobId: anchorJob.id,
  });
  if (!linkedToAgreement) {
    rejectInvoiceGenerateAnchorInvalid(customerPath);
  }

  const { data: existingInvoiceForAnchorJob, error: existingInvoiceError } = await admin
    .from("internal_invoices")
    .select("id")
    .eq("account_owner_user_id", agreement.account_owner_user_id)
    .eq("job_id", anchorJob.id)
    .neq("status", "void")
    .maybeSingle();
  if (existingInvoiceError) throw existingInvoiceError;
  if (existingInvoiceForAnchorJob?.id) {
    rejectInvoiceGenerateConflict(customerPath);
  }

  const { data: fullBillingPeriod, error: fullBillingPeriodError } = await admin
    .from("maintenance_agreement_billing_periods")
    .select("amount_due_cents, coverage_start_date, coverage_end_date, billing_cadence, billing_posture")
    .eq("id", billingPeriod.id)
    .maybeSingle();
  if (fullBillingPeriodError) throw fullBillingPeriodError;
  if (!fullBillingPeriod) {
    rejectInvoiceGenerateInvalid(customerPath);
  }

  const amountDueCents = Number(fullBillingPeriod.amount_due_cents ?? 0);
  if (!Number.isInteger(amountDueCents) || amountDueCents <= 0) {
    rejectInvoiceGenerateInvalid(customerPath);
  }

  if (clean(fullBillingPeriod.billing_posture).toLowerCase() !== "internal_invoice") {
    rejectInvoiceGenerateInvalid(customerPath);
  }

  const coverageStartDate = clean(fullBillingPeriod.coverage_start_date);
  const coverageEndDate = clean(fullBillingPeriod.coverage_end_date);
  if (!DATE_RE.test(coverageStartDate) || !DATE_RE.test(coverageEndDate) || coverageEndDate < coverageStartDate) {
    rejectInvoiceGenerateInvalid(customerPath);
  }

  const lineDescription = buildGeneratedBillingPeriodLineDescription({
    coverageStartDate,
    coverageEndDate,
    billingCadence: clean(fullBillingPeriod.billing_cadence),
  });

  const { data: createdInvoice, error: createInvoiceError } = await admin
    .from("internal_invoices")
    .insert({
      account_owner_user_id: agreement.account_owner_user_id,
      job_id: anchorJob.id,
      customer_id: agreement.customer_id,
      location_id: anchorJob.location_id,
      service_case_id: anchorJob.service_case_id,
      invoice_number: buildInternalInvoiceNumber(),
      status: "draft",
      invoice_date: new Date().toISOString().slice(0, 10),
      source_type: "job",
      subtotal_cents: amountDueCents,
      total_cents: amountDueCents,
      notes: null,
      created_by_user_id: access.userId,
      updated_by_user_id: access.userId,
    })
    .select("id, status")
    .maybeSingle();

  if (createInvoiceError) {
    if (createInvoiceError.code === "23505") {
      rejectInvoiceGenerateConflict(customerPath);
    }
    throw createInvoiceError;
  }

  if (!createdInvoice?.id || clean(createdInvoice.status).toLowerCase() !== "draft") {
    rejectInvoiceGenerateInvalid(customerPath);
  }

  const { error: createLineError } = await admin
    .from("internal_invoice_line_items")
    .insert({
      invoice_id: clean(createdInvoice.id),
      sort_order: 1,
      source_kind: "manual",
      item_name_snapshot: "Service Plan Billing Period",
      item_type_snapshot: "service",
      description_snapshot: lineDescription,
      quantity: "1.00",
      unit_price: formatScaledInt(amountDueCents, 2),
      line_subtotal: formatScaledInt(amountDueCents, 2),
      created_by_user_id: access.userId,
      updated_by_user_id: access.userId,
    });
  if (createLineError) {
    throw createLineError;
  }

  const { data: linkedPeriod, error: linkError } = await admin
    .from("maintenance_agreement_billing_periods")
    .update({
      internal_invoice_id: clean(createdInvoice.id),
      billing_period_status: "invoice_linked",
      updated_by_user_id: access.userId,
    })
    .eq("id", billingPeriod.id)
    .is("internal_invoice_id", null)
    .select("id")
    .maybeSingle();

  if (linkError) {
    if (linkError.code === "23505") {
      rejectInvoiceGenerateConflict(customerPath);
    }
    throw linkError;
  }

  if (!linkedPeriod?.id) {
    rejectInvoiceGenerateConflict(customerPath);
  }

  redirectToCustomerProfile(customerPath, "billing_period_invoice_generated");
}

async function linkBillingAnchorJobToBillingPeriod(customerPath: string, formData: FormData) {
  const access = await resolveInternalUserAccess(customerPath, "billing_period_anchor_link_denied");
  const parsed = parseLinkBillingAnchorForm(formData);
  if (!parsed.ok) {
    rejectBillingAnchorLinkInvalid(customerPath);
  }

  const admin = createAdminClient();
  const billingPeriodResult = await loadBillingPeriod(admin, parsed.value.billingPeriodId);
  if (!billingPeriodResult.ok) {
    rejectBillingAnchorLinkInvalid(customerPath);
  }

  const billingPeriod = billingPeriodResult.billingPeriod;
  if (billingPeriod.account_owner_user_id !== access.internalUser.account_owner_user_id) {
    rejectBillingAnchorLinkDenied(customerPath);
  }

  if (clean(billingPeriod.billing_period_status).toLowerCase() === "cancelled") {
    rejectBillingAnchorLinkInvalid(customerPath);
  }

  if (billingPeriod.internal_invoice_id) {
    rejectBillingAnchorLinkConflict(customerPath);
  }

  const agreementResult = await loadAgreement(admin, billingPeriod.maintenance_agreement_id);
  if (!agreementResult.ok) {
    if (agreementResult.accessDenied) {
      rejectBillingAnchorLinkDenied(customerPath);
    }
    rejectBillingAnchorLinkInvalid(customerPath);
  }

  const agreement = agreementResult.agreement;
  if (agreement.account_owner_user_id !== access.internalUser.account_owner_user_id) {
    rejectBillingAnchorLinkDenied(customerPath);
  }

  const { data: fullBillingPeriod, error: fullBillingPeriodError } = await admin
    .from("maintenance_agreement_billing_periods")
    .select("amount_due_cents, billing_posture")
    .eq("id", billingPeriod.id)
    .maybeSingle();
  if (fullBillingPeriodError) throw fullBillingPeriodError;
  if (!fullBillingPeriod) {
    rejectBillingAnchorLinkInvalid(customerPath);
  }

  const amountDueCents = Number(fullBillingPeriod.amount_due_cents ?? 0);
  if (!Number.isInteger(amountDueCents) || amountDueCents <= 0) {
    rejectBillingAnchorLinkInvalid(customerPath);
  }

  if (clean(fullBillingPeriod.billing_posture).toLowerCase() !== "internal_invoice") {
    rejectBillingAnchorLinkInvalid(customerPath);
  }

  const anchorJobResult = await loadAnchorJob(admin, parsed.value.anchorJobId);
  if (!anchorJobResult.ok) {
    rejectBillingAnchorLinkInvalid(customerPath);
  }

  const anchorJob = anchorJobResult.job;
  if (anchorJob.customer_id && anchorJob.customer_id !== agreement.customer_id) {
    rejectBillingAnchorLinkInvalid(customerPath);
  }

  if (isUnusableBillingAnchorJob(anchorJob)) {
    rejectBillingAnchorLinkInvalid(customerPath);
  }

  const { data: existingInvoiceForAnchorJob, error: existingInvoiceError } = await admin
    .from("internal_invoices")
    .select("id")
    .eq("account_owner_user_id", agreement.account_owner_user_id)
    .eq("job_id", anchorJob.id)
    .neq("status", "void")
    .maybeSingle();
  if (existingInvoiceError) throw existingInvoiceError;
  if (existingInvoiceForAnchorJob?.id) {
    rejectBillingAnchorLinkConflict(customerPath);
  }

  const linkedToAgreement = await hasInvoiceJobLinkedToAgreement({
    admin,
    accountOwnerUserId: agreement.account_owner_user_id,
    agreementId: agreement.id,
    jobId: anchorJob.id,
  });

  if (!linkedToAgreement) {
    const { error: linkError } = await admin
      .from("maintenance_agreement_visits")
      .insert({
        account_owner_user_id: agreement.account_owner_user_id,
        agreement_id: agreement.id,
        job_id: anchorJob.id,
        link_source: "manual",
        count_status: "linked",
        counts_toward_visit_balance: false,
        created_by_user_id: access.userId,
        updated_by_user_id: access.userId,
      });

    if (linkError) {
      if (linkError.code === "23505") {
        rejectBillingAnchorLinkConflict(customerPath);
      }
      throw linkError;
    }
  }

  redirectToCustomerProfile(customerPath, "billing_period_anchor_linked");
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

export async function generateDraftInvoiceFromBillingPeriodFromForm(
  customerPath: string,
  formData: FormData,
) {
  await generateDraftInvoiceFromBillingPeriod(customerPath, formData);
}

export async function linkBillingAnchorJobFromForm(
  customerPath: string,
  formData: FormData,
) {
  await linkBillingAnchorJobToBillingPeriod(customerPath, formData);
}