// app/customers/[id]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  resolveCustomerVisibilityScope,
} from "@/lib/customers/visibility";
import {
  archiveCustomerFromForm,
  updateCustomerNotesFromForm,
} from "@/lib/actions/customer-actions";
import { startCustomerSavedPaymentMethodSetupFromForm } from "@/lib/actions/customer-saved-payment-method-actions";
import {
  addCustomerRoleContactFromForm,
  addLocationRoleContactFromForm,
} from "@/lib/actions/contact-recipient-actions";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";
import { listEstimatesByAccount, type EstimateListItem } from "@/lib/estimates/estimate-read";
import { requireInternalUser, isInternalAccessError } from "@/lib/auth/internal-user";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import {
  createMaintenanceAgreementFromForm,
  updateMaintenanceAgreementFromForm,
} from "@/lib/maintenance-agreements/agreement-actions";
import {
  cancelMaintenanceAgreementBillingPeriodFromForm,
  createMaintenanceAgreementBillingPeriodFromForm,
  generateDraftInvoiceFromBillingPeriodFromForm,
  linkBillingAnchorJobFromForm,
  linkInternalInvoiceToBillingPeriodFromForm,
  unlinkInternalInvoiceFromBillingPeriodFromForm,
  updateMaintenanceAgreementBillingPeriodFromForm,
} from "@/lib/maintenance-agreements/billing-period-actions";
import {
  MAINTENANCE_AGREEMENT_FREQUENCIES,
  MAINTENANCE_AGREEMENT_STATUSES,
  MAINTENANCE_AGREEMENT_TYPES,
  listMaintenanceAgreementsForCustomer,
  summarizeMaintenanceAgreementVisitLinksForAgreement,
  classifyMaintenanceAgreementDueState,
  type MaintenanceAgreementVisitLinkSummary,
  type MaintenanceAgreementRow,
} from "@/lib/maintenance-agreements/read-model";
import {
  listMaintenanceAgreementTemplatesForAccount,
  type MaintenanceAgreementTemplateRow,
} from "@/lib/maintenance-agreements/template-read-model";
import {
  listMaintenanceAgreementBillingPeriodsForCustomer,
  type MaintenanceAgreementBillingPeriodReadModelRow,
} from "@/lib/maintenance-agreements/billing-period-read-model";
import VisitScopeBuilder from "@/components/jobs/VisitScopeBuilder";
import { sanitizeVisitScopeItems } from "@/lib/jobs/visit-scope";
import { formatDateOnlyDisplay, formatTimestampDateDisplayLA } from "@/lib/utils/schedule-la";
import { formatPersonDisplayName } from "@/lib/utils/identity-display";
import {
  listContactRecipientsForAccount,
  listContactRecipientsForEntity,
} from "@/lib/communications/contact-recipients-read";
import {
  formatRoleForInternalDisplay,
  isDisplayableRole,
} from "@/lib/communications/contact-recipients-display";
import RoleContactsCard from "@/components/RoleContactsCard";
import { listCustomerPaymentHistory, type CustomerPaymentHistoryRow } from "@/lib/reports/payments-register";
import { canManageInvoiceLifecycle, canViewFinancialRegister } from "@/lib/auth/financial-access";
import { formatInvoiceDisplayReference, formatJobDisplayReference } from "@/lib/utils/display-references";
import PaymentHistoryCard from "./_components/PaymentHistoryCard";


type CustomerRow = {
  id?: string;
  customer_id?: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  locations_count?: number | null;
  jobs_count?: number | null;
  last_scheduled_date?: string | null;
};

type ServiceCaseRow = {
  id: string;
  status: string | null;
  case_kind: string | null;
  problem_summary: string | null;
  created_at: string | null;
  resolved_at: string | null;
};
type LocationRow = {
  id?: string;
  location_id?: string;
  customer_id?: string;
  nickname?: string | null;
  label?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  postal_code?: string | null;
  notes?: string | null;
  equipment_count?: number | null;
  jobs_count?: number | null;
  last_scheduled_date?: string | null;
};

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  job_address: string | null;
  city: string | null;
  scheduled_date: string | null;
  created_at: string | null;
  ops_status: string | null;
  contractor_id: string | null;
  service_case_id: string | null;
  parent_job_id: string | null;
  location_id: string | null;
  deleted_at: string | null;
  contractors?: {
    name?: string | null;
  } | null;
};

type CustomerSavedPaymentMethodRow = {
  id: string;
  payment_method_status: string;
  payment_method_type: string;
  is_default: boolean;
  display_brand: string | null;
  display_last4: string | null;
  display_exp_month: number | null;
  display_exp_year: number | null;
  updated_at: string | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function formatDate(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDateOnlyDisplay(raw);
  return formatTimestampDateDisplayLA(raw) || "—";
}

function formatSavedCardLabel(row: CustomerSavedPaymentMethodRow) {
  const brand = String(row.display_brand ?? "").trim();
  const last4 = String(row.display_last4 ?? "").trim();
  const expMonth = Number(row.display_exp_month ?? 0);
  const expYear = Number(row.display_exp_year ?? 0);

  const brandLabel = brand ? brand : "Card";
  const last4Label = last4 ? `•••• ${last4}` : "••••";
  const expLabel =
    expMonth > 0 && expYear > 0
      ? `Exp ${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}`
      : "Exp —";

  return `${brandLabel} ${last4Label} • ${expLabel}`;
}

function formatBillingPeriodPaymentDisplayStateLabel(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "not_invoice_backed") return "Not invoice-backed";
  if (normalized === "invoice_draft") return "Invoice draft";
  if (normalized === "unpaid") return "Unpaid";
  if (normalized === "partially_paid") return "Partially paid";
  if (normalized === "paid") return "Paid";
  if (normalized === "invoice_void") return "Invoice void";
  if (normalized === "payment_attention") return "Payment attention";
  return "—";
}

function formatBillingPeriodInvoiceDisplayLabel(params: {
  invoiceNumber: string | null | undefined;
  invoiceId: string | null | undefined;
}) {
  return formatInvoiceDisplayReference({
    invoiceDisplayNumber: null,
    invoiceNumber: params.invoiceNumber,
    invoiceId: params.invoiceId,
  });
}

function formatShortNote(value?: string | null, maxLength = 120) {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return null;
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, maxLength - 3).trimEnd()}...`;
}

function readTemplateSnapshotString(snapshot: Record<string, unknown> | null, key: string) {
  if (!snapshot) return null;
  const raw = snapshot[key];
  const normalized = String(raw ?? "").trim();
  return normalized || null;
}

function readTemplateSnapshotItemsCount(snapshot: Record<string, unknown> | null) {
  if (!snapshot) return 0;
  const items = snapshot.default_visit_scope_items;
  return Array.isArray(items) ? sanitizeVisitScopeItems(items).length : 0;
}

function formatPhone(phone?: string | null) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone ?? "";
}

function customerDisplayName(customer: CustomerRow) {
  return formatPersonDisplayName({
    fullName: customer.full_name,
    firstName: customer.first_name,
    lastName: customer.last_name,
    fallback: "Unnamed Customer",
  });
}

function locationDisplayName(loc: LocationRow) {
  const label = String(loc.label ?? "").trim();
  const nickname = String(loc.nickname ?? "").trim();
  if (nickname) return nickname;
  if (label) return label;
  return "Location";
}

function locationAddressLine(loc: LocationRow) {
  const parts = [loc.address_line1, loc.city, loc.state, loc.zip]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  return parts.join(", ");
}

function locationCityStateZipLine(loc: LocationRow) {
  const city = String(loc.city ?? "").trim();
  const state = String(loc.state ?? "").trim();
  const zip = String(loc.zip ?? loc.postal_code ?? "").trim();

  const cityState = [city, state].filter(Boolean).join(", ");
  return [cityState, zip].filter(Boolean).join(" ");
}

function billingAddressLine(customer: CustomerRow) {
  const line1 = String(customer.billing_address_line1 ?? "").trim();
  const line2 = String(customer.billing_address_line2 ?? "").trim();
  const city = String(customer.billing_city ?? "").trim();
  const state = String(customer.billing_state ?? "").trim();
  const zip = String(customer.billing_zip ?? "").trim();

  const top = [line1, line2].filter(Boolean).join(", ");
  const bottom = [city, state, zip].filter(Boolean).join(", ");

  return [top, bottom].filter(Boolean).join(" • ");
}

function describeServiceAddressFallback(loc: LocationRow | null) {
  if (!loc) return null;

  const address = locationAddressLine(loc);
  if (!address) return null;

  const label = String(loc.nickname ?? "").trim() || String(loc.label ?? "").trim() || "Service address";
  return { label, address };
}

function resolveCustomerBillingAddress(customer: CustomerRow, serviceFallback: { label: string; address: string } | null) {
  const explicitBillingAddress = billingAddressLine(customer);
  if (explicitBillingAddress) {
    return {
      address: explicitBillingAddress,
      source: "explicit" as const,
      label: null as string | null,
    };
  }

  if (serviceFallback?.address) {
    return {
      address: serviceFallback.address,
      source: "service_fallback" as const,
      label: serviceFallback.label,
    };
  }

  return {
    address: null,
    source: "missing" as const,
    label: null as string | null,
  };
}

function makeMapsHref(address?: string | null) {
  const q = String(address ?? "").trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function makeTelHref(phone?: string | null) {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  return `tel:${digits}`;
}

function sanitizeAgreementDefaultVisitScopeItems(value: unknown) {
  try {
    return sanitizeVisitScopeItems(value);
  } catch {
    return [];
  }
}

function hasAgreementTemplateLockSnapshot(agreement: {
  template_locked_field_keys?: string[] | null;
  template_lock_policy_version?: number | null;
  template_lock_snapshot_applied_at?: string | null;
}) {
  return Boolean(
    agreement.template_lock_snapshot_applied_at &&
      Array.isArray(agreement.template_locked_field_keys) &&
      agreement.template_locked_field_keys.length > 0 &&
      Number.isInteger(Number(agreement.template_lock_policy_version)) &&
      Number(agreement.template_lock_policy_version) > 0,
  );
}

function makeSmsHref(phone?: string | null) {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  return `sms:${digits}`;
}

function safeDecodeMessage(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeOpsStatus(v?: string | null) {
  return String(v ?? "").trim().toLowerCase();
}

function normalizeLifecycleStatus(v?: string | null) {
  return String(v ?? "").trim().toLowerCase();
}

function isLifecycleComplete(v?: string | null) {
  const status = normalizeLifecycleStatus(v);
  return ["completed", "closed", "cancelled"].includes(status);
}

function isOperationallyActiveJob(job: Pick<JobRow, "status" | "ops_status" | "deleted_at">) {
  if (job.deleted_at) return false;

  const lifecycleStatus = normalizeLifecycleStatus(job.status);
  if (lifecycleStatus === "cancelled") return false;

  const opsStatus = normalizeOpsStatus(job.ops_status);
  return opsStatus !== "closed";
}

function opsStatusLabel(v?: string | null) {
  const s = normalizeOpsStatus(v);
  if (s === "need_to_schedule") return "Need to Schedule";
  if (s === "scheduled") return "Scheduled";
  if (s === "pending_info") return "Pending Info";
  if (s === "on_hold") return "On Hold";
  if (s === "failed") return "Failed";
  if (s === "pending_office_review") return "Pending Office Review";
  if (s === "retest_needed") return "Retest Needed";
  if (s === "paperwork_required") return "Paperwork Required";
  if (s === "invoice_required") return "Invoice Required";
  return s ? s.replace(/_/g, " ") : "Unknown";
}

function opsBadgeClass(v?: string | null) {
  const s = normalizeOpsStatus(v);

  if (s === "need_to_schedule") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (s === "scheduled") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  if (s === "pending_info") {
    return "border-orange-200 bg-orange-50 text-orange-800";
  }
  if (s === "on_hold") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }
  if (s === "failed") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (s === "pending_office_review") {
    return "border-cyan-200 bg-cyan-50 text-cyan-800";
  }
  if (s === "retest_needed") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (s === "paperwork_required") {
    return "border-purple-200 bg-purple-50 text-purple-800";
  }
  if (s === "invoice_required") {
    return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

const BILLING_PERIOD_BILLING_CADENCES = ["monthly", "quarterly", "semi_annual", "annual"] as const;
const BILLING_PERIOD_STATUSES = [
  "draft",
  "pending_billing",
  "invoice_linked",
  "externally_billed",
  "no_charge",
  "waived",
  "not_billed",
  "cancelled",
] as const;
const BILLING_PERIOD_POSTURES = [
  "internal_invoice",
  "external_off_platform",
  "manual",
  "no_charge",
  "waived",
  "not_billed_through_compliance_matters",
] as const;

function billingPeriodPostureLabel(value: string) {
  if (value === "internal_invoice") return "Internal invoice";
  if (value === "external_off_platform") return "External off-platform";
  if (value === "manual") return "Manual";
  if (value === "no_charge") return "No charge";
  if (value === "waived") return "Waived";
  if (value === "not_billed_through_compliance_matters") return "Not billed through Compliance Matters";
  return value;
}

function billingPeriodStatusLabel(value: string) {
  if (value === "draft") return "Draft";
  if (value === "pending_billing") return "Pending billing";
  if (value === "invoice_linked") return "Invoice linked";
  if (value === "externally_billed") return "Externally billed";
  if (value === "no_charge") return "No charge";
  if (value === "waived") return "Waived";
  if (value === "not_billed") return "Not billed";
  if (value === "cancelled") return "Cancelled";
  return value;
}

function summaryOrder() {
  return [
    "need_to_schedule",
    "scheduled",
    "pending_info",
    "failed",
    "pending_office_review",
    "retest_needed",
    "paperwork_required",
    "invoice_required",
    "on_hold",
  ] as const;
}

export default async function CustomerDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    err?: string;
    tab?: string;
    maSaved?: string;
    maError?: string;
    maFocus?: string;
    maTemplate?: string;
    banner?: string;
    rcSaved?: string;
    rcError?: string;
    rcLocSaved?: string;
    rcLocError?: string;
  }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const visibilityScope = await resolveCustomerVisibilityScope({
    supabase,
    userId: userData.user.id,
  });

  if (!visibilityScope) redirect("/login");

  const isInternalViewer = visibilityScope.kind === "internal";

  const { id } = await props.params;
  const sp = props.searchParams ? await props.searchParams : {};
  const hasJobsError = sp.err === "has_jobs";
  const maintenanceAgreementSaved = String(sp.maSaved ?? "").trim().toLowerCase();
  const maintenanceAgreementError = String(sp.maError ?? "").trim();
  const maintenanceAgreementFocusId = String(sp.maFocus ?? "").trim();
  const maintenanceAgreementTemplateId = String(sp.maTemplate ?? "").trim();
  const billingPeriodBanner = String(sp.banner ?? "").trim().toLowerCase();
  const roleContactSaved = String(sp.rcSaved ?? "").trim() === "1";
  const roleContactError = String(sp.rcError ?? "").trim() === "1";
  const locationRoleContactSaved = String(sp.rcLocSaved ?? "").trim() === "1";
  const locationRoleContactError = String(sp.rcLocError ?? "").trim() === "1";
  const workspaceTabParam = String(sp.tab ?? "").trim().toLowerCase();

  if (!id || !isUuid(id)) {
    redirect("/customers");
  }

  const customerId = id;
  const customerPath = `/customers/${customerId}`;
  const createAgreementAction = createMaintenanceAgreementFromForm.bind(null, customerPath);
  const updateAgreementAction = updateMaintenanceAgreementFromForm.bind(null, customerPath);

  const customerSelect = `
      id,
      first_name,
      last_name,
      full_name,
      phone,
      email,
      notes,
      billing_address_line1,
      billing_address_line2,
      billing_city,
      billing_state,
      billing_zip
    `;

  let customerData: CustomerRow | null = null;
  let jobs: JobRow[] = [];

  const { data, error: customerErr } = await supabase
    .from("customers")
    .select(customerSelect)
    .eq("id", customerId)
    .maybeSingle();

  if (customerErr) throw customerErr;
  customerData = (data as CustomerRow | null) ?? null;

  const { data: jobsData, error: jobsErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      title,
      status,
      job_address,
      city,
      scheduled_date,
      created_at,
      ops_status,
      contractor_id,
      service_case_id,
      parent_job_id,
      location_id,
      deleted_at
      `,
    )
    .eq("customer_id", customerId)
    .order("scheduled_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (jobsErr) throw jobsErr;
  jobs = (jobsData ?? []) as JobRow[];

  if (!customerData) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-2xl font-semibold">Customer not found</h1>
        <p className="text-sm text-muted-foreground">
          This customer record is missing or not accessible with your current account.
        </p>
        <Link href="/customers" className="text-sm underline">
          Back to Customers
        </Link>
      </div>
    );
  }

  const customer = customerData as CustomerRow;

  let customerRoleContacts = [] as Awaited<ReturnType<typeof listContactRecipientsForEntity>>;
  let locationRoleContacts = [] as Awaited<ReturnType<typeof listContactRecipientsForAccount>>;
  if (isInternalViewer && visibilityScope.kind === "internal") {
    customerRoleContacts = await listContactRecipientsForEntity({
      supabase,
      accountOwnerUserId: visibilityScope.accountOwnerUserId,
      linkedEntityType: "customer",
      linkedEntityId: customerId,
      limit: 100,
    }).catch(() => []);

    locationRoleContacts = await listContactRecipientsForAccount({
      supabase,
      accountOwnerUserId: visibilityScope.accountOwnerUserId,
      linkedEntityType: "location",
      recipientRole: ["site_access_contact", "tenant_or_occupant", "responsible_party"],
      status: ["active"],
      limit: 250,
    }).catch(() => []);
  }

  let locationsData: LocationRow[] = [];

  const { data: locationRows, error: locationsErr } = await supabase
    .from("locations")
    .select(
      `
      id,
      customer_id,
      nickname,
      label,
      address_line1,
      address_line2,
      city,
      state,
      zip,
      postal_code,
      notes
    `,
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });

  if (locationsErr) throw locationsErr;
  locationsData = (locationRows ?? []) as LocationRow[];

  const locations = (locationsData ?? []) as LocationRow[];
  const firstLocationWithAddress = locations.find((loc) => locationAddressLine(loc).trim().length > 0) ?? null;
  const serviceAddressFallback = describeServiceAddressFallback(firstLocationWithAddress);
  const activeJobs = jobs.filter((job) => isOperationallyActiveJob(job));

  // Lightweight service-case awareness
  const serviceCaseIds = Array.from(
    new Set(
      jobs
        .map((j) => String(j.service_case_id ?? "").trim())
        .filter(Boolean)
    )
  );

  const serviceCaseVisitCounts = new Map<string, number>();
  if (serviceCaseIds.length > 0) {
    const { data: serviceCaseJobs, error: scErr } = await supabase
      .from("jobs")
      .select("service_case_id")
      .in("service_case_id", serviceCaseIds);

    if (scErr) throw scErr;

    for (const row of serviceCaseJobs ?? []) {
      const key = String((row as { service_case_id?: string | null }).service_case_id ?? "").trim();
      if (!key) continue;
      serviceCaseVisitCounts.set(key, (serviceCaseVisitCounts.get(key) ?? 0) + 1);
    }
  }

  // Fetch service case metadata for case headers
  const serviceCasesById = new Map<string, ServiceCaseRow>();
  if (serviceCaseIds.length > 0) {
    const { data: serviceCasesData, error: serviceCasesErr } = await supabase
      .from("service_cases")
      .select("id, status, case_kind, problem_summary, created_at, resolved_at")
      .in("id", serviceCaseIds);

    if (serviceCasesErr) throw serviceCasesErr;

    for (const sc of serviceCasesData ?? []) {
      serviceCasesById.set(String(sc.id ?? ""), sc as ServiceCaseRow);
    }
  }

  // Build job grouping by service_case_id
  const caseGroups = new Map<string, JobRow[]>();
  const ungroupedJobs: JobRow[] = [];

  for (const job of jobs) {
    const caseId = String(job.service_case_id ?? "").trim();
    if (caseId) {
      if (!caseGroups.has(caseId)) {
        caseGroups.set(caseId, []);
      }
      caseGroups.get(caseId)?.push(job);
    } else {
      ungroupedJobs.push(job);
    }
  }

  // Sort case IDs by creation date (earliest case first)
  const sortedCaseIds = Array.from(caseGroups.keys()).sort((aId, bId) => {
    const aCase = serviceCasesById.get(aId);
    const bCase = serviceCasesById.get(bId);
    const aTime = aCase?.created_at ? new Date(aCase.created_at).getTime() : 0;
    const bTime = bCase?.created_at ? new Date(bCase.created_at).getTime() : 0;
    return aTime - bTime;
  });

  // Retest resolution awareness: identify parent failed jobs whose retest child has resolved
  const failedJobIds = activeJobs
    .filter((j) => normalizeOpsStatus(j.ops_status) === "failed")
    .map((j) => j.id);

  const resolvedRetestParentIds = new Set<string>();
  if (failedJobIds.length > 0) {
    const { data: retestChildren, error: retestErr } = await supabase
      .from("jobs")
      .select("parent_job_id")
      .in("parent_job_id", failedJobIds)
      .in("ops_status", ["paperwork_required", "invoice_required", "closed"])
      .is("deleted_at", null);

    if (retestErr) throw retestErr;

    for (const row of retestChildren ?? []) {
      const pid = String((row as { parent_job_id?: string | null }).parent_job_id ?? "").trim();
      if (pid) resolvedRetestParentIds.add(pid);
    }
  }

  const jobsByLocationCount = new Map<string, number>();
  for (const job of activeJobs) {
    const key = String(job.location_id ?? "").trim();
    if (!key) continue;
    jobsByLocationCount.set(key, (jobsByLocationCount.get(key) ?? 0) + 1);
  }

  const opsCounts: Record<string, number> = {};
  for (const job of activeJobs) {
    const key = normalizeOpsStatus(job.ops_status) || "unknown";
    opsCounts[key] = (opsCounts[key] ?? 0) + 1;
  }

  const activeWorkCount = activeJobs.length;
  const completedJobsCount = jobs.filter((job) => {
    if (job.deleted_at) return false;
    const opsStatus = normalizeOpsStatus(job.ops_status);
    return opsStatus === "closed";
  }).length;

  const lastScheduledActiveDate = activeJobs
    .map((j) => j.scheduled_date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] ?? null;

  const callHref = makeTelHref(customer.phone);
  const smsHref = makeSmsHref(customer.phone);
  const resolvedBillingAddress = resolveCustomerBillingAddress(customer, serviceAddressFallback);
  const locationRoleContactsByLocationId = locationRoleContacts.reduce<Record<string, typeof locationRoleContacts>>(
    (acc, recipient) => {
      const key = String(recipient.linked_entity_id ?? "").trim();
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(recipient);
      return acc;
    },
    {},
  );
  const hasDisplayableRoleContacts = customerRoleContacts.some((recipient) =>
    isDisplayableRole(recipient.recipient_role),
  );
  const displayableRoleContactCount = customerRoleContacts.filter((recipient) =>
    isDisplayableRole(recipient.recipient_role),
  ).length;
  const savedBillingContact = customerRoleContacts.find((recipient) => {
    const role = String(recipient.recipient_role ?? "").trim().toLowerCase();
    const status = String(recipient.status ?? "").trim().toLowerCase();
    return role === "billing_contact" && status !== "inactive";
  }) ?? null;
  const savedBillingContactName = String(savedBillingContact?.display_name ?? "").trim();
  const savedBillingContactPhone = String(savedBillingContact?.phone_e164 ?? "").trim();
  const savedBillingContactEmail = String(savedBillingContact?.email ?? "").trim();
  const hasSavedBillingContact = Boolean(
    savedBillingContactName || savedBillingContactPhone || savedBillingContactEmail,
  );
  const activeDisplayableCustomerRoleContacts = customerRoleContacts.filter((recipient) => {
    const role = isDisplayableRole(recipient.recipient_role);
    const status = String(recipient.status ?? "").trim().toLowerCase();
    return role && status !== "inactive";
  });
  const mainContactRolePriority = ["responsible_party", "homeowner", "tenant_or_occupant", "site_access_contact"];
  const primaryAccountContact =
    mainContactRolePriority
      .map((role) =>
        activeDisplayableCustomerRoleContacts.find(
          (recipient) => String(recipient.recipient_role ?? "").trim().toLowerCase() === role,
        ),
      )
      .find(Boolean) ?? activeDisplayableCustomerRoleContacts[0] ?? null;
  const siteAccessContact =
    activeDisplayableCustomerRoleContacts.find(
      (recipient) => String(recipient.recipient_role ?? "").trim().toLowerCase() === "site_access_contact",
    ) ?? locationRoleContacts[0] ?? null;
  const totalContactCount = new Set(
    [...customerRoleContacts, ...locationRoleContacts].map((recipient) => String(recipient.id ?? "").trim()).filter(Boolean),
  ).size;
  const primaryServiceLocationId = String(
    firstLocationWithAddress?.id ?? firstLocationWithAddress?.location_id ?? "",
  ).trim();

  // Maintenance Agreements: load only for internal viewers when the flag is on
  // The maintenance_agreements table does not exist in production yet. The flag
  // defaults to false, so production reads are never attempted.
  let customerAgreements: MaintenanceAgreementRow[] = [];
  const maintenanceAgreementsEnabled = isInternalViewer && isMaintenanceAgreementsEnabled();
  if (maintenanceAgreementsEnabled) {
    try {
      customerAgreements = await listMaintenanceAgreementsForCustomer({
        supabase,
        accountOwnerUserId: visibilityScope.accountOwnerUserId,
        customerId,
      });
    } catch {
      // Fail safely — table may not exist in this environment
      customerAgreements = [];
    }
  }

  let agreementTemplates: MaintenanceAgreementTemplateRow[] = [];
  if (maintenanceAgreementsEnabled) {
    try {
      agreementTemplates = await listMaintenanceAgreementTemplatesForAccount({
        supabase,
        accountOwnerUserId: visibilityScope.accountOwnerUserId,
        limit: 200,
      });
    } catch {
      agreementTemplates = [];
    }
  }
  const selectedAgreementTemplate =
    agreementTemplates.find((template) => template.id === maintenanceAgreementTemplateId) ?? null;
  const createAgreementTypeDefault =
    selectedAgreementTemplate
    && MAINTENANCE_AGREEMENT_TYPES.includes(selectedAgreementTemplate.agreement_type as any)
      ? selectedAgreementTemplate.agreement_type
      : "maintenance";
  const createAgreementFrequencyDefault =
    selectedAgreementTemplate
    && MAINTENANCE_AGREEMENT_FREQUENCIES.includes(selectedAgreementTemplate.frequency as any)
      ? selectedAgreementTemplate.frequency
      : "quarterly";
  const createAgreementVisitScopeSummaryDefault = selectedAgreementTemplate?.default_visit_scope_summary ?? "";
  const createAgreementVisitScopeItemsDefault = selectedAgreementTemplate?.default_visit_scope_items ?? [];
  const createAgreementInternalNotesDefault = selectedAgreementTemplate?.internal_notes_default ?? "";

  let customerBillingPeriods: MaintenanceAgreementBillingPeriodReadModelRow[] = [];
  const billingPeriodsByAgreementId = new Map<string, MaintenanceAgreementBillingPeriodReadModelRow[]>();
  if (maintenanceAgreementsEnabled && customerAgreements.length > 0) {
    try {
      customerBillingPeriods = await listMaintenanceAgreementBillingPeriodsForCustomer({
        supabase,
        accountOwnerUserId: visibilityScope.accountOwnerUserId,
        customerId,
      });

      for (const billingPeriod of customerBillingPeriods) {
        const agreementId = String(billingPeriod.maintenance_agreement_id ?? "").trim();
        if (!agreementId) continue;
        if (!billingPeriodsByAgreementId.has(agreementId)) {
          billingPeriodsByAgreementId.set(agreementId, []);
        }
        billingPeriodsByAgreementId.get(agreementId)!.push(billingPeriod);
      }
    } catch {
      // Fail safely if the billing-period projection is unavailable in this environment.
      customerBillingPeriods = [];
    }
  }

  const agreementVisitSummaryById = new Map<string, MaintenanceAgreementVisitLinkSummary>();
  if (maintenanceAgreementsEnabled && customerAgreements.length > 0) {
    try {
      const summaryRows = await Promise.all(
        customerAgreements.map(async (agreement) => {
          const summary = await summarizeMaintenanceAgreementVisitLinksForAgreement({
            supabase,
            accountOwnerUserId: visibilityScope.accountOwnerUserId,
            agreementId: agreement.id,
          });
          return [agreement.id, summary] as const;
        }),
      );

      for (const [agreementId, summary] of summaryRows) {
        agreementVisitSummaryById.set(agreementId, summary);
      }
    } catch {
      // Fail safe for environments where visit-link projection is unavailable.
    }
  }

  // Estimates: load only for internal viewers when estimates are enabled
  let customerEstimates: EstimateListItem[] = [];
  const estimatesEnabled = isEstimatesEnabled();
  if (isInternalViewer && estimatesEnabled) {
    try {
      const { internalUser: iu } = await requireInternalUser({ supabase, userId: userData.user.id });
      customerEstimates = await listEstimatesByAccount({
        internalUser: iu,
        customerId,
        supabase,
      });
    } catch (e) {
      if (isInternalAccessError(e)) {
        // silently skip — internal user check already passed above
      } else {
        throw e;
      }
    }
  }

  // Payment History: load only for authorized financial viewers
  let customerPaymentHistory: CustomerPaymentHistoryRow[] = [];
  let canViewPaymentHistory = false;
  let canManageBillingPeriods = false;
  let canManageSavedPaymentMethodSetup = false;
  let customerSavedPaymentMethods: CustomerSavedPaymentMethodRow[] = [];

  if (isInternalViewer) {
    try {
      const { internalUser: iu } = await requireInternalUser({ supabase, userId: userData.user.id });
      canViewPaymentHistory = canViewFinancialRegister({
        internalUser: iu,
        resourceAccountOwnerUserId: visibilityScope.accountOwnerUserId,
      });
      canManageBillingPeriods = canManageInvoiceLifecycle({
        internalUser: iu,
        resourceAccountOwnerUserId: visibilityScope.accountOwnerUserId,
      });
      canManageSavedPaymentMethodSetup = canManageBillingPeriods;

      if (canViewPaymentHistory) {
        customerPaymentHistory = await listCustomerPaymentHistory({
          supabase,
          accountOwnerUserId: visibilityScope.accountOwnerUserId,
          customerId,
          limit: 50,
        });
      }

      if (canManageSavedPaymentMethodSetup) {
        const { data: methodRows, error: methodError } = await supabase
          .from("tenant_customer_payment_methods")
          .select(
            [
              "id",
              "payment_method_status",
              "payment_method_type",
              "is_default",
              "display_brand",
              "display_last4",
              "display_exp_month",
              "display_exp_year",
              "updated_at",
            ].join(", "),
          )
          .eq("account_owner_user_id", visibilityScope.accountOwnerUserId)
          .eq("customer_id", customerId)
          .order("is_default", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(5);

        if (methodError) {
          throw methodError;
        }

        customerSavedPaymentMethods = (Array.isArray(methodRows) ? methodRows : []).map((row: any) => ({
          id: String(row.id ?? "").trim(),
          payment_method_status: String(row.payment_method_status ?? "").trim(),
          payment_method_type: String(row.payment_method_type ?? "").trim(),
          is_default: Boolean(row.is_default),
          display_brand: String(row.display_brand ?? "").trim() || null,
          display_last4: String(row.display_last4 ?? "").trim() || null,
          display_exp_month: Number.isInteger(row.display_exp_month) ? Number(row.display_exp_month) : null,
          display_exp_year: Number.isInteger(row.display_exp_year) ? Number(row.display_exp_year) : null,
          updated_at: String(row.updated_at ?? "").trim() || null,
        }));
      }
    } catch {
      // Fail safely if read fails
      customerPaymentHistory = [];
      canViewPaymentHistory = false;
      canManageSavedPaymentMethodSetup = false;
      customerSavedPaymentMethods = [];
    }
  }
  const failedPaymentAttentionCount = customerPaymentHistory.filter((payment) => payment.status === "failed").length;
  const collectedPaymentCount = customerPaymentHistory.filter((payment) => payment.status === "recorded").length;
  const mostRecentPayment = customerPaymentHistory[0] ?? null;
  const mostRecentInvoiceWorkspaceHref = customerPaymentHistory.find((payment) => payment.invoiceHref)?.invoiceHref ?? null;
  const hasSavedCardOnFile = customerSavedPaymentMethods.length > 0;
  const primarySavedCard = customerSavedPaymentMethods.find((method) => method.is_default) ?? customerSavedPaymentMethods[0] ?? null;
  const activeServicePlanCount = customerAgreements.filter(
    (agreement) => String(agreement.status ?? "").trim().toLowerCase() === "active",
  ).length;
  const overdueServicePlanCount = customerAgreements.filter((agreement) => {
    const dueState = classifyMaintenanceAgreementDueState({
      status: agreement.status,
      nextDueDate: agreement.next_due_date,
    });
    return dueState === "overdue";
  }).length;
  const notScheduledServicePlanCount = customerAgreements.filter((agreement) => {
    const dueState = classifyMaintenanceAgreementDueState({
      status: agreement.status,
      nextDueDate: agreement.next_due_date,
    });
    return dueState === "not_scheduled";
  }).length;
  const billingPeriodsNeedingAttentionCount = customerBillingPeriods.filter(
    (billingPeriod) => billingPeriod.payment_display_state === "payment_attention",
  ).length;
  const linkedBillingPeriodCount = customerBillingPeriods.filter((billingPeriod) => Boolean(billingPeriod.internal_invoice_id)).length;
  const paidBillingPeriodCount = customerBillingPeriods.filter(
    (billingPeriod) => billingPeriod.payment_display_state === "paid",
  ).length;
  const nextServicePlanDueDate = customerAgreements
    .map((agreement) => String(agreement.next_due_date ?? "").trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort()[0] ?? null;

  const createBillingPeriodAction = createMaintenanceAgreementBillingPeriodFromForm.bind(null, customerPath);
  const updateBillingPeriodAction = updateMaintenanceAgreementBillingPeriodFromForm.bind(null, customerPath);
  const cancelBillingPeriodAction = cancelMaintenanceAgreementBillingPeriodFromForm.bind(null, customerPath);
  const generateDraftInvoiceFromBillingPeriodAction = generateDraftInvoiceFromBillingPeriodFromForm.bind(null, customerPath);
  const linkBillingAnchorJobAction = linkBillingAnchorJobFromForm.bind(null, customerPath);
  const linkBillingPeriodInvoiceAction = linkInternalInvoiceToBillingPeriodFromForm.bind(null, customerPath);
  const unlinkBillingPeriodInvoiceAction = unlinkInternalInvoiceFromBillingPeriodFromForm.bind(null, customerPath);
  const startSavedPaymentMethodSetupAction = startCustomerSavedPaymentMethodSetupFromForm.bind(null, customerPath);
  const workspaceNavigationItems = [
    { id: "overview", label: "Overview" },
    { id: "work", label: "Work" },
    { id: "money", label: "Money" },
    { id: "service-plans", label: "Service Plans" },
    { id: "locations-contacts", label: "Locations & Contacts" },
    { id: "history", label: "Customer Notes" },
    { id: "settings", label: "Settings" },
  ] as const;
  type WorkspaceTabId = (typeof workspaceNavigationItems)[number]["id"];
  const activeWorkspaceTab: WorkspaceTabId = workspaceNavigationItems.some((item) => item.id === workspaceTabParam)
    ? (workspaceTabParam as WorkspaceTabId)
    : "overview";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-7 p-4 md:space-y-8 md:p-6">
        {billingPeriodBanner === "created" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Billing period created.
          </div>
        )}
        {billingPeriodBanner === "updated" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Billing period updated.
          </div>
        )}
        {billingPeriodBanner === "cancelled" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Billing period cancelled.
          </div>
        )}
        {billingPeriodBanner === "billing_period_invoice_linked" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Billing period linked to existing invoice for visibility. No invoice was generated, sent, or charged.
          </div>
        )}
        {billingPeriodBanner === "billing_period_invoice_unlinked" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Billing period unlinked from invoice. Invoice and payment history are preserved.
          </div>
        )}
        {billingPeriodBanner === "billing_period_invoice_generated" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Draft invoice generated from billing period. No invoice was issued, sent, emailed, charged, or linked to payment.
          </div>
        )}
        {billingPeriodBanner === "billing_period_anchor_linked" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Billing anchor job linked to service plan. This does not complete a service visit, create an invoice, send an invoice, or charge a customer.
          </div>
        )}
        {billingPeriodBanner === "saved_payment_method_setup_returned" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Saved card setup returned from Stripe. Final saved-method status is recorded after webhook verification.
          </div>
        )}
        {billingPeriodBanner === "saved_payment_method_setup_cancelled" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Saved card setup was cancelled before completion. No charge was created and autopay remains off.
          </div>
        )}
        {(billingPeriodBanner === "validation_error" || billingPeriodBanner === "duplicate_or_overlap_error" || billingPeriodBanner === "access_denied" || billingPeriodBanner === "billing_period_anchor_link_denied" || billingPeriodBanner === "billing_period_anchor_link_invalid" || billingPeriodBanner === "billing_period_anchor_link_conflict" || billingPeriodBanner === "billing_period_invoice_link_denied" || billingPeriodBanner === "billing_period_invoice_link_invalid" || billingPeriodBanner === "billing_period_invoice_link_conflict" || billingPeriodBanner === "billing_period_invoice_unlink_reason_required" || billingPeriodBanner === "billing_period_invoice_generate_denied" || billingPeriodBanner === "billing_period_invoice_generate_invalid" || billingPeriodBanner === "billing_period_invoice_generate_anchor_invalid" || billingPeriodBanner === "billing_period_invoice_generate_conflict") && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {billingPeriodBanner === "validation_error" && "Could not save billing period. Verify the required fields and status/posture rules."}
            {billingPeriodBanner === "duplicate_or_overlap_error" && "A billing period with the same or overlapping coverage window already exists for this agreement."}
            {billingPeriodBanner === "access_denied" && "You do not have permission to manage billing periods for this customer."}
            {billingPeriodBanner === "billing_period_anchor_link_denied" && "You do not have permission to link billing anchor jobs for this customer."}
            {billingPeriodBanner === "billing_period_anchor_link_invalid" && "Could not link billing anchor job. Verify billing period eligibility, account scope, customer match, and anchor job id."}
            {billingPeriodBanner === "billing_period_anchor_link_conflict" && "Could not link billing anchor job. Billing period is already invoice-linked or the selected job already has an active invoice."}
            {billingPeriodBanner === "billing_period_invoice_link_denied" && "You do not have permission to link or unlink invoices on billing periods for this customer."}
            {billingPeriodBanner === "billing_period_invoice_link_invalid" && "Could not link invoice. Verify the invoice belongs to this customer and is eligible for linking."}
            {billingPeriodBanner === "billing_period_invoice_link_conflict" && "Could not link invoice. It is already linked to another billing period or conflicts with this billing period."}
            {billingPeriodBanner === "billing_period_invoice_unlink_reason_required" && "A reason is required to unlink an invoice from a billing period."}
            {billingPeriodBanner === "billing_period_invoice_generate_denied" && "You do not have permission to generate draft invoices from billing periods for this customer."}
            {billingPeriodBanner === "billing_period_invoice_generate_invalid" && "Could not generate draft invoice. Verify billing period eligibility and required fields."}
            {billingPeriodBanner === "billing_period_invoice_generate_anchor_invalid" && "Could not generate draft invoice. Anchor job is invalid or is not linked to this service plan."}
            {billingPeriodBanner === "billing_period_invoice_generate_conflict" && "Could not generate draft invoice. Billing period is already linked or the anchor job already has an active invoice."}
          </div>
        )}
        {(billingPeriodBanner === "saved_payment_method_setup_denied" || billingPeriodBanner === "saved_payment_method_setup_invalid" || billingPeriodBanner === "saved_payment_method_setup_connect_not_ready" || billingPeriodBanner === "saved_payment_method_setup_failed") && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {billingPeriodBanner === "saved_payment_method_setup_denied" && "You do not have permission to set up a saved card for this customer."}
            {billingPeriodBanner === "saved_payment_method_setup_invalid" && "Could not start saved card setup. Verify customer scope and required setup inputs."}
            {billingPeriodBanner === "saved_payment_method_setup_connect_not_ready" && "Could not start saved card setup. Tenant Stripe Connect account is not ready."}
            {billingPeriodBanner === "saved_payment_method_setup_failed" && "Could not start saved card setup due to a Stripe setup error. Try again."}
          </div>
        )}
        {hasJobsError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This customer has non-archived jobs and cannot be archived. Remove or archive all jobs first.
          </div>
        )}
        {maintenanceAgreementSaved === "created" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Maintenance agreement created.
          </div>
        )}
        {maintenanceAgreementSaved === "updated" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Maintenance agreement updated.
          </div>
        )}
        {maintenanceAgreementError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {safeDecodeMessage(maintenanceAgreementError)}
          </div>
        )}
        {roleContactSaved && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Account contact saved.
          </div>
        )}
        {roleContactError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            Could not save account contact. Verify role, name, and phone/email.
          </div>
        )}
        {locationRoleContactSaved && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Site/access contact saved.
          </div>
        )}
        {locationRoleContactError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            Could not save location contact. Verify role, name, and phone/email.
          </div>
        )}
        {/* Header */}
        <div className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50/40 p-5 shadow-sm md:flex-row md:items-start md:justify-between md:p-6">
          <div className="space-y-2">
            <Link
              href="/customers"
              className="inline-flex text-sm text-slate-500 hover:text-slate-900"
            >
              ← Back to Customers
            </Link>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Customer Workspace</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                {customerDisplayName(customer)}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Keep customer details, quick actions, and next steps in one place.
              </p>
            </div>

            <div className="space-y-1.5 text-sm text-slate-600">
              <div>
                <span className="font-medium text-slate-800">Primary contact:</span>{" "}
                {customer.phone ? formatPhone(customer.phone) : "No phone on file"}
                {customer.email ? ` | ${customer.email}` : ""}
              </div>
              <div>
                <span className="font-medium text-slate-800">Primary service location:</span>{" "}
                {serviceAddressFallback
                  ? `${serviceAddressFallback.label}: ${serviceAddressFallback.address}`
                  : "No service address on file"}
              </div>
              <div>
                <span className="font-medium text-slate-800">Billing relationship:</span>{" "}
                {hasSavedBillingContact ? "Saved billing contact on this account" : "Defaults to responsible account contact"}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-white/70 p-2 text-xs text-slate-600">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {locations.length} location{locations.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {activeJobs.length} open job{activeJobs.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {displayableRoleContactCount} contact{displayableRoleContactCount === 1 ? "" : "s"}
              </span>
              {maintenanceAgreementsEnabled ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  {activeServicePlanCount} active service plan{activeServicePlanCount === 1 ? "" : "s"}
                </span>
              ) : null}
              {canViewPaymentHistory ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  {failedPaymentAttentionCount} payment attention
                </span>
              ) : null}
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                Last scheduled:{" "}
                {formatDate(lastScheduledActiveDate)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 rounded-xl border border-slate-200 bg-white/85 p-3 md:items-end">
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Quick Actions</div>
              <div className="flex flex-wrap gap-2">
                {callHref ? (
                  <a
                    href={callHref}
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                  >
                    Call
                  </a>
                ) : null}
                {customer.email ? (
                  <a
                    href={`mailto:${customer.email}`}
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                  >
                    Email
                  </a>
                ) : null}
                {isInternalViewer ? (
                  <>
                <Link
                  href={`/customers/${customerId}/edit`}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Edit Customer
                </Link>

                {estimatesEnabled && (
                  <Link
                    href={`/estimates/new?customer_id=${customerId}`}
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                  >
                    Create Estimate
                  </Link>
                )}

                <Link
                  href={`/jobs/new?customer_id=${customerId}&source=customer`}
                  className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Create Job
                </Link>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <nav
          aria-label="Customer workspace tabs"
          className="rounded-2xl border border-slate-300 bg-slate-100/95 p-3 shadow-sm ring-1 ring-slate-200 md:p-4"
        >
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
            Workspace Navigation
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            {workspaceNavigationItems.map((item) => (
              <Link
                key={item.id}
                href={`${customerPath}?tab=${item.id}`}
                className={[
                  "inline-flex shrink-0 items-center rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
                  activeWorkspaceTab === item.id
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm ring-1 ring-slate-900/30"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-50",
                ].join(" ")}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="space-y-6 md:space-y-7">

        {activeWorkspaceTab === "overview" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Attention Snapshot</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-medium text-slate-900">Money</div>
              <div className="mt-1">
                {canViewPaymentHistory
                  ? `${failedPaymentAttentionCount} payment attention item${failedPaymentAttentionCount === 1 ? "" : "s"}`
                  : "Payment history access is limited for this viewer."}
              </div>
              <Link
                href={`${customerPath}?tab=money`}
                className="mt-2 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100"
              >
                Open Money
              </Link>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-medium text-slate-900">Service Plans</div>
              <div className="mt-1">
                {maintenanceAgreementsEnabled
                  ? `${activeServicePlanCount} active service plan${activeServicePlanCount === 1 ? "" : "s"}`
                  : "Service plans are hidden in this environment or viewer scope."}
              </div>
              <Link
                href={`${customerPath}?tab=service-plans`}
                className="mt-2 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100"
              >
                Open Service Plans
              </Link>
            </div>
          </div>
        </section>
        ) : null}

        {/* Open status summary */}
        {activeWorkspaceTab === "overview" ? (
        <section className="rounded-xl border border-slate-200/80 bg-white/80 p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Open Jobs Summary
            </h2>
          </div>

          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            {summaryOrder().map((key) => (
              <div
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/80 px-2.5 py-2"
              >
                <div className="text-lg font-semibold leading-none tracking-tight text-slate-900">
                  {opsCounts[key] ?? 0}
                </div>
                <div className="whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.08em] text-slate-500">
                  {opsStatusLabel(key)}
                </div>
              </div>
            ))}
          </div>
        </section>
        ) : null}

        {activeWorkspaceTab === "money" ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Money Overview</h2>
              <p className="mt-1 text-xs text-slate-600">
                Customer-level payment status and where to go for invoice actions.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Payment Attention</div>
                <div className="mt-1 text-base font-semibold text-slate-900">
                  {canViewPaymentHistory
                    ? `${failedPaymentAttentionCount} failed payment${failedPaymentAttentionCount === 1 ? "" : "s"}`
                    : "Limited"}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {canViewPaymentHistory
                    ? failedPaymentAttentionCount > 0
                      ? "Payment failed - not collected. Review invoice before retrying."
                      : "No failed payments in recent customer history."
                    : "Payment history access is limited for this viewer."}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Recent Payments</div>
                <div className="mt-1 text-base font-semibold text-slate-900">
                  {canViewPaymentHistory
                    ? `${collectedPaymentCount} collected`
                    : "Limited"}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {canViewPaymentHistory
                    ? mostRecentPayment
                      ? `Latest: ${mostRecentPayment.paidAtDisplay} - ${mostRecentPayment.amountDisplay}`
                      : "No recent payment activity yet."
                    : "Recent payment details are limited for this viewer."}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Saved Card</div>
                <div className="mt-1 text-base font-semibold text-slate-900">
                  {canManageSavedPaymentMethodSetup
                    ? hasSavedCardOnFile
                      ? "On file"
                      : "Not on file"
                    : "Limited"}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {canManageSavedPaymentMethodSetup
                    ? primarySavedCard
                      ? formatSavedCardLabel(primarySavedCard)
                      : "No saved card is on file for this customer yet."
                    : "Saved card status is limited for this viewer."}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Invoice Workspace</div>
                <div className="mt-1 text-base font-semibold text-slate-900">Manage Invoice & Payment</div>
                <p className="mt-1 text-xs text-slate-600">
                  Invoice-specific actions happen in the invoice workspace.
                </p>
                {mostRecentInvoiceWorkspaceHref ? (
                  <Link
                    href={mostRecentInvoiceWorkspaceHref}
                    className="mt-2 inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100"
                  >
                    Open invoice workspace
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* Payment History (if authorized) */}
        {activeWorkspaceTab === "money" && canViewPaymentHistory && (
          <PaymentHistoryCard
            payments={customerPaymentHistory}
            customerId={customerId}
            customerName={customerDisplayName(customer)}
          />
        )}

        {activeWorkspaceTab === "money" && canManageSavedPaymentMethodSetup && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-slate-900">Payment Method</h2>
                <p className="text-xs font-medium text-slate-700">Saved Card Setup</p>
                <p className="text-xs text-slate-600">
                  Card details are entered in Stripe-hosted checkout. Compliance Matters does not store full card number or CVC.
                </p>
                <p className="text-xs text-slate-600">
                  Saving a card does not enable autopay. autopay consent is managed separately in a later phase.
                </p>
              </div>

              <form action={startSavedPaymentMethodSetupAction} className="shrink-0">
                <input type="hidden" name="customer_id" value={customerId} />
                <input type="hidden" name="return_path" value={customerPath} />
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Set up saved card
                </button>
              </form>
            </div>

            <div className="mt-3">
              {customerSavedPaymentMethods.length > 0 ? (
                <ul className="space-y-2">
                  {customerSavedPaymentMethods.map((methodRow) => (
                    <li key={methodRow.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-sm text-slate-800">
                        {formatSavedCardLabel(methodRow)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        {methodRow.is_default ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">Default</span>
                        ) : null}
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                          {String(methodRow.payment_method_status || "unknown").replace(/_/g, " ")}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  No saved card is on file for this customer yet.
                </div>
              )}
            </div>
          </section>
        )}

        {activeWorkspaceTab === "money" && !canManageSavedPaymentMethodSetup ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            Saved card setup and status are limited for this viewer.
          </section>
        ) : null}

        {/* Overview + Settings */}
        {(activeWorkspaceTab === "overview" || activeWorkspaceTab === "settings") ? (
        <section className="grid gap-6 xl:grid-cols-[1.25fr_.9fr]">
          {activeWorkspaceTab === "overview" ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Account Summary
              </h2>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              Customer records represent the responsible account. Site/access contacts may differ by location or job.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Responsible Account
                </div>
                <div className="text-sm font-semibold text-slate-900">{customerDisplayName(customer)}</div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Account Contact
                </div>
                <div className="text-sm text-slate-900">{customerDisplayName(customer)}</div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Account Phone
                </div>
                <div className="text-sm text-slate-900">
                  {customer.phone ? formatPhone(customer.phone) : "—"}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Account Email
                </div>
                <div className="text-sm text-slate-900 break-all">
                  {customer.email ?? "—"}
                </div>
              </div>

              <div className="space-y-1 md:col-span-2">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Billing Address
                </div>
                {resolvedBillingAddress.address ? (
                  <div className="space-y-1">
                    <div className="text-sm text-slate-900">{resolvedBillingAddress.address}</div>
                    {resolvedBillingAddress.source === "service_fallback" ? (
                      <div className="text-xs text-slate-500">
                        Same as service address{resolvedBillingAddress.label ? ` (${resolvedBillingAddress.label})` : ""}.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="text-sm font-medium text-slate-700">No billing or service address on file</div>
                    <div className="text-sm text-slate-500">Add a service location or a different billing address to set billing destination details.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
          ) : null}

          {activeWorkspaceTab === "settings" ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Billing / Paperwork Defaults</h2>

            <p className="mt-2 text-sm text-slate-600">
              Invoices and paperwork default to the responsible account unless a job or invoice has its own billing recipient.
            </p>

            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <div>
                <span className="font-semibold text-slate-900">Responsible Account:</span> {customerDisplayName(customer)}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Billing / Paperwork Contact:</span>{" "}
                {hasSavedBillingContact ? (
                  <>
                    <span>Saved billing contact</span>
                    {savedBillingContactName ? <span> - {savedBillingContactName}</span> : null}
                    {savedBillingContactEmail ? <span> - {savedBillingContactEmail}</span> : null}
                    {savedBillingContactPhone ? <span> - {savedBillingContactPhone}</span> : null}
                  </>
                ) : (
                  <span>Defaults to responsible account contact details</span>
                )}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Billing Address:</span>{" "}
                {resolvedBillingAddress.address ? (
                  <>
                    {resolvedBillingAddress.address}
                    {resolvedBillingAddress.source === "service_fallback" ? " (same as service address)" : ""}
                  </>
                ) : (
                  "No billing or service address saved yet"
                )}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Billing Email:</span> {customer.email ?? "Defaults to account email when available"}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Billing Phone:</span> {customer.phone ? formatPhone(customer.phone) : "Defaults to account phone when available"}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {callHref ? (
                <a
                  href={callHref}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Call Account Phone
                </a>
              ) : null}

              {smsHref ? (
                <a
                  href={smsHref}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Text Account Phone
                </a>
              ) : null}

              {customer.email ? (
                <a
                  href={`mailto:${customer.email}`}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Email Account Contact
                </a>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Calls and emails here use the account/customer contact and may not be the person on site for every job.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Total Jobs
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {jobs.length}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Active Work (Incl. Closeout)
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {activeWorkCount}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Completed / Closed
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {completedJobsCount}
                </div>
              </div>
            </div>
          </div>
          ) : null}
        </section>
        ) : null}

        {activeWorkspaceTab === "locations-contacts" && isInternalViewer ? (
          <section id="contact-overview" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Contact Overview</h2>
              <p className="mt-1 text-sm text-slate-500">
                Quickly confirm who to call for scheduling, billing paperwork, and site access.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Primary service location</div>
                <div className="mt-1 text-sm font-medium text-slate-900">
                  {serviceAddressFallback?.address || "No service location address saved yet."}
                </div>
                {serviceAddressFallback?.label ? (
                  <div className="mt-1 text-xs text-slate-600">Source: {serviceAddressFallback.label}</div>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Main contact</div>
                <div className="mt-1 text-sm font-medium text-slate-900">
                  {String(primaryAccountContact?.display_name ?? "").trim() || "No main account contact saved."}
                </div>
                {String(primaryAccountContact?.phone_e164 ?? "").trim() ? (
                  <div className="mt-0.5 text-xs text-slate-600">Phone: {formatPhone(primaryAccountContact?.phone_e164)}</div>
                ) : null}
                {String(primaryAccountContact?.email ?? "").trim() ? (
                  <div className="mt-0.5 break-all text-xs text-slate-600">Email: {String(primaryAccountContact?.email ?? "").trim()}</div>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Billing / paperwork</div>
                <div className="mt-1 text-sm font-medium text-slate-900">
                  {savedBillingContactName || "No separate billing contact saved."}
                </div>
                {savedBillingContactPhone ? (
                  <div className="mt-0.5 text-xs text-slate-600">Phone: {formatPhone(savedBillingContactPhone)}</div>
                ) : null}
                {savedBillingContactEmail ? (
                  <div className="mt-0.5 break-all text-xs text-slate-600">Email: {savedBillingContactEmail}</div>
                ) : (
                  <div className="mt-0.5 text-xs text-slate-600">
                    Invoices and paperwork default to the responsible account unless overridden on a job or invoice.
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Site access contact</div>
                <div className="mt-1 text-sm font-medium text-slate-900">
                  {String(siteAccessContact?.display_name ?? "").trim() || "No site access contact saved."}
                </div>
                {String(siteAccessContact?.phone_e164 ?? "").trim() ? (
                  <div className="mt-0.5 text-xs text-slate-600">Phone: {formatPhone(siteAccessContact?.phone_e164)}</div>
                ) : null}
                {String(siteAccessContact?.email ?? "").trim() ? (
                  <div className="mt-0.5 break-all text-xs text-slate-600">Email: {String(siteAccessContact?.email ?? "").trim()}</div>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Directory totals</div>
                <div className="mt-1 text-sm font-medium text-slate-900">
                  {totalContactCount} contact{totalContactCount === 1 ? "" : "s"} on file
                </div>
                <div className="mt-0.5 text-xs text-slate-600">
                  {locations.length} managed location{locations.length === 1 ? "" : "s"}
                </div>
                <div className="mt-0.5 text-xs text-slate-600">
                  {locations.length > 1 ? "Multiple managed locations are active for this customer." : "Single managed location on file."}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Actions available</div>
                <div className="mt-1 text-sm text-slate-700">Add account contacts, add site access contacts, and open each location record.</div>
              </div>
            </div>
          </section>
        ) : null}

        {activeWorkspaceTab === "locations-contacts" && isInternalViewer ? (
          <section id="role-contacts" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Account Contacts</h2>
              <p className="mt-1 text-sm text-slate-500">
                Directory of people tied to this customer account for scheduling, billing, and access needs.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">Main contact</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">Billing / paperwork</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">Site access</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">Other</span>
              </div>
              <p className="mt-2 text-xs text-slate-600">Add contacts for billing, scheduling, and site access.</p>
            </div>
            {hasDisplayableRoleContacts ? (
              <RoleContactsCard
                title="Customer / Account Role Contacts"
                recipients={customerRoleContacts}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No account contacts saved yet. Add who handles scheduling, billing, or access.
              </div>
            )}

            <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">Add account contact</summary>
              <form action={addCustomerRoleContactFromForm} className="mt-3 grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="customer_id" value={customerId} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
                  <select
                    name="recipient_role"
                    defaultValue="responsible_party"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="responsible_party">Responsible Party</option>
                    <option value="billing_contact">Billing / Paperwork Contact</option>
                    <option value="site_access_contact">Site / Access Contact</option>
                    <option value="tenant_or_occupant">Tenant / Occupant</option>
                    <option value="third_party_oversight">Third-Party Oversight</option>
                    <option value="homeowner">Homeowner</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
                  <input
                    name="display_name"
                    required
                    maxLength={120}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
                  <input
                    name="phone"
                    placeholder="(209) 555-1234"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                  <input
                    name="email"
                    type="email"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
                  <textarea
                    name="notes"
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                  >
                    Save account contact
                  </button>
                </div>
              </form>
            </details>
          </section>
        ) : null}

        {activeWorkspaceTab === "history" && isInternalViewer ? (
          <section id="customer-notes" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Customer Notes</h2>
              <p className="mt-1 text-sm text-slate-500">
                Internal notes and context for this customer.
              </p>
            </div>
            <form action={updateCustomerNotesFromForm} className="space-y-3">
              <input type="hidden" name="customer_id" value={customerId} />
              <textarea
                name="notes"
                defaultValue={customer.notes ?? ""}
                rows={6}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                placeholder="Add customer notes..."
              />
              <div>
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Save
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {activeWorkspaceTab === "history" && !isInternalViewer ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            Customer notes are not available for this viewer.
          </section>
        ) : null}

        {/* Locations */}
        {activeWorkspaceTab === "locations-contacts" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Managed Locations</h2>
              <p className="text-sm text-slate-500">
                Service addresses managed under this customer.
              </p>
            </div>
          </div>

          {locations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Add locations when this customer has more than one service address.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {locations.map((loc) => {
                const locId = String(loc.id ?? loc.location_id ?? "");
                const address = locationAddressLine(loc);
                const cityStateZip = locationCityStateZipLine(loc);
                const mapsHref = makeMapsHref(address);
                const locationContacts = locationRoleContactsByLocationId[locId] ?? [];
                const isPrimaryServiceLocation = Boolean(primaryServiceLocationId && locId === primaryServiceLocationId);

                return (
                  <div
                    key={locId}
                    id={`location-contacts-${locId}`}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  >
                    <div className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {address || "No address on file"}
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            {cityStateZip || "City/state/zip unavailable"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {locationDisplayName(loc)}
                          </div>
                          {isInternalViewer && String(loc.notes ?? "").trim() ? (
                            <div className="mt-1 text-xs text-slate-500">
                              Access notes: {String(loc.notes ?? "").trim()}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          {isPrimaryServiceLocation ? (
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                              Primary service location
                            </span>
                          ) : null}
                          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                            {jobsByLocationCount.get(locId) ?? 0} active job
                            {(jobsByLocationCount.get(locId) ?? 0) === 1 ? "" : "s"}
                          </div>
                        </div>
                      </div>

                      {isInternalViewer ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                            Linked location contacts
                          </div>
                          {locationContacts.length > 0 ? (
                            <div className="mt-2 space-y-2 text-xs text-slate-700">
                              {locationContacts.map((contact) => {
                                const label =
                                  formatRoleForInternalDisplay(contact.recipient_role) ?? "Contact";
                                const contactName = String(contact.display_name ?? "").trim();
                                const contactPhone = String(contact.phone_e164 ?? "").trim();
                                const contactEmail = String(contact.email ?? "").trim();

                                return (
                                  <div key={contact.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                    <div className="font-semibold text-slate-800">{label}</div>
                                    <div className="mt-0.5 text-slate-700">{contactName || "Contact name unavailable"}</div>
                                    {contactPhone ? <div className="mt-0.5 text-slate-600">Phone: {formatPhone(contactPhone)}</div> : null}
                                    {contactEmail ? <div className="mt-0.5 break-all text-slate-600">Email: {contactEmail}</div> : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-600">No linked location contacts saved yet.</div>
                          )}

                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                              Add site/access contact
                            </summary>
                            <form action={addLocationRoleContactFromForm} className="mt-2 grid gap-2 sm:grid-cols-2">
                              <input type="hidden" name="customer_id" value={customerId} />
                              <input type="hidden" name="location_id" value={locId} />
                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
                                <select
                                  name="recipient_role"
                                  defaultValue="site_access_contact"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                                >
                                  <option value="site_access_contact">Site / Access Contact</option>
                                  <option value="tenant_or_occupant">Tenant / Occupant</option>
                                  <option value="responsible_party">Responsible Party</option>
                                </select>
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
                                <input
                                  name="display_name"
                                  required
                                  maxLength={120}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
                                <input
                                  name="phone"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                                <input
                                  name="email"
                                  type="email"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
                                <textarea
                                  name="notes"
                                  rows={2}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <button
                                  type="submit"
                                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                                >
                                  Save site/access contact
                                </button>
                              </div>
                            </form>
                          </details>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        {mapsHref ? (
                          <a
                            href={mapsHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                          >
                            Open in Maps
                          </a>
                        ) : null}

                        {locId && isInternalViewer ? (
                          <Link
                            href={`/locations/${locId}`}
                            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                          >
                            Edit Service Address
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        ) : null}

        {/* Job history */}
        {activeWorkspaceTab === "work" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Recent / Active Work</h2>
              <p className="text-sm text-slate-500">
                {isInternalViewer
                  ? "All jobs for this customer across every location."
                  : "Jobs for this customer within your contractor scope."}
              </p>
            </div>
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              No jobs found for this customer yet.
            </div>
          ) : (
            <div className="space-y-6">
              {sortedCaseIds.map((caseId) => {
                const serviceCase = serviceCasesById.get(caseId);
                const caseJobs = caseGroups.get(caseId) ?? [];
                const caseStatusNorm = String(serviceCase?.status ?? "").toLowerCase();
                const isCaseResolved = caseStatusNorm === "resolved";

                return (
                  <div
                    key={caseId}
                    className="space-y-3 rounded-2xl border border-slate-300 bg-white p-3 shadow-sm sm:p-4"
                  >
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Service Case</span>
                          <span className="font-mono text-xs text-slate-500">{String(caseId).slice(0, 8)}</span>
                          <span
                            className={[
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              isCaseResolved
                                ? "border border-slate-200 bg-slate-100 text-slate-700"
                                : "border border-emerald-200 bg-emerald-50 text-emerald-700",
                            ].join(" ")}
                          >
                            {isCaseResolved ? "Resolved" : "Open"}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
                            {caseJobs.length} visit{caseJobs.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 border-l-2 border-slate-200 pl-3 sm:ml-4 sm:pl-5">
                      {caseJobs.map((job) => {
                        const isArchived = Boolean(job.deleted_at);
                        const isCancelled = normalizeLifecycleStatus(job.status) === "cancelled";
                        const address = [job.job_address, job.city]
                          .map((v) => String(v ?? "").trim())
                          .filter(Boolean)
                          .join(", ");
                        const jobReference = formatJobDisplayReference({
                          jobDisplayNumber: null,
                          jobId: job.id,
                        });

                        return (
                          <div
                            key={job.id}
                            className={[
                              "rounded-xl border p-4",
                              isArchived || isCancelled
                                ? "border-slate-200 bg-slate-100/70"
                                : "border-slate-200 bg-slate-50",
                            ].join(" ")}
                          >
                            <div className="flex flex-col gap-2.5 xl:flex-row xl:items-start xl:justify-between">
                              <div className="min-w-0 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                                  <span className="font-medium text-slate-800">{formatDate(job.scheduled_date)}</span>
                                  <span className="text-slate-300">&middot;</span>
                                  <span className="font-medium text-slate-800">{jobReference}</span>
                                  <span className="text-slate-300">&middot;</span>
                                  <span
                                    className={[
                                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                                      opsBadgeClass(job.ops_status),
                                    ].join(" ")}
                                  >
                                    {opsStatusLabel(job.ops_status)}
                                  </span>
                                  {isCancelled && !isArchived ? (
                                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                                      Cancelled
                                    </span>
                                  ) : null}
                                  {isArchived ? (
                                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                                      Archived
                                    </span>
                                  ) : null}
                                </div>

                                <div className="text-sm font-semibold text-slate-900">
                                  {normalizeRetestLinkedJobTitle(job.title) || jobReference}
                                </div>
                                <div className="text-sm text-slate-600">
                                  {address || "Location unavailable"}
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2 xl:pt-0.5">
                                <Link
                                  href={isInternalViewer ? `/jobs/${job.id}` : `/portal/jobs/${job.id}`}
                                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                                >
                                  Open Job
                                </Link>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {ungroupedJobs.length > 0 ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-slate-50 p-4">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-900">Other Visits</div>
                      <div className="text-sm text-slate-500">Jobs not connected to a service case yet.</div>
                    </div>
                  </div>

                  <div className="space-y-2 pl-2">
                    {ungroupedJobs.map((job) => {
                      const isArchived = Boolean(job.deleted_at);
                      const isCancelled = normalizeLifecycleStatus(job.status) === "cancelled";
                      const address = [job.job_address, job.city]
                        .map((v) => String(v ?? "").trim())
                        .filter(Boolean)
                        .join(", ");
                      const jobReference = formatJobDisplayReference({
                        jobDisplayNumber: null,
                        jobId: job.id,
                      });

                      return (
                        <div
                          key={job.id}
                          className={[
                            "rounded-xl border p-4",
                            isArchived || isCancelled
                              ? "border-slate-200 bg-slate-100/70"
                              : "border-slate-200 bg-slate-50",
                          ].join(" ")}
                        >
                          <div className="flex flex-col gap-2.5 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                                <span className="font-medium text-slate-800">{formatDate(job.scheduled_date)}</span>
                                <span className="text-slate-300">&middot;</span>
                                <span className="font-medium text-slate-800">{jobReference}</span>
                                <span className="text-slate-300">&middot;</span>
                                <span
                                  className={[
                                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                                    opsBadgeClass(job.ops_status),
                                  ].join(" ")}
                                >
                                  {opsStatusLabel(job.ops_status)}
                                </span>
                                {isCancelled && !isArchived ? (
                                  <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                                    Cancelled
                                  </span>
                                ) : null}
                                {isArchived ? (
                                  <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                                    Archived
                                  </span>
                                ) : null}
                              </div>

                              <div className="text-sm font-semibold text-slate-900">
                                {normalizeRetestLinkedJobTitle(job.title) || jobReference}
                              </div>
                              <div className="text-sm text-slate-600">
                                {address || "Location unavailable"}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 xl:pt-0.5">
                              <Link
                                href={isInternalViewer ? `/jobs/${job.id}` : `/portal/jobs/${job.id}`}
                                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                              >
                                Open Job
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
        ) : null}

        {/* Estimates — internal only, visible when ENABLE_ESTIMATES is on */}
        {activeWorkspaceTab === "work" && isInternalViewer && estimatesEnabled ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Estimates</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Draft and sent estimates for this customer.
              </p>
            </div>

            {customerEstimates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="text-sm text-slate-500">No estimates yet.</p>
                <Link
                  href={`/estimates/new?customer_id=${customerId}`}
                  className="mt-3 inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Create First Estimate
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {customerEstimates.map((est) => (
                  <div
                    key={est.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-sm font-medium text-slate-900 truncate">{est.title}</div>
                      <div className="text-xs text-slate-500">
                        {est.estimate_number} &middot;{" "}
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            est.status === "draft" ? "bg-slate-100 text-slate-700" :
                            est.status === "sent" ? "bg-blue-100 text-blue-700" :
                            est.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                            est.status === "declined" ? "bg-red-100 text-red-700" :
                            "bg-slate-100 text-slate-700",
                          ].join(" ")}
                        >
                          {est.status.charAt(0).toUpperCase() + est.status.slice(1)}
                        </span>
                        {" "}&middot; Created {formatDate(est.created_at)}
                      </div>
                    </div>
                    <Link
                      href={`/estimates/${est.id}`}
                      className="shrink-0 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
                    >
                      View
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {/* Maintenance Agreements — internal only, visible when ENABLE_MAINTENANCE_AGREEMENTS is on */}
        {activeWorkspaceTab === "service-plans" && isInternalViewer && maintenanceAgreementsEnabled ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Maintenance Agreements</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Active and upcoming maintenance agreements for this customer.
              </p>
            </div>

            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Service Plan Overview</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Plan status and billing-period health at a glance.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Active Plans</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{activeServicePlanCount}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Next Due</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{nextServicePlanDueDate ? formatDate(nextServicePlanDueDate) : "Not scheduled"}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Billing Attention</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{billingPeriodsNeedingAttentionCount}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {linkedBillingPeriodCount} linked • {paidBillingPeriodCount} paid
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Scheduling</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{overdueServicePlanCount} overdue</div>
                  <div className="mt-1 text-xs text-slate-600">{notScheduledServicePlanCount} not scheduled</div>
                </div>
              </div>
            </div>

            <details className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-900">
                Add Maintenance Agreement
              </summary>
              <form method="get" action={customerPath} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <input type="hidden" name="tab" value="service-plans" />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Start from template</label>
                  <select
                    name="maTemplate"
                    defaultValue={selectedAgreementTemplate?.id ?? ""}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="">No template (manual)</option>
                    {agreementTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.template_name} ({String(template.agreement_type).replace(/_/g, " ")} • {String(template.frequency).replace(/_/g, " ")})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                >
                  Load Template
                </button>
              </form>
              {selectedAgreementTemplate ? (
                <p className="mt-2 text-xs text-slate-600">
                  Template packages standardize agreement details. Using template: {selectedAgreementTemplate.template_name}.
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Manual mode stays available. Selecting a template only prefills fields and does not create records until you save.
                </p>
              )}
              <form action={createAgreementAction} className="mt-4 grid gap-3 md:grid-cols-2">
                <input type="hidden" name="customer_id" value={customerId} />
                <input type="hidden" name="source_template_id" value={selectedAgreementTemplate?.id ?? ""} />

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700">Agreement Name</label>
                  <input
                    name="agreement_name"
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Agreement Type</label>
                  <select
                    name="agreement_type"
                    defaultValue={createAgreementTypeDefault}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {MAINTENANCE_AGREEMENT_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {value.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Frequency</label>
                  <select
                    name="frequency"
                    defaultValue={createAgreementFrequencyDefault}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {MAINTENANCE_AGREEMENT_FREQUENCIES.map((value) => (
                      <option key={value} value={value}>
                        {value.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Next Due Date</label>
                  <input
                    type="date"
                    name="next_due_date"
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Start Date</label>
                  <input
                    type="date"
                    name="start_date"
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Renewal Date (Optional)</label>
                  <input
                    type="date"
                    name="renewal_date"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Primary Location (Optional)</label>
                  <select
                    name="primary_location_id"
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="">No primary location</option>
                    {locations.map((loc) => {
                      const locId = String(loc.id ?? loc.location_id ?? "").trim();
                      if (!locId) return null;
                      return (
                        <option key={locId} value={locId}>
                          {locationDisplayName(loc)}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700">Default Visit Scope / Work Items (Optional)</label>
                  <VisitScopeBuilder
                    jobType="service"
                    summaryName="default_visit_scope_summary"
                    itemsName="default_visit_scope_items_json"
                    initialSummary={createAgreementVisitScopeSummaryDefault}
                    initialItems={createAgreementVisitScopeItemsDefault}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700">Internal Notes (Optional)</label>
                  <textarea
                    name="internal_notes"
                    rows={3}
                    defaultValue={createAgreementInternalNotesDefault}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Save Maintenance Agreement
                  </button>
                </div>
              </form>
            </details>

            {customerAgreements.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="text-sm text-slate-500">No maintenance agreements yet.</p>
                <p className="mt-1 text-xs text-slate-400">Use Add Maintenance Agreement to create one for this customer.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {customerAgreements.map((agr) => {
                  const normalizedAgreementType = String(agr.agreement_type).replace(/_/g, " ");
                  const normalizedFrequency = String(agr.frequency).replace(/_/g, " ");
                  const hasTemplateLockSnapshot = hasAgreementTemplateLockSnapshot(agr);
                  const templateSnapshot =
                    agr.source_template_snapshot && typeof agr.source_template_snapshot === "object" && !Array.isArray(agr.source_template_snapshot)
                      ? (agr.source_template_snapshot as Record<string, unknown>)
                      : null;
                  const templateSnapshotAgreementType = readTemplateSnapshotString(templateSnapshot, "agreement_type");
                  const templateSnapshotFrequency = readTemplateSnapshotString(templateSnapshot, "frequency");
                  const templateSnapshotVisitScopeSummary = readTemplateSnapshotString(
                    templateSnapshot,
                    "default_visit_scope_summary",
                  );
                  const templateSnapshotInternalNotes = readTemplateSnapshotString(
                    templateSnapshot,
                    "internal_notes_default",
                  );
                  const templateSnapshotItemsCount = readTemplateSnapshotItemsCount(templateSnapshot);
                  const visitLinkSummary = agreementVisitSummaryById.get(agr.id);
                  const defaultPlanItems = sanitizeAgreementDefaultVisitScopeItems(
                    agr.default_visit_scope_items,
                  );
                  const primaryLocationMatch = locations.find((loc) => {
                    const locId = String(loc.id ?? loc.location_id ?? "").trim();
                    return locId && locId === String(agr.primary_location_id ?? "").trim();
                  });
                  let primaryLocationLabel: string | null = null;
                  if (primaryLocationMatch) {
                    const label = locationDisplayName(primaryLocationMatch);
                    const address = locationAddressLine(primaryLocationMatch);
                    if (address && label && label !== "Location") {
                      primaryLocationLabel = `${label} (${address})`;
                    } else if (address) {
                      primaryLocationLabel = address;
                    } else if (label && label !== "Location") {
                      primaryLocationLabel = label;
                    }
                  }

                  const dueState = classifyMaintenanceAgreementDueState({
                    status: agr.status,
                    nextDueDate: agr.next_due_date,
                  });
                  const dueStateBadge = {
                    overdue: "border-red-200 bg-red-50 text-red-700",
                    due_today: "border-amber-200 bg-amber-50 text-amber-700",
                    upcoming: "border-blue-200 bg-blue-50 text-blue-700",
                    not_scheduled: "border-slate-200 bg-slate-100 text-slate-600",
                    inactive: "border-slate-200 bg-slate-100 text-slate-500",
                  } as const;
                  const dueStateLabel = {
                    overdue: "Overdue",
                    due_today: "Due Today",
                    upcoming: "Upcoming",
                    not_scheduled: "Not Scheduled",
                    inactive: "Inactive",
                  } as const;
                  const statusBadge = agr.status === "active"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-100 text-slate-600";
                  const agreementBillingPeriods = billingPeriodsByAgreementId.get(agr.id) ?? [];

                  return (
                    <div
                      key={agr.id}
                      id={`maintenance-agreement-${agr.id}`}
                      className={[
                        "rounded-xl border bg-slate-50 px-4 py-3 scroll-mt-24",
                        maintenanceAgreementFocusId === agr.id
                          ? "border-blue-300 ring-2 ring-blue-100"
                          : "border-slate-200",
                      ].join(" ")}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="text-sm font-medium text-slate-900">
                            {agr.agreement_name}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={[
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                statusBadge,
                              ].join(" ")}
                            >
                              {String(agr.status).charAt(0).toUpperCase() + String(agr.status).slice(1)}
                            </span>
                            <span className="text-xs text-slate-500">
                              {normalizedAgreementType}
                            </span>
                            <span className="text-slate-300">&middot;</span>
                            <span className="text-xs text-slate-500">
                              {normalizedFrequency}
                            </span>
                          </div>
                          {primaryLocationLabel ? (
                            <div className="text-xs text-slate-500">
                              Primary location: {primaryLocationLabel}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {agr.next_due_date ? (
                            <span
                              className={[
                                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                                dueStateBadge[dueState],
                              ].join(" ")}
                            >
                              {dueStateLabel[dueState]} &mdash; {formatDate(agr.next_due_date)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                              No due date
                            </span>
                          )}
                          <Link
                            href={`/jobs/new?source=customer&customer_id=${customerId}&maintenance_agreement_id=${agr.id}`}
                            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Create Work Order
                          </Link>
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3.5 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                          Plan Snapshot
                        </div>
                        <dl className="mt-2 grid gap-x-3 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <dt className="font-medium text-slate-500">Plan</dt>
                            <dd className="mt-0.5 text-slate-900">{agr.agreement_name}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-500">Status</dt>
                            <dd className="mt-0.5 text-slate-900">{String(agr.status).replace(/_/g, " ")}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-500">Frequency</dt>
                            <dd className="mt-0.5 text-slate-900">{normalizedFrequency}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-500">Start date</dt>
                            <dd className="mt-0.5 text-slate-900">{formatDate(agr.start_date)}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-500">Next due date</dt>
                            <dd className="mt-0.5 text-slate-900">{formatDate(agr.next_due_date)}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-500">Renewal date</dt>
                            <dd className="mt-0.5 text-slate-900">{agr.renewal_date ? formatDate(agr.renewal_date) : "-"}</dd>
                          </div>
                          <div className="sm:col-span-2 lg:col-span-1">
                            <dt className="font-medium text-slate-500">Primary location</dt>
                            <dd className="mt-0.5 text-slate-900">{primaryLocationLabel || "No primary location"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-500">Visit links</dt>
                            <dd className="mt-0.5 text-slate-900">
                              {visitLinkSummary ? visitLinkSummary.total_links : "-"}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-500">Used visits</dt>
                            <dd className="mt-0.5 text-slate-900">
                              {visitLinkSummary ? visitLinkSummary.used_visits : "-"}
                            </dd>
                          </div>
                        </dl>

                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                            What's Included
                          </div>
                          {defaultPlanItems.length > 0 ? (
                            <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                              {defaultPlanItems.map((item) => (
                                <li key={item.id}>
                                  <div className="font-medium text-slate-900">{item.title}</div>
                                  {item.details ? (
                                    <div className="text-slate-600">
                                      {item.details.length > 120
                                        ? `${item.details.slice(0, 120).trimEnd()}...`
                                        : item.details}
                                    </div>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="mt-2 text-xs text-slate-500">
                              No default Work Items saved for this plan yet.
                            </div>
                          )}
                        </div>

                        {agr.source_template_name_snapshot ? (
                          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
                            <div className="text-xs font-semibold text-blue-900">
                              Started from template: {agr.source_template_name_snapshot}
                            </div>
                            <div className="mt-1 text-xs text-blue-800">
                              Template changes do not automatically update this customer Service Plan.
                            </div>
                            <div className="mt-2 grid gap-x-3 gap-y-1 text-xs text-blue-900 sm:grid-cols-2 lg:grid-cols-3">
                              <div>
                                Template status at creation: {String(agr.source_template_lifecycle_status_snapshot ?? "unknown").replace(/_/g, " ")}
                              </div>
                              <div>
                                Applied at: {agr.source_template_applied_at ? formatDate(agr.source_template_applied_at) : "-"}
                              </div>
                              <div>
                                Template default type/frequency: {templateSnapshotAgreementType ? templateSnapshotAgreementType.replace(/_/g, " ") : "-"} / {templateSnapshotFrequency ? templateSnapshotFrequency.replace(/_/g, " ") : "-"}
                              </div>
                              <div>
                                Template default visit summary: {templateSnapshotVisitScopeSummary || "-"}
                              </div>
                              <div>
                                Template default work items: {templateSnapshotItemsCount}
                              </div>
                              <div>
                                Template default internal notes: {templateSnapshotInternalNotes || "-"}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3.5 py-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                            Billing Periods
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Read status first, then open advanced controls only when needed.
                          </p>
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-medium text-slate-600">Billing period policy notes</summary>
                            <div className="mt-1 space-y-1 text-xs text-slate-500">
                              <div>Billing periods are for billing visibility only and do not control service visits.</div>
                              <div>Work orders, visits, next due date, and visit counting continue independently of billing period status.</div>
                            </div>
                          </details>
                        </div>

                        {canManageBillingPeriods ? (
                          <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                              Add Billing Period
                            </summary>
                            <form action={createBillingPeriodAction} className="mt-3 grid gap-3 md:grid-cols-2">
                              <input type="hidden" name="maintenance_agreement_id" value={agr.id} />

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Coverage Start Date</label>
                                <input
                                  type="date"
                                  name="coverage_start_date"
                                  required
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Coverage End Date</label>
                                <input
                                  type="date"
                                  name="coverage_end_date"
                                  required
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Billing Cadence</label>
                                <select
                                  name="billing_cadence"
                                  defaultValue="monthly"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                >
                                  {BILLING_PERIOD_BILLING_CADENCES.map((value) => (
                                    <option key={value} value={value}>
                                      {value.replace(/_/g, " ")}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Amount Due (cents)</label>
                                <input
                                  name="amount_due_cents"
                                  type="number"
                                  min="0"
                                  step="1"
                                  required
                                  placeholder="25000"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Currency</label>
                                <input
                                  name="currency"
                                  defaultValue="usd"
                                  maxLength={3}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 uppercase"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Billing Posture</label>
                                <select
                                  name="billing_posture"
                                  defaultValue="internal_invoice"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                >
                                  {BILLING_PERIOD_POSTURES.map((value) => (
                                    <option key={value} value={value}>
                                      {billingPeriodPostureLabel(value)}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Billing Period Status</label>
                                <select
                                  name="billing_period_status"
                                  defaultValue="draft"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                >
                                  {BILLING_PERIOD_STATUSES.map((value) => (
                                    <option key={value} value={value}>
                                      {billingPeriodStatusLabel(value)}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Billing Due Date (Optional)</label>
                                <input
                                  type="date"
                                  name="billing_due_date"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">External Reference (Optional)</label>
                                <input
                                  name="external_reference"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-medium text-slate-700">External Notes (Optional)</label>
                                <textarea
                                  name="external_notes"
                                  rows={2}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-medium text-slate-700">Status Reason (Optional)</label>
                                <textarea
                                  name="status_reason"
                                  rows={2}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div className="md:col-span-2 space-y-1 text-xs text-slate-500">
                                <div>Create a billing period record only. This does not generate or link an invoice.</div>
                                <div>Billing periods are for billing visibility only and do not control service visits.</div>
                                <div>Internal invoice: Tracks a period intended for internal invoicing later. No invoice is created here.</div>
                                <div>External off-platform: Use when billing is handled outside Compliance Matters.</div>
                                <div>Manual: Use for internally tracked manual commercial handling without invoice linkage.</div>
                                <div>No charge: Use for zero-dollar coverage.</div>
                                <div>Waived: Use when charges are waived and a reason should be recorded.</div>
                                <div>Not billed through Compliance Matters: Use when coverage is tracked here but billing happens elsewhere.</div>
                              </div>

                              <div className="md:col-span-2">
                                <button
                                  type="submit"
                                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                                >
                                  Add Billing Period
                                </button>
                              </div>
                            </form>
                          </details>
                        ) : null}

                        {agreementBillingPeriods.length > 0 ? (
                          <ul className="mt-3 space-y-2">
                            {agreementBillingPeriods.map((billingPeriod) => {
                              const paymentDisplayStateLabel = formatBillingPeriodPaymentDisplayStateLabel(
                                billingPeriod.payment_display_state,
                              );
                              const paymentDisplayTone =
                                billingPeriod.payment_display_state === "payment_attention"
                                  ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : "border-slate-200 bg-slate-50 text-slate-700";
                              const invoiceSummaryLabel = billingPeriod.invoice_summary
                                ? formatBillingPeriodInvoiceDisplayLabel({
                                  invoiceNumber: billingPeriod.invoice_summary.invoice_number,
                                  invoiceId: billingPeriod.invoice_summary.invoice_id,
                                })
                                : null;
                              const dueDateLabel = billingPeriod.billing_due_date
                                ? formatDate(billingPeriod.billing_due_date)
                                : "No due date";
                              const shortExternalNotes = formatShortNote(billingPeriod.external_notes);
                              const shortStatusReason = formatShortNote(billingPeriod.status_reason);
                              const canGenerateDraftInvoice =
                                canManageBillingPeriods
                                && billingPeriod.billing_period_status !== "cancelled"
                                && !billingPeriod.internal_invoice_id
                                && billingPeriod.billing_posture === "internal_invoice"
                                && Number(billingPeriod.amount_due_cents) > 0;

                              return (
                                <li key={billingPeriod.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-slate-900">
                                        {billingPeriod.coverage_label}
                                      </div>
                                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700">
                                          {billingPeriod.amount_label}
                                        </span>
                                        <span className="text-slate-300">&middot;</span>
                                        <span>{dueDateLabel}</span>
                                      </div>
                                      {billingPeriod.invoice_summary ? (
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                                          <span className="font-medium text-slate-700">{invoiceSummaryLabel}</span>
                                          <span className="text-slate-300">&middot;</span>
                                          <span>{String(billingPeriod.invoice_summary.invoice_status).replace(/_/g, " ")}</span>
                                          <span className="text-slate-300">&middot;</span>
                                          <span>Paid {billingPeriod.invoice_summary.amount_paid_cents != null ? `$${(billingPeriod.invoice_summary.amount_paid_cents / 100).toFixed(2)}` : "$0.00"}</span>
                                          <span className="text-slate-300">&middot;</span>
                                          <span>Balance {billingPeriod.invoice_summary.balance_due_cents != null ? `$${(billingPeriod.invoice_summary.balance_due_cents / 100).toFixed(2)}` : "$0.00"}</span>
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${paymentDisplayTone}`}>
                                        {paymentDisplayStateLabel}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700">
                                      {billingPeriod.posture_label}
                                    </span>
                                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700">
                                      {billingPeriod.lifecycle_label}
                                    </span>
                                    {invoiceSummaryLabel ? (
                                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700">
                                        {invoiceSummaryLabel}
                                      </span>
                                    ) : null}
                                    {billingPeriod.external_reference ? (
                                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700">
                                        External ref {billingPeriod.external_reference}
                                      </span>
                                    ) : null}
                                  </div>

                                  {(shortStatusReason || shortExternalNotes) ? (
                                    <div className="mt-2 space-y-1 text-xs text-slate-500">
                                      {shortStatusReason ? <div>Reason: {shortStatusReason}</div> : null}
                                      {shortExternalNotes ? <div>Notes: {shortExternalNotes}</div> : null}
                                    </div>
                                  ) : null}

                                  {canManageBillingPeriods ? (
                                    <details className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                                        Advanced Billing Period Actions
                                      </summary>
                                      <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                                      {!billingPeriod.internal_invoice_id ? (
                                        <details className="rounded-lg border border-slate-200 bg-white p-3">
                                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                                            Edit Billing Period
                                          </summary>
                                          <form action={updateBillingPeriodAction} className="mt-3 grid gap-3 md:grid-cols-2">
                                            <input type="hidden" name="maintenance_agreement_id" value={agr.id} />
                                            <input type="hidden" name="billing_period_id" value={billingPeriod.id} />

                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-slate-700">Coverage Start Date</label>
                                              <input
                                                type="date"
                                                name="coverage_start_date"
                                                required
                                                defaultValue={billingPeriod.coverage_start_date}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                              />
                                            </div>

                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-slate-700">Coverage End Date</label>
                                              <input
                                                type="date"
                                                name="coverage_end_date"
                                                required
                                                defaultValue={billingPeriod.coverage_end_date}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                              />
                                            </div>

                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-slate-700">Billing Cadence</label>
                                              <select
                                                name="billing_cadence"
                                                defaultValue={billingPeriod.billing_cadence}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                              >
                                                {BILLING_PERIOD_BILLING_CADENCES.map((value) => (
                                                  <option key={value} value={value}>
                                                    {value.replace(/_/g, " ")}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>

                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-slate-700">Amount Due (cents)</label>
                                              <input
                                                name="amount_due_cents"
                                                type="number"
                                                min="0"
                                                step="1"
                                                required
                                                defaultValue={String(billingPeriod.amount_due_cents)}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                              />
                                            </div>

                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-slate-700">Currency</label>
                                              <input
                                                name="currency"
                                                defaultValue={billingPeriod.currency}
                                                maxLength={3}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 uppercase"
                                              />
                                            </div>

                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-slate-700">Billing Posture</label>
                                              <select
                                                name="billing_posture"
                                                defaultValue={billingPeriod.billing_posture}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                              >
                                                {BILLING_PERIOD_POSTURES.map((value) => (
                                                  <option key={value} value={value}>
                                                    {billingPeriodPostureLabel(value)}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>

                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-slate-700">Billing Period Status</label>
                                              <select
                                                name="billing_period_status"
                                                defaultValue={billingPeriod.billing_period_status}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                              >
                                                {BILLING_PERIOD_STATUSES.map((value) => (
                                                  <option key={value} value={value}>
                                                    {billingPeriodStatusLabel(value)}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>

                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-slate-700">Billing Due Date (Optional)</label>
                                              <input
                                                type="date"
                                                name="billing_due_date"
                                                defaultValue={billingPeriod.billing_due_date ?? ""}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                              />
                                            </div>

                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-slate-700">External Reference (Optional)</label>
                                              <input
                                                name="external_reference"
                                                defaultValue={billingPeriod.external_reference ?? ""}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                              />
                                            </div>

                                            <div className="md:col-span-2">
                                              <label className="mb-1 block text-xs font-medium text-slate-700">External Notes (Optional)</label>
                                              <textarea
                                                name="external_notes"
                                                rows={2}
                                                defaultValue={billingPeriod.external_notes ?? ""}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                              />
                                            </div>

                                            <div className="md:col-span-2">
                                              <label className="mb-1 block text-xs font-medium text-slate-700">Status Reason (Optional)</label>
                                              <textarea
                                                name="status_reason"
                                                rows={2}
                                                defaultValue={billingPeriod.status_reason ?? ""}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                              />
                                            </div>

                                            <div className="md:col-span-2">
                                              <button
                                                type="submit"
                                                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                                              >
                                                Save Billing Period
                                              </button>
                                            </div>
                                          </form>
                                        </details>
                                      ) : (
                                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                          Edit is disabled for invoice-linked billing periods.
                                        </div>
                                      )}

                                      <details className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-rose-700">
                                          Cancel Billing Period
                                        </summary>
                                        <form action={cancelBillingPeriodAction} className="mt-3 grid gap-3">
                                          <input type="hidden" name="maintenance_agreement_id" value={agr.id} />
                                          <input type="hidden" name="billing_period_id" value={billingPeriod.id} />

                                          <div>
                                            <label className="mb-1 block text-xs font-medium text-rose-800">Reason</label>
                                            <textarea
                                              name="status_reason"
                                              rows={2}
                                              required
                                              defaultValue={billingPeriod.status_reason ?? ""}
                                              className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900"
                                            />
                                          </div>

                                          <div className="space-y-1 text-xs text-rose-800">
                                            <div>Cancelling preserves billing history and does not affect work orders, visits, or next due date.</div>
                                          </div>

                                          <div>
                                            <button
                                              type="submit"
                                              className="inline-flex items-center rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
                                            >
                                              Cancel Billing Period
                                            </button>
                                          </div>
                                        </form>
                                      </details>

                                      {billingPeriod.billing_period_status !== "cancelled" && !billingPeriod.internal_invoice_id ? (
                                        <details className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-sky-700">
                                            Link Existing Invoice
                                          </summary>
                                          <form action={linkBillingPeriodInvoiceAction} className="mt-3 grid gap-3">
                                            <input type="hidden" name="billing_period_id" value={billingPeriod.id} />
                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-sky-800">Existing Internal Invoice ID</label>
                                              <input
                                                name="internal_invoice_id"
                                                type="text"
                                                required
                                                placeholder="00000000-0000-0000-0000-000000000000"
                                                className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900"
                                              />
                                            </div>
                                            <div className="text-xs text-sky-800">
                                              Linking connects this billing period to an existing invoice for visibility only. It does not generate, issue, send, or collect payment.
                                            </div>
                                            <div>
                                              <button
                                                type="submit"
                                                className="inline-flex items-center rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100"
                                              >
                                                Link Existing Invoice
                                              </button>
                                            </div>
                                          </form>
                                        </details>
                                      ) : null}

                                      {canGenerateDraftInvoice ? (
                                        <details className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-violet-700">
                                            Create Billing Anchor Job Link
                                          </summary>
                                          <form action={linkBillingAnchorJobAction} className="mt-3 grid gap-3">
                                            <input type="hidden" name="billing_period_id" value={billingPeriod.id} />
                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-violet-800">Anchor Job ID</label>
                                              <input
                                                name="anchor_job_id"
                                                type="text"
                                                required
                                                placeholder="00000000-0000-0000-0000-000000000000"
                                                className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900"
                                              />
                                            </div>
                                            <div className="space-y-1 text-xs text-violet-800">
                                              <div>Create billing anchor job link.</div>
                                              <div>Creates a job link for billing-period draft invoice generation only. This does not complete a service visit, create an invoice, send an invoice, or charge a customer.</div>
                                            </div>
                                            <div>
                                              <button
                                                type="submit"
                                                className="inline-flex items-center rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
                                              >
                                                Create billing anchor job
                                              </button>
                                            </div>
                                          </form>
                                        </details>
                                      ) : null}

                                      {canGenerateDraftInvoice ? (
                                        <details className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-indigo-700">
                                            Generate Draft Invoice
                                          </summary>
                                          <form action={generateDraftInvoiceFromBillingPeriodAction} className="mt-3 grid gap-3">
                                            <input type="hidden" name="billing_period_id" value={billingPeriod.id} />
                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-indigo-800">Anchor Job ID</label>
                                              <input
                                                name="anchor_job_id"
                                                type="text"
                                                required
                                                placeholder="00000000-0000-0000-0000-000000000000"
                                                className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-900"
                                              />
                                            </div>
                                            <div className="space-y-1 text-xs text-indigo-800">
                                              <div>Creates a draft invoice only from this billing period.</div>
                                              <div>Does not issue, send, email, collect payment, or create a payment link.</div>
                                              <div>Anchor job must already belong to this maintenance agreement.</div>
                                            </div>
                                            <div>
                                              <button
                                                type="submit"
                                                className="inline-flex items-center rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                                              >
                                                Generate Draft Invoice
                                              </button>
                                            </div>
                                          </form>
                                        </details>
                                      ) : null}

                                      {billingPeriod.internal_invoice_id ? (
                                        <details className="rounded-lg border border-slate-300 bg-white p-3">
                                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-slate-700">
                                            Unlink Invoice
                                          </summary>
                                          <form action={unlinkBillingPeriodInvoiceAction} className="mt-3 grid gap-3">
                                            <input type="hidden" name="billing_period_id" value={billingPeriod.id} />
                                            <div>
                                              <label className="mb-1 block text-xs font-medium text-slate-700">Reason</label>
                                              <textarea
                                                name="status_reason"
                                                rows={2}
                                                required
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                              />
                                            </div>
                                            <div className="text-xs text-slate-600">
                                              Unlinking preserves invoice and payment history. It only removes this billing-period relationship.
                                            </div>
                                            <div>
                                              <button
                                                type="submit"
                                                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                                              >
                                                Unlink Invoice
                                              </button>
                                            </div>
                                          </form>
                                        </details>
                                      ) : null}
                                      </div>
                                    </details>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                            No billing periods have been created for this service plan yet.
                          </div>
                        )}

                        {canManageBillingPeriods ? null : (
                          <div className="mt-3 text-xs text-slate-500">
                            Billing-period mutation controls are hidden for this viewer.
                          </div>
                        )}
                      </div>

                      <details className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                          Edit Details
                        </summary>
                        <form action={updateAgreementAction} className="mt-3 grid gap-3 md:grid-cols-2">
                          <input type="hidden" name="agreement_id" value={agr.id} />
                          <input type="hidden" name="customer_id" value={customerId} />

                          {hasTemplateLockSnapshot ? (
                            <>
                              <div className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-900">
                                  Locked by template package
                                </div>
                                <p className="mt-1 text-xs text-amber-800">
                                  Duplicate the template to customize package details.
                                </p>
                                <p className="mt-1 text-xs text-amber-800">
                                  Customer-specific details can still be edited.
                                </p>

                                <div className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2.5">
                                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                                    Template package details - locked
                                  </div>
                                  <dl className="mt-2 grid gap-x-3 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                                    <div>
                                      <dt className="font-medium text-slate-500">Agreement Name</dt>
                                      <dd className="mt-0.5 text-slate-900">{agr.agreement_name}</dd>
                                    </div>
                                    <div>
                                      <dt className="font-medium text-slate-500">Agreement Type</dt>
                                      <dd className="mt-0.5 text-slate-900">{normalizedAgreementType}</dd>
                                    </div>
                                    <div>
                                      <dt className="font-medium text-slate-500">Frequency</dt>
                                      <dd className="mt-0.5 text-slate-900">{normalizedFrequency}</dd>
                                    </div>
                                    <div className="sm:col-span-2 lg:col-span-3">
                                      <dt className="font-medium text-slate-500">Default Visit Scope Summary</dt>
                                      <dd className="mt-0.5 text-slate-900">
                                        {String(agr.default_visit_scope_summary ?? "").trim() || "-"}
                                      </dd>
                                    </div>
                                    <div className="sm:col-span-2 lg:col-span-3">
                                      <dt className="font-medium text-slate-500">Default Visit Scope Items</dt>
                                      <dd className="mt-1 space-y-1 text-slate-900">
                                        {sanitizeAgreementDefaultVisitScopeItems(agr.default_visit_scope_items).length > 0 ? (
                                          sanitizeAgreementDefaultVisitScopeItems(agr.default_visit_scope_items).map((item) => (
                                            <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                                              <div className="font-medium text-slate-900">{item.title}</div>
                                              {item.details ? <div className="text-slate-600">{item.details}</div> : null}
                                            </div>
                                          ))
                                        ) : (
                                          <span>-</span>
                                        )}
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              </div>

                              <input type="hidden" name="agreement_name" value={String(agr.agreement_name ?? "")} />
                              <input type="hidden" name="agreement_type" value={String(agr.agreement_type ?? "")} />
                              <input type="hidden" name="frequency" value={String(agr.frequency ?? "")} />
                              <input
                                type="hidden"
                                name="default_visit_scope_summary"
                                value={String(agr.default_visit_scope_summary ?? "")}
                              />
                              <input
                                type="hidden"
                                name="default_visit_scope_items_json"
                                value={JSON.stringify(sanitizeAgreementDefaultVisitScopeItems(agr.default_visit_scope_items))}
                              />

                              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                                  Customer-specific details
                                </div>
                                <p className="mt-1 text-xs text-slate-600">
                                  These fields still update normally for this customer service plan.
                                </p>

                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700">Status</label>
                                    <select
                                      name="status"
                                      defaultValue={String(agr.status)}
                                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                    >
                                      {MAINTENANCE_AGREEMENT_STATUSES.map((value) => (
                                        <option key={value} value={value}>
                                          {value.replace(/_/g, " ")}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700">Next Due Date</label>
                                    <input
                                      type="date"
                                      name="next_due_date"
                                      required
                                      defaultValue={String(agr.next_due_date ?? "")}
                                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700">Start Date</label>
                                    <input
                                      type="date"
                                      name="start_date"
                                      required
                                      defaultValue={String(agr.start_date ?? "")}
                                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700">Renewal Date (Optional)</label>
                                    <input
                                      type="date"
                                      name="renewal_date"
                                      defaultValue={String(agr.renewal_date ?? "")}
                                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700">Primary Location (Optional)</label>
                                    <select
                                      name="primary_location_id"
                                      defaultValue={String(agr.primary_location_id ?? "")}
                                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                    >
                                      <option value="">No primary location</option>
                                      {locations.map((loc) => {
                                        const locId = String(loc.id ?? loc.location_id ?? "").trim();
                                        if (!locId) return null;
                                        return (
                                          <option key={locId} value={locId}>
                                            {locationDisplayName(loc)}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>

                                  <div className="md:col-span-2">
                                    <label className="mb-1 block text-xs font-medium text-slate-700">Internal Notes (Optional)</label>
                                    <textarea
                                      name="internal_notes"
                                      rows={3}
                                      defaultValue={String(agr.internal_notes ?? "")}
                                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                    />
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-medium text-slate-700">Agreement Name</label>
                                <input
                                  name="agreement_name"
                                  required
                                  defaultValue={agr.agreement_name}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Agreement Type</label>
                                <select
                                  name="agreement_type"
                                  defaultValue={String(agr.agreement_type)}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                >
                                  {MAINTENANCE_AGREEMENT_TYPES.map((value) => (
                                    <option key={value} value={value}>
                                      {value.replace(/_/g, " ")}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Frequency</label>
                                <select
                                  name="frequency"
                                  defaultValue={String(agr.frequency)}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                >
                                  {MAINTENANCE_AGREEMENT_FREQUENCIES.map((value) => (
                                    <option key={value} value={value}>
                                      {value.replace(/_/g, " ")}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Status</label>
                                <select
                                  name="status"
                                  defaultValue={String(agr.status)}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                >
                                  {MAINTENANCE_AGREEMENT_STATUSES.map((value) => (
                                    <option key={value} value={value}>
                                      {value.replace(/_/g, " ")}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Next Due Date</label>
                                <input
                                  type="date"
                                  name="next_due_date"
                                  required
                                  defaultValue={String(agr.next_due_date ?? "")}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Start Date</label>
                                <input
                                  type="date"
                                  name="start_date"
                                  required
                                  defaultValue={String(agr.start_date ?? "")}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Renewal Date (Optional)</label>
                                <input
                                  type="date"
                                  name="renewal_date"
                                  defaultValue={String(agr.renewal_date ?? "")}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">Primary Location (Optional)</label>
                                <select
                                  name="primary_location_id"
                                  defaultValue={String(agr.primary_location_id ?? "")}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                >
                                  <option value="">No primary location</option>
                                  {locations.map((loc) => {
                                    const locId = String(loc.id ?? loc.location_id ?? "").trim();
                                    if (!locId) return null;
                                    return (
                                      <option key={locId} value={locId}>
                                        {locationDisplayName(loc)}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-medium text-slate-700">Default Visit Scope / Work Items (Optional)</label>
                                <VisitScopeBuilder
                                  jobType="service"
                                  summaryName="default_visit_scope_summary"
                                  itemsName="default_visit_scope_items_json"
                                  initialSummary={String(agr.default_visit_scope_summary ?? "")}
                                  initialItems={sanitizeAgreementDefaultVisitScopeItems(agr.default_visit_scope_items)}
                                />
                              </div>

                              <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-medium text-slate-700">Internal Notes (Optional)</label>
                                <textarea
                                  name="internal_notes"
                                  rows={3}
                                  defaultValue={String(agr.internal_notes ?? "")}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>
                            </>
                          )}

                          <div className="md:col-span-2">
                            <button
                              type="submit"
                              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                            >
                              Save Changes
                            </button>
                          </div>
                        </form>
                      </details>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {activeWorkspaceTab === "settings" && isInternalViewer ? (
          <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
              <p className="text-sm text-red-800/90">
                Archive this customer record after all related jobs have been removed or archived.
              </p>
            </div>

            <form action={archiveCustomerFromForm}>
              <input type="hidden" name="customer_id" value={customerId} />
              <button
                type="submit"
                className="inline-flex items-center rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Archive Customer
              </button>
            </form>
          </section>
        ) : null}
      </div>
      </div>
    </div>
  );
}
