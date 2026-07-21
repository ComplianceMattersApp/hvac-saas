// app/customers/[id]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  resolveCustomerVisibilityScope,
} from "@/lib/customers/visibility";
import {
  addCustomerServiceLocationFromForm,
  addCustomerLocationSystemFromForm,
  archiveCustomerFromForm,
  deleteCustomerServiceLocationFromForm,
  updateCustomerNotesFromForm,
} from "@/lib/actions/customer-actions";
import { updateLocationServiceAddressFromForm } from "@/app/locations/[id]/notes-actions";
import ServiceLocationAddressFields from "@/components/addresses/ServiceLocationAddressFields";
import { startCustomerSavedPaymentMethodSetupFromForm } from "@/lib/actions/customer-saved-payment-method-actions";
import {
  addCustomerRoleContactFromForm,
  addLocationRoleContactFromForm,
} from "@/lib/actions/contact-recipient-actions";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import {
  compareCustomerWorkJobsLatestFirst,
  deriveCustomerWorkCaseRollup,
  formatCustomerWorkAddress,
  formatCustomerWorkFailureReason,
  formatCustomerWorkPersonName,
} from "@/lib/customers/customer-work-display";
import {
  loadCustomerSystemsEquipmentSummary,
  type CustomerEquipmentSummaryRow,
  type CustomerEquipmentSourceJob,
  type CustomerSystemFilterSummary,
} from "@/lib/customers/customer-systems-equipment-read-model";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";
import { listEstimatesByAccount, type EstimateListItem } from "@/lib/estimates/estimate-read";
import { requireInternalUser, isInternalAccessError } from "@/lib/auth/internal-user";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import {
  createMaintenanceAgreementFromForm,
  updateMaintenanceAgreementFromForm,
  cancelMaintenanceAgreementFromForm,
  deleteMaintenanceAgreementDraftFromForm,
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
  getMostRecentCountedVisitChecklistSummary,
  classifyMaintenanceAgreementDueState,
  type MaintenanceAgreementVisitLinkSummary,
  type MostRecentCountedVisitChecklistSummary,
  type MaintenanceAgreementRow,
} from "@/lib/maintenance-agreements/read-model";
import {
  listChecklistItemsForTemplate,
  listMaintenanceAgreementTemplatesForAccount,
  type MaintenanceAgreementTemplateRow,
  type TemplateChecklistItem,
} from "@/lib/maintenance-agreements/template-read-model";
import {
  listMaintenanceAgreementBillingPeriodsForCustomer,
  type MaintenanceAgreementBillingPeriodReadModelRow,
} from "@/lib/maintenance-agreements/billing-period-read-model";
import VisitScopeBuilder from "@/components/jobs/VisitScopeBuilder";
import { ServicePlanCreateFlow } from "@/components/maintenance-agreements/ServicePlanCreateFlow";
import ServicePlanTerminalActions from "@/components/maintenance-agreements/ServicePlanTerminalActions";
import {
  CustomerServicePlanDetail,
  CustomerServicePlanWorkspace,
  type CustomerServicePlanNavItem,
} from "@/components/maintenance-agreements/CustomerServicePlanWorkspace";
import { sanitizeVisitScopeItems } from "@/lib/jobs/visit-scope";
import { formatDateOnlyDisplay, formatTimestampDateDisplayLA } from "@/lib/utils/schedule-la";
import { resolveCustomerVisitSummary } from "@/lib/customers/customer-visit-summary";
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
import { resolveCustomerAssociatedInvoiceBalances } from "@/lib/business/customer-invoice-balance";
import { formatInvoiceDisplayReference, formatJobDisplayReference } from "@/lib/utils/display-references";
import { getActiveJobAssignmentDisplayMap, type ActiveJobAssignmentDisplay } from "@/lib/staffing/human-layer";
import {
  equipmentRoleLabel,
  equipmentUsesRefrigerant,
  isHeatingOnlyEquipment,
  equipmentSpecGridFields,
} from "@/lib/utils/equipment-display";
import PaymentHistoryCard from "./_components/PaymentHistoryCard";
import ProfileEquipmentCreateForm from "./_components/ProfileEquipmentCreateForm";
import { EquipmentComponentCard } from "./_components/EquipmentComponentCard";
import { CustomerNotesTextarea } from "./_components/CustomerNotesTextarea";
import {
  WorkspaceTabsProvider,
  WorkspaceTabsNav,
  WorkspaceTabPanel,
  WorkspaceTabJumpLink,
} from "./_components/WorkspaceTabs";
import { Disclosure } from "@/components/ui/Disclosure";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";


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
  job_display_number?: string | number | null;
  title: string | null;
  status: string | null;
  job_type?: string | null;
  service_visit_reason?: string | null;
  service_visit_outcome?: string | null;
  job_address: string | null;
  city: string | null;
  scheduled_date: string | null;
  created_at: string | null;
  ops_status: string | null;
  pending_info_reason?: string | null;
  on_hold_reason?: string | null;
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

function jobContractorName(contractors: unknown): string {
  // Supabase returns the joined `contractors` relation as an object or an
  // array depending on how it infers the join cardinality — handle both.
  const first = Array.isArray(contractors) ? contractors[0] : contractors;
  return String((first as { name?: string | null } | null | undefined)?.name ?? "").trim();
}

function formatShortNote(value?: string | null, maxLength = 120) {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return null;
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, maxLength - 3).trimEnd()}...`;
}

function formatEquipmentNumber(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return raw;
  return Number.isInteger(parsed) ? String(parsed) : String(parsed).replace(/\.?0+$/, "");
}

function formatEquipmentSourceJobLabel(job: CustomerEquipmentSourceJob) {
  const reference = formatJobDisplayReference({
    jobDisplayNumber: job.jobDisplayNumber,
    jobId: job.id,
  });
  const title = normalizeRetestLinkedJobTitle(job.title) || "Job";
  const date = formatDate(job.scheduledDate ?? job.createdAt);
  return `${reference} | ${title} | ${date}`;
}

function equipmentProvenanceLabel(eq: CustomerEquipmentSummaryRow) {
  if (eq.sourceJob) return `From ${formatEquipmentSourceJobLabel(eq.sourceJob)}`;
  if (eq.installSource === "contractor") return `Installed by a contractor · ${formatDate(eq.createdAt)}`;
  return `Added ${formatDate(eq.createdAt)}`;
}

function priorUnitSummaryLabel(prior: CustomerEquipmentSummaryRow["priorUnit"]) {
  if (!prior) return null;
  const identity = [prior.manufacturer, prior.model].filter(Boolean).join(" ") || "Equipment";
  const parts = [`Previously: ${identity}`];
  if (prior.serial) parts.push(`Serial ${prior.serial}`);
  if (prior.retiredAt) parts.push(`retired ${formatDate(prior.retiredAt)}`);
  if (prior.retireReason) parts.push(prior.retireReason);
  return parts.join(" · ");
}

function equipmentDetailChips(eq: CustomerEquipmentSummaryRow) {
  const rawRole = eq.equipmentRole || eq.componentType;
  const chips = [
    equipmentRoleLabel(rawRole),
    eq.manufacturer ? `Manufacturer: ${eq.manufacturer}` : null,
    eq.model ? `Model: ${eq.model}` : null,
    eq.serial ? `Serial: ${eq.serial}` : null,
  ];

  if (rawRole && equipmentUsesRefrigerant(rawRole)) {
    const tonnage = formatEquipmentNumber(eq.tonnage);
    if (tonnage) chips.push(`Tonnage: ${tonnage}`);
    if (eq.refrigerantType) chips.push(`Refrigerant: ${eq.refrigerantType}`);
  }

  if (rawRole && isHeatingOnlyEquipment(rawRole)) {
    const heatingCapacity = formatEquipmentNumber(eq.heatingCapacityKbtu);
    const heatingOutput = formatEquipmentNumber(eq.heatingOutputBtu);
    const heatingEfficiency = formatEquipmentNumber(eq.heatingEfficiencyPercent);
    if (heatingCapacity) chips.push(`Heating Input: ${heatingCapacity} KBTU/h`);
    if (heatingOutput) chips.push(`Heating Output: ${heatingOutput} BTU/h`);
    if (heatingEfficiency) chips.push(`Efficiency / AFUE: ${heatingEfficiency}%`);
  }

  return chips.filter(Boolean) as string[];
}

function formatSystemFilterDimension(value: number) {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.?0+$/, "");
}

function formatSystemFilterDate(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || "unknown";
  const [year, month, day] = raw.split("-");
  return `${month}/${day}/${year}`;
}

function formatSystemFilterSummary(filter: CustomerSystemFilterSummary) {
  const dimensions = [filter.length, filter.width, filter.height].map(formatSystemFilterDimension).join(" x ");
  return [filter.label, dimensions, `Changed ${formatSystemFilterDate(filter.dateChanged)}`]
    .filter(Boolean)
    .join(" \u00b7 ");
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

function caseRollupBadgeClass(state: "open" | "closed" | "cancelled" | "needs_review") {
  if (state === "closed") return "border-slate-300 bg-white text-slate-700";
  if (state === "cancelled") return "border-slate-300 bg-slate-100 text-slate-700";
  if (state === "needs_review") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function customerWorkJobStatusLabel(job: Pick<JobRow, "status" | "ops_status" | "deleted_at">) {
  if (job.deleted_at) return "Archived";
  const lifecycle = normalizeLifecycleStatus(job.status);
  if (lifecycle === "cancelled") return "Cancelled";
  if (lifecycle === "completed" || lifecycle === "closed" || normalizeOpsStatus(job.ops_status) === "closed") {
    return "Closed";
  }
  return opsStatusLabel(job.ops_status);
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

export default async function CustomerDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    err?: string;
    tab?: string;
    maSaved?: string;
    maError?: string;
    maFocus?: string;
    banner?: string;
    rcSaved?: string;
    rcError?: string;
    rcLocSaved?: string;
    rcLocError?: string;
    locSaved?: string;
    saved?: string;
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
  const billingPeriodBanner = String(sp.banner ?? "").trim().toLowerCase();
  const roleContactSaved = String(sp.rcSaved ?? "").trim() === "1";
  const roleContactError = String(sp.rcError ?? "").trim() === "1";
  const locationRoleContactSaved = String(sp.rcLocSaved ?? "").trim() === "1";
  const locationRoleContactError = String(sp.rcLocError ?? "").trim() === "1";
  const serviceLocationSaved = String(sp.locSaved ?? "").trim().toLowerCase();
  const systemsEquipmentSaved = String(sp.saved ?? "").trim().toLowerCase();
  const systemsEquipmentError = String(sp.err ?? "").trim().toLowerCase();
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
      job_display_number,
      title,
      status,
      job_type,
      service_visit_reason,
      service_visit_outcome,
      job_address,
      city,
      scheduled_date,
      created_at,
      ops_status,
      pending_info_reason,
      on_hold_reason,
      contractor_id,
      contractors(name),
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

  const workJobIds = jobs.map((job) => String(job.id ?? "").trim()).filter(Boolean);
  const activeAssignmentDisplayMap: Record<string, ActiveJobAssignmentDisplay[]> = await getActiveJobAssignmentDisplayMap({
    supabase,
    jobIds: workJobIds,
  }).catch(() => ({}));

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
  const systemsEquipmentSummary =
    isInternalViewer && visibilityScope.kind === "internal"
      ? await loadCustomerSystemsEquipmentSummary({
          supabase,
          accountOwnerUserId: visibilityScope.accountOwnerUserId,
          customerId,
        })
      : {
          locations: [],
          totalSystemCount: 0,
          totalEquipmentCount: 0,
        };
  const systemsEquipmentLocations = (() => {
    const byLocationId = new Map(systemsEquipmentSummary.locations.map((location) => [location.id, location]));
    const fromCustomerLocations = locations.map((location) => {
      const locationId = String(location.id ?? location.location_id ?? "").trim();
      const existing = locationId ? byLocationId.get(locationId) : null;
      if (existing) return existing;
      return {
        id: locationId,
        label: locationDisplayName(location),
        address: locationAddressLine(location) || null,
        systems: [],
      };
    });
    const locationIds = new Set(fromCustomerLocations.map((location) => location.id));
    return [
      ...fromCustomerLocations,
      ...systemsEquipmentSummary.locations.filter((location) => !locationIds.has(location.id)),
    ];
  })();

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

  for (const caseJobs of caseGroups.values()) {
    caseJobs.sort(compareCustomerWorkJobsLatestFirst);
  }
  ungroupedJobs.sort(compareCustomerWorkJobsLatestFirst);

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

  const visitSummary = resolveCustomerVisitSummary(jobs);

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
  const customerLocationIds = new Set(
    locations
      .map((location) => String(location.id ?? location.location_id ?? "").trim())
      .filter(Boolean),
  );
  const customerLocationRoleContacts = locationRoleContacts.filter((recipient) =>
    customerLocationIds.has(String(recipient.linked_entity_id ?? "").trim()),
  );
  const hasDisplayableRoleContacts = customerRoleContacts.some((recipient) =>
    isDisplayableRole(recipient.recipient_role),
  );
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
    ) ?? customerLocationRoleContacts.find(
      (recipient) => String(recipient.recipient_role ?? "").trim().toLowerCase() === "site_access_contact",
    ) ?? null;
  const totalContactCount = new Set(
    [...customerRoleContacts, ...customerLocationRoleContacts]
      .map((recipient) => String(recipient.id ?? "").trim())
      .filter(Boolean),
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

  const templateChecklistItems: Record<string, TemplateChecklistItem[]> = {};
  if (maintenanceAgreementsEnabled && agreementTemplates.length > 0) {
    try {
      const checklistRows = await Promise.all(
        agreementTemplates.map(async (tpl) => {
          const items = await listChecklistItemsForTemplate({
            supabase,
            accountOwnerUserId: visibilityScope.accountOwnerUserId,
            templateId: tpl.id,
          });
          return [tpl.id, items] as const;
        }),
      );
      for (const [templateId, items] of checklistRows) {
        if (items.length > 0) {
          templateChecklistItems[templateId] = items;
        }
      }
    } catch {
      // Fail safe — empty record leaves the picker looking exactly as before
    }
  }
  const createAgreementStartDateDefault = new Date().toISOString().slice(0, 10);
  const createAgreementLocationOptions = locations
    .map((loc) => ({
      id: String(loc.id ?? loc.location_id ?? "").trim(),
      label: locationDisplayName(loc),
    }))
    .filter((option) => option.id);
  const createAgreementSingleLocationId =
    createAgreementLocationOptions.length === 1 ? createAgreementLocationOptions[0].id : null;

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

  const agreementChecklistItemsById = new Map<string, TemplateChecklistItem[]>();
  if (maintenanceAgreementsEnabled && customerAgreements.length > 0) {
    try {
      const checklistRows = await Promise.all(
        customerAgreements.map(async (agr) => {
          const items = await listChecklistItemsForTemplate({
            supabase,
            accountOwnerUserId: visibilityScope.accountOwnerUserId,
            agreementId: agr.id,
          });
          return [agr.id, items] as const;
        }),
      );
      for (const [agrId, items] of checklistRows) {
        if (items.length > 0) {
          agreementChecklistItemsById.set(agrId, items);
        }
      }
    } catch {
      // Fail safe
    }
  }

  const agreementChecklistRollupById = new Map<string, MostRecentCountedVisitChecklistSummary>();
  if (maintenanceAgreementsEnabled && customerAgreements.length > 0) {
    try {
      const rollupRows = await Promise.all(
        customerAgreements.map(async (agreement) => {
          const rollup = await getMostRecentCountedVisitChecklistSummary({
            supabase,
            accountOwnerUserId: visibilityScope.accountOwnerUserId,
            agreementId: agreement.id,
          });
          return [agreement.id, rollup] as const;
        }),
      );

      for (const [agreementId, rollup] of rollupRows) {
        if (rollup) {
          agreementChecklistRollupById.set(agreementId, rollup);
        }
      }
    } catch {
      // Fail safe for environments where checklist summary is unavailable.
    }
  }

  const planLinkedJobIds = new Set<string>();
  if (maintenanceAgreementsEnabled && workJobIds.length > 0) {
    try {
      const { data: planLinkRows } = await supabase
        .from("maintenance_agreement_visits")
        .select("job_id")
        .eq("account_owner_user_id", visibilityScope.accountOwnerUserId)
        .in("job_id", workJobIds)
        .eq("link_source", "service_plan_prefill")
        .neq("count_status", "reversed")
        .limit(500);
      for (const row of planLinkRows ?? []) {
        const jid = String((row as { job_id?: unknown }).job_id ?? "").trim();
        if (jid) planLinkedJobIds.add(jid);
      }
    } catch {
      // fail safely — badge is non-critical
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
  let customerOpenBalanceCents = 0;
  let associatedInvoiceCount = 0;
  let legacyPayerReviewCount = 0;
  let canViewPaymentHistory = false;
  let canManageBillingPeriods = false;
  let canManageSavedPaymentMethodSetup = false;
  let customerSavedPaymentMethods: CustomerSavedPaymentMethodRow[] = [];
  let isTemplateAdmin = false;

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
      isTemplateAdmin = iu.role === "admin";

      if (canViewPaymentHistory) {
        const [paymentHistory, invoiceBalances] = await Promise.all([
          listCustomerPaymentHistory({
            supabase,
            accountOwnerUserId: visibilityScope.accountOwnerUserId,
            customerId,
            limit: 50,
          }),
          resolveCustomerAssociatedInvoiceBalances({
            supabase,
            accountOwnerUserId: visibilityScope.accountOwnerUserId,
            customerId,
            customerName: customerDisplayName(customer),
            customerEmail: customer.email,
          }),
        ]);
        customerPaymentHistory = paymentHistory;
        customerOpenBalanceCents = invoiceBalances.customerOpenBalanceCents;
        associatedInvoiceCount = invoiceBalances.associatedInvoices.length;
        legacyPayerReviewCount = invoiceBalances.associatedInvoices.filter((invoice) => invoice.payerIdentityNeedsReview).length;
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

        const savedPaymentMethodRows = (Array.isArray(methodRows) ? methodRows : []) as unknown as Record<string, unknown>[];
        customerSavedPaymentMethods = savedPaymentMethodRows.map((row) => ({
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
      customerOpenBalanceCents = 0;
      associatedInvoiceCount = 0;
      legacyPayerReviewCount = 0;
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
  const customerServicePlanNavItems: CustomerServicePlanNavItem[] = customerAgreements.map((agreement) => ({
    id: String(agreement.id),
    name: String(agreement.agreement_name ?? "Untitled Service Plan"),
    status: String(agreement.status ?? "draft"),
    frequency: String(agreement.frequency ?? ""),
    nextDueDate: String(agreement.next_due_date ?? "").trim() || null,
    dueState: classifyMaintenanceAgreementDueState({
      status: agreement.status,
      nextDueDate: agreement.next_due_date,
    }),
  }));
  const defaultCustomerServicePlanId =
    customerServicePlanNavItems.find((plan) => plan.id === maintenanceAgreementFocusId)?.id ??
    customerServicePlanNavItems.find((plan) => plan.dueState === "overdue" || plan.dueState === "due_today")?.id ??
    customerServicePlanNavItems.find((plan) => plan.status === "active")?.id ??
    customerServicePlanNavItems[0]?.id ??
    null;

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
    { id: "systems-equipment", label: "Systems & Equipment" },
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

  // Overview call-in command center — spec §7.1
  const ATTENTION_OPS_STATUSES = [
    "pending_info",
    "on_hold",
    "failed",
    "retest_needed",
    "paperwork_required",
    "invoice_required",
    "pending_office_review",
  ] as const;
  const jobAttentionItems = ATTENTION_OPS_STATUSES.flatMap((key) => {
    const count = opsCounts[key] ?? 0;
    if (count === 0) return [];
    const job = activeJobs.find((j) => normalizeOpsStatus(j.ops_status) === key) ?? null;
    const reason = job ? job.pending_info_reason || job.on_hold_reason || null : null;
    const jobTitle = job ? normalizeRetestLinkedJobTitle(job.title) || "Job" : null;
    return [
      {
        key,
        label: `${count} job${count === 1 ? "" : "s"} ${opsStatusLabel(key).toLowerCase()}`,
        detail: jobTitle ? `${jobTitle}${reason ? ` — ${reason}` : ""}` : opsStatusLabel(key),
      },
    ];
  });

  const paymentsAttentionActive = canViewPaymentHistory && failedPaymentAttentionCount > 0;
  const servicePlansAttentionActive =
    maintenanceAgreementsEnabled && canManageBillingPeriods && billingPeriodsNeedingAttentionCount > 0;
  const moneyAndPlansAttentionActive = paymentsAttentionActive || servicePlansAttentionActive;

  const recentServiceHistoryJobs = [...jobs]
    .filter((job) => !job.deleted_at)
    .sort(compareCustomerWorkJobsLatestFirst)
    .slice(0, 4);

  const overviewEquipmentCards = systemsEquipmentLocations
    .flatMap((location) => location.systems.flatMap((system) => system.equipment))
    .slice(0, 4);

  const additionalContactCount = Math.max(totalContactCount - (primaryAccountContact ? 1 : 0), 0);
  const primaryLocationCity = String(firstLocationWithAddress?.city ?? "").trim();

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
        {systemsEquipmentSaved === "system_added" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            System added
          </div>
        )}
        {systemsEquipmentSaved === "equipment_added" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Equipment added
          </div>
        )}
        {systemsEquipmentSaved === "system_updated" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            System updated
          </div>
        )}
        {systemsEquipmentSaved === "system_archived" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            System archived
          </div>
        )}
        {systemsEquipmentSaved === "equipment_updated" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Equipment updated
          </div>
        )}
        {systemsEquipmentSaved === "equipment_retired" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Equipment retired
          </div>
        )}
        {systemsEquipmentSaved === "equipment_replaced" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Equipment replaced — the old unit is retired and the new one is active.
          </div>
        )}
        {[
          "system_failed",
          "equipment_failed",
          "system_required",
          "equipment_required",
          "system_has_active_equipment",
          "system_archive_failed",
          "equipment_retire_failed",
          "equipment_replace_failed",
          "equipment_not_found",
          "equipment_already_retired",
          "retire_reason_required",
        ].includes(systemsEquipmentError) && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {systemsEquipmentError === "system_required" && "System name is required."}
            {systemsEquipmentError === "equipment_required" && "Equipment type is required."}
            {systemsEquipmentError === "system_failed" && "Could not add system. Verify the customer and property scope, then try again."}
            {systemsEquipmentError === "equipment_failed" && "Could not add equipment. Verify the system and property scope, then try again."}
            {systemsEquipmentError === "system_has_active_equipment" && "Can't archive a system with active equipment — retire or replace its components first."}
            {systemsEquipmentError === "system_archive_failed" && "Could not archive system. Try again."}
            {systemsEquipmentError === "equipment_retire_failed" && "Could not retire equipment. Try again."}
            {systemsEquipmentError === "equipment_replace_failed" && "Could not replace equipment. Verify the new unit's details and try again."}
            {systemsEquipmentError === "equipment_not_found" && "That equipment record couldn't be found in this property's scope."}
            {systemsEquipmentError === "equipment_already_retired" && "That unit is already retired."}
            {systemsEquipmentError === "retire_reason_required" && "Select a retire reason (Failure, Warranty, or Upgrade)."}
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
              <SectionEyebrow>Customer Workspace</SectionEyebrow>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy md:text-3xl">
                {customerDisplayName(customer)}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Keep customer details, quick actions, and next steps in one place.
              </p>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">Primary Contact</div>
              <div className="text-sm font-semibold text-navy">
                {customer.phone ? formatPhone(customer.phone) : "No phone on file"}
              </div>
              {customer.email ? <div className="text-sm text-slate-600">{customer.email}</div> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {callHref ? (
                <a
                  href={callHref}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  Call
                </a>
              ) : null}
              {smsHref ? (
                <a
                  href={smsHref}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  Text
                </a>
              ) : null}
              {customer.email ? (
                <a
                  href={`mailto:${customer.email}`}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  Email
                </a>
              ) : null}
            </div>

            <div className="space-y-1 border-t border-slate-200/70 pt-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">
                Primary Service Address
              </div>
              {serviceAddressFallback ? (
                <div className="text-sm text-slate-600">
                  <span className="font-semibold text-navy">{serviceAddressFallback.address}</span>
                  {makeMapsHref(serviceAddressFallback.address) ? (
                    <>
                      {" · "}
                      <a
                        href={makeMapsHref(serviceAddressFallback.address)!}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-blue-700 hover:underline"
                      >
                        Map
                      </a>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-slate-600">No service address on file</div>
              )}
              <div className="text-xs text-slate-500">
                Billing: {hasSavedBillingContact ? "saved billing contact" : "same as service address"}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 md:items-end">
            {isInternalViewer ? (
              <div className="flex flex-col items-stretch gap-2 md:items-end">
                <Link
                  href={`/jobs/new?customer_id=${customerId}&source=customer`}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  + Create Job
                </Link>
                <div className="flex gap-2">
                  {estimatesEnabled && (
                    <Link
                      href={`/estimates/new?customer_id=${customerId}`}
                      className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Estimate
                    </Link>
                  )}
                  <Link
                    href={`/customers/${customerId}/edit`}
                    className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-white/85 p-3 md:w-64">
              <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">
                {visitSummary?.heading ?? "LAST VISIT"}
              </div>
              <div className="mt-1 text-base font-semibold text-navy">{formatDate(visitSummary?.scheduledDate)}</div>
              {visitSummary ? (
                <div className="text-xs text-slate-500">{visitSummary.relativeLabel}</div>
              ) : null}
            </div>
          </div>
        </div>

        <WorkspaceTabsProvider initialTab={activeWorkspaceTab}>
        <nav
          aria-label="Customer workspace tabs"
          className="rounded-2xl border border-slate-300 bg-slate-100/95 p-3 shadow-sm ring-1 ring-slate-200 md:p-4"
        >
          <SectionEyebrow className="mb-3">Workspace Navigation</SectionEyebrow>
          <WorkspaceTabsNav tabs={workspaceNavigationItems} />
        </nav>

        <div className="space-y-6 md:space-y-7">

        <WorkspaceTabPanel id="overview">
        <section className="grid gap-5 xl:grid-cols-[1.25fr_.9fr]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-1 flex items-center justify-between gap-3">
                <SectionEyebrow className="mb-0">Service History</SectionEyebrow>
                <WorkspaceTabJumpLink id="work" className="text-xs font-medium text-blue-700 hover:underline">
                  View all in Work →
                </WorkspaceTabJumpLink>
              </div>
              <p className="mb-4 text-sm text-slate-500">
                {jobs.filter((job) => !job.deleted_at).length} visit
                {jobs.filter((job) => !job.deleted_at).length === 1 ? "" : "s"} total · {activeJobs.length} open
              </p>

              {recentServiceHistoryJobs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No jobs found for this customer yet.
                </div>
              ) : (
                <div>
                  {recentServiceHistoryJobs.map((job, index) => {
                    const isOpen = isOperationallyActiveJob(job);
                    const isClosed = !isOpen && normalizeOpsStatus(job.ops_status) === "closed";
                    const dotClass = isOpen ? "bg-blue-600" : isClosed ? "bg-emerald-600" : "bg-slate-300";
                    const isLast = index === recentServiceHistoryJobs.length - 1;
                    return (
                      <div key={job.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
                          {!isLast ? <span className="w-px flex-1 bg-slate-200" /> : null}
                        </div>
                        <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-4"}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-navy">
                              {normalizeRetestLinkedJobTitle(job.title) || "Job"}
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${opsBadgeClass(job.ops_status)}`}
                            >
                              {customerWorkJobStatusLabel(job)}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {formatDate(job.scheduled_date ?? job.created_at)} ·{" "}
                            {formatJobDisplayReference({ jobDisplayNumber: job.job_display_number, jobId: job.id })}
                            {job.contractors?.name ? ` · ${job.contractors.name}` : ""} ·{" "}
                            <Link
                              href={isInternalViewer ? `/jobs/${job.id}` : `/portal/jobs/${job.id}`}
                              className="font-medium text-blue-700 hover:underline"
                            >
                              Open Job
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {isInternalViewer ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <Link
                    href={`/jobs/new?customer_id=${customerId}&source=customer`}
                    className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Schedule Next Visit
                  </Link>
                  {estimatesEnabled ? (
                    <Link
                      href={`/estimates/new?customer_id=${customerId}`}
                      className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Create Estimate
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>

            {isInternalViewer ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <SectionEyebrow className="mb-0">Systems at this Address</SectionEyebrow>
                  <WorkspaceTabJumpLink id="systems-equipment" className="text-xs font-medium text-blue-700 hover:underline">
                    Manage →
                  </WorkspaceTabJumpLink>
                </div>
                <p className="mb-3 text-sm text-slate-500">
                  {systemsEquipmentSummary.totalSystemCount} system{systemsEquipmentSummary.totalSystemCount === 1 ? "" : "s"} ·{" "}
                  {systemsEquipmentSummary.totalEquipmentCount} equipment record
                  {systemsEquipmentSummary.totalEquipmentCount === 1 ? "" : "s"}
                </p>
                {overviewEquipmentCards.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    No systems or equipment saved for this property yet.
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {overviewEquipmentCards.map((equipment) => {
                      const chips = equipmentDetailChips(equipment);
                      return (
                        <div key={equipment.id} className="rounded-xl border border-slate-200 p-3.5">
                          <div className="text-sm font-semibold text-navy">{chips[0] ?? "Equipment"}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {chips.slice(1, 4).join(" · ") || "No details on file"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionEyebrow>Needs Attention</SectionEyebrow>
              <div className="mt-3 space-y-2">
                {jobAttentionItems.length === 0 ? (
                  <div className="flex items-center gap-2.5 text-sm text-emerald-700">
                    <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">
                      ✓
                    </span>
                    Jobs all clear
                  </div>
                ) : (
                  jobAttentionItems.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3"
                    >
                      <span className="mt-1 h-[7px] w-[7px] shrink-0 rounded-full bg-amber-600" />
                      <div>
                        <div className="text-sm font-semibold text-navy">{item.label}</div>
                        <div className="text-xs text-amber-800">{item.detail}</div>
                      </div>
                    </div>
                  ))
                )}

                {moneyAndPlansAttentionActive ? (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
                    <span className="mt-1 h-[7px] w-[7px] shrink-0 rounded-full bg-amber-600" />
                    <div>
                      <div className="text-sm font-semibold text-navy">
                        {paymentsAttentionActive
                          ? `${failedPaymentAttentionCount} payment attention item${failedPaymentAttentionCount === 1 ? "" : "s"}`
                          : "Billing period needs attention"}
                      </div>
                      <div className="text-xs text-amber-800">Review in Money or Service Plans.</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 text-sm text-emerald-700">
                    <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">
                      ✓
                    </span>
                    Payments &amp; plans all clear
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionEyebrow>Quick Facts</SectionEyebrow>
              <div className="mt-3 space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Locations</span>
                  <span className="font-semibold text-navy">
                    {locations.length}
                    {primaryLocationCity ? ` · ${primaryLocationCity}` : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Additional contacts</span>
                  <span className="font-semibold text-slate-400">
                    {additionalContactCount > 0 ? additionalContactCount : "None"}
                  </span>
                </div>
                {maintenanceAgreementsEnabled ? (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Service plan</span>
                    <span className="font-semibold text-slate-400">
                      {activeServicePlanCount > 0 ? `${activeServicePlanCount} active` : "None active"}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Lifetime jobs</span>
                  <span className="font-semibold text-navy">{jobs.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Balance</span>
                  <span
                    className={`font-semibold ${
                      canViewPaymentHistory
                        ? failedPaymentAttentionCount > 0
                          ? "text-rose-700"
                          : "text-emerald-700"
                        : "text-slate-400"
                    }`}
                  >
                    {canViewPaymentHistory
                      ? customerOpenBalanceCents > 0
                        ? (customerOpenBalanceCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
                        : "No open balance"
                      : "Limited"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionEyebrow>Account &amp; Access</SectionEyebrow>
              <div className="mt-2 text-sm font-bold text-navy">{customerDisplayName(customer)}</div>
              <div className="mb-3 text-xs text-slate-500">
                {hasSavedBillingContact ? "Responsible account contact" : "Responsible account & billing contact"}
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">Site Access</div>
                {siteAccessContact ? (
                  <>
                    <div className="mt-1 text-sm font-bold text-navy">
                      {String(siteAccessContact.display_name ?? "").trim() || "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {siteAccessContact.phone_e164 ? formatPhone(siteAccessContact.phone_e164) : "No phone on file"}
                      {isDisplayableRole(siteAccessContact.recipient_role)
                        ? ` · ${formatRoleForInternalDisplay(siteAccessContact.recipient_role)}`
                        : ""}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-sm text-slate-500">No site access contact saved.</div>
                )}
              </div>
            </div>
          </div>
        </section>
        </WorkspaceTabPanel>

        <WorkspaceTabPanel id="money">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-navy">Money Overview</h2>
              <p className="mt-1 text-xs text-slate-600">
                Customer-level payment status and where to go for invoice actions.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Customer Balance</div>
                <div className="mt-1 text-base font-semibold text-slate-900">
                  {canViewPaymentHistory
                    ? (customerOpenBalanceCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
                    : "Limited"}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {associatedInvoiceCount} associated invoice{associatedInvoiceCount === 1 ? "" : "s"}; only invoices billed to this customer affect this balance.
                </p>
                {legacyPayerReviewCount > 0 ? (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    {legacyPayerReviewCount} older invoice{legacyPayerReviewCount === 1 ? " needs" : "s need"} payer review.
                  </p>
                ) : null}
              </div>
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
                    className="mt-2 inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                  >
                    Open invoice workspace
                  </Link>
                ) : null}
              </div>
            </div>
          </section>

        {/* Payment History (if authorized) */}
        {canViewPaymentHistory && (
          <PaymentHistoryCard
            payments={customerPaymentHistory}
            customerId={customerId}
            customerName={customerDisplayName(customer)}
          />
        )}

        {canManageSavedPaymentMethodSetup && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-navy">Payment Method</h2>
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
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
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

        {!canManageSavedPaymentMethodSetup ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            Saved card setup and status are limited for this viewer.
          </section>
        ) : null}
        </WorkspaceTabPanel>

        {/* Settings: Account Summary detail (moved off Overview per redundancy rule — Overview now shows the condensed Quick Facts / Account & Access snapshot instead) */}
        <WorkspaceTabPanel id="settings">
        <section className="grid gap-6 xl:grid-cols-[1.25fr_.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-navy">
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

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-navy">Billing / Paperwork Defaults</h2>

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
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  Call Account Phone
                </a>
              ) : null}

              {smsHref ? (
                <a
                  href={smsHref}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  Text Account Phone
                </a>
              ) : null}

              {customer.email ? (
                <a
                  href={`mailto:${customer.email}`}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  Email Account Contact
                </a>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Calls and emails here use the account/customer contact and may not be the person on site for every job.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-semibold text-slate-900">{jobs.length}</span>
                <span className="text-xs uppercase tracking-wide text-slate-500">Total Jobs</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-semibold text-slate-900">{activeWorkCount}</span>
                <span className="text-xs uppercase tracking-wide text-slate-500">Active Work (Incl. Closeout)</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-semibold text-slate-900">{completedJobsCount}</span>
                <span className="text-xs uppercase tracking-wide text-slate-500">Completed / Closed</span>
              </div>
            </div>
          </div>
        </section>
        </WorkspaceTabPanel>

        <WorkspaceTabPanel id="locations-contacts">
          {isInternalViewer ? (
          <section id="contact-overview" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-navy">Contact Overview</h2>
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
        </WorkspaceTabPanel>

        <WorkspaceTabPanel id="locations-contacts">
          {isInternalViewer ? (
          <section id="role-contacts" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-navy">Account Contacts</h2>
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

            <Disclosure title="Add account contact" className="mt-3">
              <form action={addCustomerRoleContactFromForm} className="grid gap-2 sm:grid-cols-2">
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
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                  >
                    Save account contact
                  </button>
                </div>
              </form>
            </Disclosure>
          </section>
          ) : null}
        </WorkspaceTabPanel>

        <WorkspaceTabPanel id="history">
          {isInternalViewer ? (
          <section id="customer-notes" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-navy">Customer Notes</h2>
              <p className="mt-1 text-sm text-slate-500">
                Internal notes and context for this customer.
              </p>
            </div>
            <form action={updateCustomerNotesFromForm} className="space-y-3">
              <input type="hidden" name="customer_id" value={customerId} />
              <CustomerNotesTextarea defaultValue={customer.notes ?? ""} />
              <div>
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </form>
          </section>
          ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            Customer notes are not available for this viewer.
          </section>
          )}
        </WorkspaceTabPanel>

        {/* Service Locations */}
        <WorkspaceTabPanel id="locations-contacts">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-navy">Managed Locations</h2>
              <p className="text-sm text-slate-500">
                Saved service addresses for this customer account. Add locations when this customer has more than one service address.
              </p>
            </div>
            {isInternalViewer ? (
              <Disclosure title="Add Location" className="sm:min-w-80">
                <form action={addCustomerServiceLocationFromForm} className="grid gap-3">
                  <input type="hidden" name="customer_id" value={customerId} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Nickname
                      <input
                        name="nickname"
                        placeholder="Main house"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Label
                      <input
                        name="label"
                        placeholder="Front unit"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                      />
                    </label>
                  </div>
                  <ServiceLocationAddressFields
                    compact
                  />
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    Notes
                    <textarea
                      name="notes"
                      rows={2}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                    />
                  </label>
                  <button
                    type="submit"
                    className="inline-flex w-fit items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Add Location
                  </button>
                </form>
              </Disclosure>
            ) : null}
          </div>

          {serviceLocationSaved === "created" ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Service location saved.
            </div>
          ) : null}
          {serviceLocationSaved === "existing" ? (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              That service location was already saved for this customer.
            </div>
          ) : null}
          {serviceLocationSaved === "updated" ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Service location updated.
            </div>
          ) : null}
          {serviceLocationSaved === "removed" ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Service location removed.
            </div>
          ) : null}
          {serviceLocationSaved === "in_use" ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              This location is still linked to active jobs. Move or archive those jobs before removing the saved address.
            </div>
          ) : null}

          {locations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              No service locations saved yet.
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
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

                      <div className="flex w-full flex-row flex-wrap items-center gap-2 sm:w-auto sm:flex-col sm:items-end sm:gap-1">
                        {isPrimaryServiceLocation ? (
                          <span className="inline-flex min-h-7 items-center justify-center whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-center text-[11px] font-semibold leading-none text-blue-700">
                            Primary service location
                          </span>
                        ) : null}
                        <div className="inline-flex min-h-7 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-center text-xs leading-none text-slate-600">
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

                          <Disclosure title="Add site/access contact" className="mt-2">
                            <form action={addLocationRoleContactFromForm} className="grid gap-2 sm:grid-cols-2">
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
                                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                >
                                  Save site/access contact
                                </button>
                              </div>
                            </form>
                          </Disclosure>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        {mapsHref ? (
                          <a
                            href={mapsHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                          >
                            Open in Maps
                          </a>
                        ) : null}

                        {locId && isInternalViewer ? (
                          <>
                            <Disclosure title="Edit Service Address" className="w-full">
                              <form action={updateLocationServiceAddressFromForm} className="grid gap-3 sm:grid-cols-2">
                                <input type="hidden" name="location_id" value={locId} />
                                <input type="hidden" name="return_customer_id" value={customerId} />
                                <label className="grid gap-1 text-xs font-medium text-slate-600">
                                  Nickname
                                  <input
                                    name="nickname"
                                    defaultValue={String(loc.nickname ?? "")}
                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                                  />
                                </label>
                                <label className="grid gap-1 text-xs font-medium text-slate-600">
                                  Label
                                  <input
                                    name="label"
                                    defaultValue={String(loc.label ?? "")}
                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                                  />
                                </label>
                                <ServiceLocationAddressFields
                                  compact
                                  className="sm:col-span-2"
                                  initialValues={{
                                    addressLine1: String(loc.address_line1 ?? ""),
                                    addressLine2: String(loc.address_line2 ?? ""),
                                    city: String(loc.city ?? ""),
                                    state: String(loc.state ?? ""),
                                    zip: String(loc.zip ?? loc.postal_code ?? ""),
                                  }}
                                />
                                <label className="grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                                  Notes
                                  <textarea
                                    name="notes"
                                    rows={2}
                                    defaultValue={String(loc.notes ?? "")}
                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                                  />
                                </label>
                                <div className="sm:col-span-2">
                                  <button
                                    type="submit"
                                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                                  >
                                    Save Location
                                  </button>
                                  <Link
                                    href={`/locations/${locId}`}
                                    className="ml-2 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                                  >
                                    Open Location Record
                                  </Link>
                                </div>
                              </form>
                            </Disclosure>
                            <Disclosure title="Remove Location" className="w-full">
                              <form action={deleteCustomerServiceLocationFromForm} className="grid gap-3">
                                <input type="hidden" name="customer_id" value={customerId} />
                                <input type="hidden" name="location_id" value={locId} />
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                  Removes this saved service address and any site/access contacts linked only to it. Locations with active jobs cannot be removed.
                                </div>
                                <button
                                  type="submit"
                                  className="inline-flex w-fit items-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                                >
                                  Remove Location
                                </button>
                              </form>
                            </Disclosure>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        </WorkspaceTabPanel>

        <WorkspaceTabPanel id="systems-equipment">
        {isInternalViewer ? (
          <section id="systems-equipment" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <SectionEyebrow>Property Equipment</SectionEyebrow>
                <h2 className="text-lg font-semibold text-navy">Systems &amp; Equipment</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Systems and equipment saved for each customer property.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  {systemsEquipmentSummary.totalSystemCount} system{systemsEquipmentSummary.totalSystemCount === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  {systemsEquipmentSummary.totalEquipmentCount} equipment record{systemsEquipmentSummary.totalEquipmentCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {systemsEquipmentLocations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                No systems or equipment saved for this property yet.
              </div>
            ) : (
              <div className="space-y-4">
                {systemsEquipmentLocations.map((location) => (
                  <div key={location.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">{location.label}</h3>
                          {location.address ? (
                            <div className="mt-0.5 text-xs text-slate-500">{location.address}</div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-start gap-2">
                          <span className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {location.systems.length} system{location.systems.length === 1 ? "" : "s"}
                          </span>
                          <Disclosure title="+ Add system" variant="flush" className="w-full sm:w-56">
                            <form action={addCustomerLocationSystemFromForm} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <input type="hidden" name="customer_id" value={customerId} />
                              <input type="hidden" name="location_id" value={location.id} />
                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor={`system-name-${location.id}`}>
                                  System name (optional)
                                </label>
                                <input
                                  id={`system-name-${location.id}`}
                                  name="name"
                                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                                  placeholder={`System ${location.systems.length + 1}`}
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                  Leave blank for a default label like "System {location.systems.length + 1}" — rename anytime.
                                </p>
                              </div>
                              <button className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                                Add System
                              </button>
                            </form>
                          </Disclosure>
                        </div>
                      </div>
                    </div>

                    {location.systems.length === 0 ? (
                      <div className="p-4 text-sm text-slate-500">
                        No systems or equipment saved for this property yet.
                      </div>
                    ) : (
                    <div className="divide-y divide-slate-200">
                      {location.systems.map((system) => {
                        const rawSystemId = system.id.replace(/^profile:/, "");
                        return (
                        <div key={system.id} className="p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                                  System
                                </span>
                                <h4 className="text-sm font-semibold text-navy">{system.name}</h4>
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500">
                                {system.sourceJob ? `From ${formatEquipmentSourceJobLabel(system.sourceJob)}` : "Saved property equipment"}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-start gap-2">
                              {system.sourceJob ? (
                                <Link
                                  href={`/jobs/${system.sourceJob.id}`}
                                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                                >
                                  Open Job
                                </Link>
                              ) : null}
                              {!system.sourceJob ? (
                                <Disclosure title="Add Equipment" className="w-full sm:w-72">
                                  <ProfileEquipmentCreateForm
                                    customerId={customerId}
                                    locationId={location.id}
                                    systemId={rawSystemId}
                                  />
                                </Disclosure>
                              ) : null}
                            </div>
                          </div>

                          {system.equipment.length === 0 ? (
                            <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
                              {system.sourceJob ? (
                                "No equipment records under this system yet."
                              ) : (
                                <>
                                  <div className="mb-2">No components saved under this system yet.</div>
                                  <Disclosure title="Add details" className="mx-auto w-full text-left sm:w-72">
                                    <ProfileEquipmentCreateForm
                                      customerId={customerId}
                                      locationId={location.id}
                                      systemId={rawSystemId}
                                    />
                                  </Disclosure>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {system.equipment.map((equipment) => {
                                // §8.6: Open Job + the provenance line are hoisted to the
                                // system header. Only repeat them per-component when this
                                // component's source job differs from the system's — e.g.
                                // a canonical component installed on a different job (or
                                // by a contractor, or standalone) than what the system
                                // header is showing. Never suppress a component's own
                                // contractor/standalone provenance (it has no system-level
                                // equivalent to dedupe against).
                                const sameJobAsSystem = Boolean(
                                  equipment.sourceJob && system.sourceJob && equipment.sourceJob.id === system.sourceJob.id,
                                );
                                return (
                                  <EquipmentComponentCard
                                    key={equipment.id}
                                    customerId={customerId}
                                    locationId={location.id}
                                    systemId={equipment.status !== null ? rawSystemId : null}
                                    equipment={equipment}
                                    roleLabel={equipmentRoleLabel(equipment.equipmentRole || equipment.componentType)}
                                    specFields={equipmentSpecGridFields(equipment)}
                                    provenanceLabel={sameJobAsSystem ? null : equipmentProvenanceLabel(equipment)}
                                    jobHref={!sameJobAsSystem && equipment.sourceJob ? `/jobs/${equipment.sourceJob.id}` : null}
                                    jobManageHref={equipment.sourceJob ? `/jobs/${equipment.sourceJob.id}/info?f=equipment` : null}
                                    priorUnitLabel={priorUnitSummaryLabel(equipment.priorUnit)}
                                    hasDeeperHistory={equipment.priorUnit?.hasDeeperHistory ?? false}
                                  />
                                );
                              })}
                            </div>
                          )}

                          {system.filters.length > 0 ? (
                            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">System Filters</div>
                              <div className="mt-2 space-y-1.5">
                                {system.filters.map((filter) => (
                                  <div key={filter.id} className="text-sm text-slate-700">
                                    {formatSystemFilterSummary(filter)}
                                    {filter.notes ? (
                                      <span className="text-xs text-slate-500"> ({formatShortNote(filter.notes, 80)})</span>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            Systems and equipment records are not available for this viewer.
          </section>
        )}
        </WorkspaceTabPanel>

        {/* Job history */}
        <WorkspaceTabPanel id="work">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-navy">Recent / Active Work</h2>
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
                const caseJobs = caseGroups.get(caseId) ?? [];
                const caseRollup = deriveCustomerWorkCaseRollup(caseJobs);
                const latestCaseJob = caseJobs[0] ?? null;
                const latestActivityLabel = latestCaseJob
                  ? formatDate(latestCaseJob.scheduled_date ?? latestCaseJob.created_at)
                  : null;
                const visitCount = serviceCaseVisitCounts.get(caseId) ?? caseJobs.length;

                return (
                  <div
                    key={caseId}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Service Case</span>
                        <span className="font-mono text-xs font-semibold text-slate-700">{String(caseId).slice(0, 8)}</span>
                        <span
                          className={[
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            caseRollupBadgeClass(caseRollup.state),
                          ].join(" ")}
                        >
                          {caseRollup.label}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {visitCount} visit{visitCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      {latestActivityLabel ? (
                        <div className="text-xs font-medium text-slate-500">Latest {latestActivityLabel}</div>
                      ) : null}
                    </div>

                    <div className="relative space-y-1.5 px-2 py-2 before:absolute before:bottom-2 before:left-4 before:top-2 before:w-px before:bg-slate-200 sm:px-3">
                      {caseJobs.map((job) => {
                        const isArchived = Boolean(job.deleted_at);
                        const isCancelled = normalizeLifecycleStatus(job.status) === "cancelled";
                        const address = formatCustomerWorkAddress(job);
                        const jobReference = formatJobDisplayReference({
                          jobDisplayNumber: job.job_display_number ?? null,
                          jobId: job.id,
                        });
                        const jobStatusLabel = customerWorkJobStatusLabel(job);
                        const contractorName = jobContractorName(job.contractors);
                        const assignedTeam = activeAssignmentDisplayMap[String(job.id ?? "")] ?? [];
                        const primaryAssignee = assignedTeam.find((assignee) => assignee.is_primary) ?? assignedTeam[0] ?? null;
                        const failureReason = formatCustomerWorkFailureReason(job);

                        return (
                          <div
                            key={job.id}
                            className={[
                              "relative ml-3 rounded-lg border px-3 py-2.5 sm:ml-4 sm:min-h-[72px] sm:px-3.5",
                              isArchived || isCancelled
                                ? "border-slate-200 bg-slate-50/80"
                                : "border-slate-200 bg-white hover:border-slate-300",
                            ].join(" ")}
                          >
                            <span className="absolute -left-[21px] top-4 h-2 w-2 rounded-full border border-slate-300 bg-white sm:-left-[25px]" />
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 space-y-1">
                                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
                                  <span>{formatDate(job.scheduled_date ?? job.created_at)}</span>
                                  <span className="text-slate-300">&middot;</span>
                                  <span>{jobReference}</span>
                                  <span className="text-slate-300">&middot;</span>
                                  <span className="break-words">{normalizeRetestLinkedJobTitle(job.title) || "Untitled Job"}</span>
                                  <span
                                    className={[
                                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                      opsBadgeClass(job.ops_status),
                                    ].join(" ")}
                                  >
                                    {jobStatusLabel}
                                  </span>
                                  {maintenanceAgreementsEnabled && planLinkedJobIds.has(String(job.id ?? "")) ? (
                                    <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                                      Service Plan
                                    </span>
                                  ) : null}
                                </div>

                                <div className="text-sm text-slate-600">
                                  {address || "Location unavailable"}
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                  {contractorName ? (
                                    <span>Contractor: {contractorName}</span>
                                  ) : null}
                                  {contractorName && primaryAssignee ? <span className="text-slate-300">&middot;</span> : null}
                                  {primaryAssignee ? (
                                    <span>Assigned: {formatCustomerWorkPersonName(primaryAssignee.display_name)}</span>
                                  ) : null}
                                  {failureReason ? (
                                    <span
                                      className={[
                                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                        normalizeOpsStatus(job.ops_status) === "pending_office_review"
                                          ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                                          : "border-red-200 bg-red-50 text-red-800",
                                      ].join(" ")}
                                    >
                                      {failureReason}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <Link
                                href={isInternalViewer ? `/jobs/${job.id}` : `/portal/jobs/${job.id}`}
                                className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 sm:mt-0.5"
                              >
                                Open Job
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {ungroupedJobs.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="text-sm font-semibold text-navy">Other Visits</div>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {ungroupedJobs.length} visit{ungroupedJobs.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">Jobs not connected to a service case yet.</div>
                  </div>

                  <div className="space-y-1.5 px-2 py-2 sm:px-3">
                    {ungroupedJobs.map((job) => {
                      const isArchived = Boolean(job.deleted_at);
                      const isCancelled = normalizeLifecycleStatus(job.status) === "cancelled";
                      const address = formatCustomerWorkAddress(job);
                      const jobReference = formatJobDisplayReference({
                        jobDisplayNumber: job.job_display_number ?? null,
                        jobId: job.id,
                      });
                      const jobStatusLabel = customerWorkJobStatusLabel(job);
                      const contractorName = jobContractorName(job.contractors);
                      const assignedTeam = activeAssignmentDisplayMap[String(job.id ?? "")] ?? [];
                      const primaryAssignee = assignedTeam.find((assignee) => assignee.is_primary) ?? assignedTeam[0] ?? null;
                      const failureReason = formatCustomerWorkFailureReason(job);

                      return (
                        <div
                          key={job.id}
                          className={[
                            "rounded-lg border px-3 py-2.5 sm:min-h-[72px] sm:px-3.5",
                            isArchived || isCancelled
                              ? "border-slate-200 bg-slate-50/80"
                              : "border-slate-200 bg-white hover:border-slate-300",
                          ].join(" ")}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
                                <span>{formatDate(job.scheduled_date ?? job.created_at)}</span>
                                <span className="text-slate-300">&middot;</span>
                                <span>{jobReference}</span>
                                <span className="text-slate-300">&middot;</span>
                                <span className="break-words">{normalizeRetestLinkedJobTitle(job.title) || "Untitled Job"}</span>
                                <span
                                  className={[
                                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                    opsBadgeClass(job.ops_status),
                                  ].join(" ")}
                                >
                                  {jobStatusLabel}
                                </span>
                                {maintenanceAgreementsEnabled && planLinkedJobIds.has(String(job.id ?? "")) ? (
                                  <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                                    Service Plan
                                  </span>
                                ) : null}
                              </div>

                              <div className="text-sm text-slate-600">
                                {address || "Location unavailable"}
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                {contractorName ? <span>Contractor: {contractorName}</span> : null}
                                {contractorName && primaryAssignee ? <span className="text-slate-300">&middot;</span> : null}
                                {primaryAssignee ? (
                                  <span>Assigned: {formatCustomerWorkPersonName(primaryAssignee.display_name)}</span>
                                ) : null}
                                {failureReason ? (
                                  <span
                                    className={[
                                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                      normalizeOpsStatus(job.ops_status) === "pending_office_review"
                                        ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                                        : "border-red-200 bg-red-50 text-red-800",
                                    ].join(" ")}
                                  >
                                    {failureReason}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <Link
                              href={isInternalViewer ? `/jobs/${job.id}` : `/portal/jobs/${job.id}`}
                              className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 sm:mt-0.5"
                            >
                              Open Job
                            </Link>
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

        {/* Estimates — internal only, visible when ENABLE_ESTIMATES is on */}
        {isInternalViewer && estimatesEnabled ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-navy">Estimates</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Draft and sent estimates for this customer.
              </p>
            </div>

            {customerEstimates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="text-sm text-slate-500">No estimates yet.</p>
                <Link
                  href={`/estimates/new?customer_id=${customerId}`}
                  className="mt-3 inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
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
                      className="shrink-0 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
                    >
                      View
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
        </WorkspaceTabPanel>

        {/* Maintenance Agreements — internal only, visible when ENABLE_MAINTENANCE_AGREEMENTS is on */}
        <WorkspaceTabPanel id="service-plans">
        {isInternalViewer && maintenanceAgreementsEnabled ? (
          <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-navy">Maintenance Agreements</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Active and upcoming maintenance agreements for this customer.
              </p>
            </div>

            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-navy">Service Plan Overview</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Plan status and billing-period health at a glance.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Active Plans</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{activeServicePlanCount}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Next Due</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{nextServicePlanDueDate ? formatDate(nextServicePlanDueDate) : "Not scheduled"}</div>
                </div>
                {billingPeriodsNeedingAttentionCount > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Billing Attention</div>
                    <div className="mt-1 text-base font-semibold text-slate-900">{billingPeriodsNeedingAttentionCount}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      {linkedBillingPeriodCount} linked • {paidBillingPeriodCount} paid
                    </div>
                  </div>
                ) : null}
                {overdueServicePlanCount > 0 || notScheduledServicePlanCount > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Scheduling</div>
                    <div className="mt-1 text-base font-semibold text-slate-900">{overdueServicePlanCount} overdue</div>
                    <div className="mt-1 text-xs text-slate-600">{notScheduledServicePlanCount} not scheduled</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mb-4">
              <ServicePlanCreateFlow
                templates={agreementTemplates}
                createAction={createAgreementAction}
                customerId={customerId}
                initialStartDate={createAgreementStartDateDefault}
                locationOptions={createAgreementLocationOptions}
                singleLocationId={createAgreementSingleLocationId}
                isAdmin={isTemplateAdmin}
                templateChecklistItems={templateChecklistItems}
              />
            </div>

            {customerAgreements.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="text-sm text-slate-500">No maintenance agreements yet.</p>
                <p className="mt-1 text-xs text-slate-400">Use the Add service plan button above to create one.</p>
              </div>
            ) : (
              <CustomerServicePlanWorkspace
                plans={customerServicePlanNavItems}
                initialSelectedId={defaultCustomerServicePlanId}
              >
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
                  const checklistRollup = agreementChecklistRollupById.get(agr.id) ?? null;
                  const agrChecklistItems = agreementChecklistItemsById.get(agr.id) ?? [];
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
                  const statusBadgeClass: Record<string, string> = {
                    active: "border-emerald-200 bg-emerald-50 text-emerald-700",
                    draft: "border-slate-200 bg-slate-100 text-slate-500",
                    paused: "border-amber-200 bg-amber-50 text-amber-700",
                    cancelled: "border-red-200 bg-red-50 text-red-600",
                    expired: "border-slate-200 bg-slate-100 text-slate-500",
                  };
                  const statusBadge =
                    statusBadgeClass[String(agr.status).toLowerCase()] ??
                    "border-slate-200 bg-slate-100 text-slate-500";
                  const statusLabel: Record<string, string> = {
                    active: "Active",
                    draft: "Draft",
                    paused: "Paused",
                    cancelled: "Cancelled",
                    expired: "Expired",
                  };
                  const agrStatusLabel =
                    statusLabel[String(agr.status).toLowerCase()] ??
                    String(agr.status).replace(/_/g, " ");
                  const agreementBillingPeriods = billingPeriodsByAgreementId.get(agr.id) ?? [];

                  return (
                    <CustomerServicePlanDetail key={agr.id} id={agr.id}>
                    <div
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
                              {agrStatusLabel}
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
                          {visitLinkSummary && visitLinkSummary.total_links > 0 ? (
                            <div className="text-xs text-slate-400">
                              {visitLinkSummary.used_visits} of {visitLinkSummary.total_links}{" "}
                              {visitLinkSummary.total_links === 1 ? "visit" : "visits"} used
                            </div>
                          ) : null}
                          {checklistRollup && checklistRollup.total_items > 0 ? (
                            <div className="text-xs text-slate-400">
                              Last visit: {checklistRollup.completed_items}/{checklistRollup.total_items} checklist items completed
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {dueState !== "inactive" ? (
                            agr.next_due_date ? (
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
                            )
                          ) : null}
                          {agr.status !== "cancelled" && agr.status !== "expired" ? (
                            <Link
                              href={`/jobs/new?source=customer&customer_id=${customerId}&maintenance_agreement_id=${agr.id}`}
                              className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Create Work Order
                            </Link>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 space-y-3">

                      {maintenanceAgreementSaved === "created" && maintenanceAgreementFocusId === agr.id && agr.status === "active" ? (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-3">
                          <p className="text-sm text-blue-900">
                            Plan created. Ready to schedule the first visit?
                          </p>
                          <Link
                            href={`/jobs/new?source=customer&customer_id=${customerId}&maintenance_agreement_id=${agr.id}`}
                            className="inline-flex items-center rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700"
                          >
                            Create Work Order
                          </Link>
                        </div>
                      ) : null}

                      <Disclosure
                        title="Plan details"
                        subtitle="Dates, location, included work, checklist, and template source."
                        className="mt-3"
                      >
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
                          <SectionEyebrow>What&apos;s Included</SectionEyebrow>
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

                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                          <SectionEyebrow>Checklist</SectionEyebrow>
                          {agrChecklistItems.length > 0 ? (
                            <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                              {agrChecklistItems.map((item) => (
                                <li key={item.id}>
                                  <div className="font-medium text-slate-900">{item.item_label}</div>
                                  {item.default_guidance ? (
                                    <div className="text-slate-600">
                                      {item.default_guidance.length > 120
                                        ? `${item.default_guidance.slice(0, 120).trimEnd()}...`
                                        : item.default_guidance}
                                    </div>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="mt-2 text-xs text-slate-500">
                              No checklist items saved for this plan yet.
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
                      </Disclosure>

                      <Disclosure
                        title="Billing"
                        subtitle={`${agreementBillingPeriods.length} billing ${agreementBillingPeriods.length === 1 ? "period" : "periods"}`}
                        className="mt-3"
                      >
                        <div>
                          <SectionEyebrow>Billing Periods</SectionEyebrow>
                          <p className="mt-1 text-xs text-slate-500">
                            Read status first, then open advanced controls only when needed.
                          </p>
                          <Disclosure title="What do these mean?" variant="flush" className="mt-2">
                            <div className="space-y-1 text-xs text-slate-500">
                              <div>Billing periods are for billing visibility only and do not control service visits.</div>
                              <div>Work orders, visits, next due date, and visit counting continue independently of billing period status.</div>
                            </div>
                          </Disclosure>
                        </div>

                        {canManageBillingPeriods ? (
                          <Disclosure title="Add Billing Period" className="mt-3">
                            <form action={createBillingPeriodAction} className="grid gap-3 md:grid-cols-2">
                              <input type="hidden" name="maintenance_agreement_id" value={agr.id} />

                              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 md:col-span-2">
                                Coverage
                              </div>
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

                              <div className="md:col-span-2">
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

                              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 md:col-span-2">
                                Amount
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

                              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 md:col-span-2">
                                Status
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

                              <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-medium text-slate-700">Billing Due Date (Optional)</label>
                                <input
                                  type="date"
                                  name="billing_due_date"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div className="md:col-span-2">
                                <Disclosure title="What do these postures mean?" variant="flush">
                                  <div className="space-y-1 text-xs text-slate-500">
                                    <div>Create a billing period record only. This does not generate or link an invoice.</div>
                                    <div>Billing periods are for billing visibility only and do not control service visits.</div>
                                    <div>Internal invoice: Tracks a period intended for internal invoicing later. No invoice is created here.</div>
                                    <div>External off-platform: Use when billing is handled outside Compliance Matters.</div>
                                    <div>Manual: Use for internally tracked manual commercial handling without invoice linkage.</div>
                                    <div>No charge: Use for zero-dollar coverage.</div>
                                    <div>Waived: Use when charges are waived and a reason should be recorded.</div>
                                    <div>Not billed through Compliance Matters: Use when coverage is tracked here but billing happens elsewhere.</div>
                                  </div>
                                </Disclosure>
                              </div>

                              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 md:col-span-2">
                                Reference
                              </div>
                              <div className="md:col-span-2">
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

                              <div className="md:col-span-2">
                                <button
                                  type="submit"
                                  className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                                >
                                  Add Billing Period
                                </button>
                              </div>
                            </form>
                          </Disclosure>
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
                                    <Disclosure title="Advanced Billing Period Actions" className="mt-3">
                                      <div className="space-y-2">
                                      {!billingPeriod.internal_invoice_id ? (
                                        <Disclosure title="Edit Billing Period">
                                          <form action={updateBillingPeriodAction} className="grid gap-3 md:grid-cols-2">
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
                                                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                                              >
                                                Save Billing Period
                                              </button>
                                            </div>
                                          </form>
                                        </Disclosure>
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
                                    </Disclosure>
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
                      </Disclosure>

                      <Disclosure
                        title="Manage plan"
                        subtitle="Edit plan details or use lifecycle controls."
                        className="mt-3"
                      >
                        <form action={updateAgreementAction} className="grid gap-3 md:grid-cols-2">
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
                                <label className="mb-1 block text-xs font-medium text-slate-700">What&apos;s Included (Optional)</label>
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
                              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                            >
                              Save Changes
                            </button>
                          </div>
                        </form>
                        <ServicePlanTerminalActions
                          agreementId={agr.id}
                          status={String(agr.status ?? "")}
                          cancelAction={cancelMaintenanceAgreementFromForm}
                          deleteAction={deleteMaintenanceAgreementDraftFromForm}
                        />
                      </Disclosure>
                      </div>
                    </div>
                    </CustomerServicePlanDetail>
                  );
                })}
              </CustomerServicePlanWorkspace>
            )}
          </section>
        ) : null}
        </WorkspaceTabPanel>

        <WorkspaceTabPanel id="settings">
        {isInternalViewer ? (
          <Disclosure
            title="Danger Zone"
            subtitle="Archive this customer record after all related jobs have been removed or archived."
            variant="danger"
          >
            <form action={archiveCustomerFromForm}>
              <input type="hidden" name="customer_id" value={customerId} />
              <button
                type="submit"
                className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100"
              >
                Archive Customer
              </button>
            </form>
          </Disclosure>
        ) : null}
        </WorkspaceTabPanel>
      </div>
      </WorkspaceTabsProvider>
      </div>
    </div>
  );
}
