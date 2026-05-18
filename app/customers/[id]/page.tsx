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
  MAINTENANCE_AGREEMENT_FREQUENCIES,
  MAINTENANCE_AGREEMENT_STATUSES,
  MAINTENANCE_AGREEMENT_TYPES,
  listMaintenanceAgreementsForCustomer,
  summarizeMaintenanceAgreementVisitLinksForAgreement,
  classifyMaintenanceAgreementDueState,
  type MaintenanceAgreementVisitLinkSummary,
  type MaintenanceAgreementRow,
} from "@/lib/maintenance-agreements/read-model";
import VisitScopeBuilder from "@/components/jobs/VisitScopeBuilder";
import { sanitizeVisitScopeItems } from "@/lib/jobs/visit-scope";
import { formatDateOnlyDisplay, formatTimestampDateDisplayLA } from "@/lib/utils/schedule-la";
import { formatPersonDisplayName } from "@/lib/utils/identity-display";


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
  searchParams?: Promise<{ err?: string; maSaved?: string; maError?: string; maFocus?: string }>;
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
      postal_code
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
  const customerBillingAddress = billingAddressLine(customer);

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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-7 p-4 md:space-y-8 md:p-6">
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
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Entity Workspace</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                {customerDisplayName(customer)}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Customer Command Center
              </p>
            </div>

            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-white/70 p-2 text-xs text-slate-600">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {locations.length} location{locations.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {jobs.length} job{jobs.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {activeJobs.length} active job{activeJobs.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                Last scheduled:{" "}
                {formatDate(lastScheduledActiveDate)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 rounded-xl border border-slate-200 bg-white/85 p-3 md:items-end">
            {isInternalViewer ? (
              <div className="flex flex-wrap gap-2">
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
                  New Job for Customer
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6 md:space-y-7">

        {/* Open status summary */}
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

        {/* Overview */}
        <section className="grid gap-6 xl:grid-cols-[1.25fr_.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Customer Overview
              </h2>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              This is the account/customer contact. Site contact or tenant details may differ by job.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Phone
                </div>
                <div className="text-sm text-slate-900">
                  {customer.phone ? formatPhone(customer.phone) : "—"}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Email
                </div>
                <div className="text-sm text-slate-900 break-all">
                  {customer.email ?? "—"}
                </div>
              </div>

              <div className="space-y-1 md:col-span-2">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Billing Address
                </div>
                {customerBillingAddress ? (
                  <div className="text-sm text-slate-900">{customerBillingAddress}</div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="text-sm font-medium text-slate-700">No billing address set</div>
                    {serviceAddressFallback ? (
                      <div className="text-sm text-slate-500">
                        Service address available from {serviceAddressFallback.label}: {serviceAddressFallback.address}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">Add a billing address on the customer record to use it everywhere billing stays strict and canonical.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Summary</h2>

            <div className="mt-4 flex flex-wrap gap-2">
              {callHref ? (
                <a
                  href={callHref}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Call Customer
                </a>
              ) : null}

              {smsHref ? (
                <a
                  href={smsHref}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Open SMS App
                </a>
              ) : null}

              {customer.email ? (
                <a
                  href={`mailto:${customer.email}`}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Email Customer
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
        </section>

        {isInternalViewer ? (
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

        {/* Locations */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Locations</h2>
              <p className="text-sm text-slate-500">
                All service addresses associated with this customer.
              </p>
            </div>
          </div>

          {locations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              No locations on file yet.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {locations.map((loc) => {
                const locId = String(loc.id ?? loc.location_id ?? "");
                const address = locationAddressLine(loc);
                const mapsHref = makeMapsHref(address);

                return (
                  <div
                    key={locId}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  >
                    <div className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {locationDisplayName(loc)}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {address || "No address on file"}
                          </div>
                        </div>

                        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                          {jobsByLocationCount.get(locId) ?? 0} active job
                          {(jobsByLocationCount.get(locId) ?? 0) === 1 ? "" : "s"}
                        </div>
                      </div>

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
                            View Location
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

        {/* Job history */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Job History</h2>
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
                    className="space-y-4 rounded-[1.75rem] border border-slate-300/80 bg-gradient-to-br from-slate-100 via-white to-slate-50 p-3 shadow-sm sm:p-4"
                  >
                    <div className="rounded-2xl border border-slate-300 bg-white/95 p-4 shadow-sm">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
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
                        {serviceCase?.problem_summary ? (
                          <div className="max-w-3xl text-sm leading-6 text-slate-700">
                            {String(serviceCase.problem_summary).slice(0, 100)}
                            {String(serviceCase.problem_summary).length > 100 ? "..." : ""}
                          </div>
                        ) : null}
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
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                              <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Link
                                    href={isInternalViewer ? `/jobs/${job.id}` : `/portal/jobs/${job.id}`}
                                    className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                                  >
                                    {normalizeRetestLinkedJobTitle(job.title) || `Job ${job.id.slice(0, 8)}`}
                                  </Link>

                                  <span
                                    className={[
                                      "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                                      opsBadgeClass(job.ops_status),
                                    ].join(" ")}
                                  >
                                    {opsStatusLabel(job.ops_status)}
                                  </span>

                                  {isCancelled && !isArchived ? (
                                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                                      Cancelled
                                    </span>
                                  ) : null}

                                  {isArchived ? (
                                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                                      Archived
                                    </span>
                                  ) : null}
                                </div>

                                <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                                  <div>
                                    <span className="font-medium text-slate-700">Job ID:</span>{" "}
                                    <span className="font-mono text-xs">{job.id.slice(0, 8)}&hellip;</span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-slate-700">Address:</span>{" "}
                                    {address || "—"}
                                  </div>
                                  <div>
                                    <span className="font-medium text-slate-700">Scheduled:</span>{" "}
                                    {formatDate(job.scheduled_date)}
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
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
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={isInternalViewer ? `/jobs/${job.id}` : `/portal/jobs/${job.id}`}
                                  className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                                >
                                  {normalizeRetestLinkedJobTitle(job.title) || `Job ${job.id.slice(0, 8)}`}
                                </Link>

                                <span
                                  className={[
                                    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                                    opsBadgeClass(job.ops_status),
                                  ].join(" ")}
                                >
                                  {opsStatusLabel(job.ops_status)}
                                </span>

                                {isCancelled && !isArchived ? (
                                  <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                                    Cancelled
                                  </span>
                                ) : null}

                                {isArchived ? (
                                  <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                                    Archived
                                  </span>
                                ) : null}
                              </div>

                              <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                                <div>
                                  <span className="font-medium text-slate-700">Job ID:</span>{" "}
                                  <span className="font-mono text-xs">{job.id.slice(0, 8)}&hellip;</span>
                                </div>
                                <div>
                                  <span className="font-medium text-slate-700">Address:</span>{" "}
                                  {address || "—"}
                                </div>
                                <div>
                                  <span className="font-medium text-slate-700">Scheduled:</span>{" "}
                                  {formatDate(job.scheduled_date)}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
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

        {/* Estimates — internal only, visible when ENABLE_ESTIMATES is on */}
        {isInternalViewer && estimatesEnabled ? (
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
        {isInternalViewer && maintenanceAgreementsEnabled ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Maintenance Agreements</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Active and upcoming maintenance agreements for this customer.
              </p>
            </div>

            <details className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-900">
                Add Maintenance Agreement
              </summary>
              <form action={createAgreementAction} className="mt-4 grid gap-3 md:grid-cols-2">
                <input type="hidden" name="customer_id" value={customerId} />

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
                    defaultValue="maintenance"
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
                    defaultValue="quarterly"
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
                    initialSummary=""
                    initialItems={[]}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700">Internal Notes (Optional)</label>
                  <textarea
                    name="internal_notes"
                    rows={3}
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
                      </div>

                      <details className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                          Edit Details
                        </summary>
                        <form action={updateAgreementAction} className="mt-3 grid gap-3 md:grid-cols-2">
                          <input type="hidden" name="agreement_id" value={agr.id} />
                          <input type="hidden" name="customer_id" value={customerId} />

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

        {isInternalViewer ? (
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
