import Link from "next/link";
import { redirect } from "next/navigation";

import { markInvoiceCompleteFromForm } from "@/lib/actions/job-ops-actions";
import {
  rejectFieldPaymentCollectionReportFromForm,
  verifyFieldPaymentCollectionReportFromForm,
} from "@/lib/actions/internal-invoice-payment-actions";
import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import { canViewFinancialRegister } from "@/lib/auth/financial-access";
import { resolveFieldBillingCapabilities } from "@/lib/auth/field-billing-access";
import { loadFieldBillingExplicitCapabilitiesForUser } from "@/lib/auth/internal-user-access-capabilities";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { buildBillingTruthCloseoutProjectionMap } from "@/lib/business/job-billing-state";
import { listFieldPaymentCollectionReportsForReconciliation } from "@/lib/business/field-payment-reconciliation-read-model";
import { resolveContractorResponsibleDisplay } from "@/lib/ops/contractor-responsible-display";
import {
  canShowExternalInvoiceSentAction,
  listCloseoutQueueJobs,
  sortCloseoutQueueJobs,
} from "@/lib/ops/closeout-queue";
import SubmitButton from "@/components/SubmitButton";
import ContractorFilter from "./_components/ContractorFilter";
import CloseoutSubmitButton from "./_components/CloseoutSubmitButton";
import { getActiveJobAssignmentDisplayMap } from "@/lib/staffing/human-layer";
import { getCloseoutNeeds, getCloseoutQueueNextStepLabel } from "@/lib/utils/closeout";
import { formatBusinessDateUS, formatTimestampDateDisplayLA } from "@/lib/utils/schedule-la";
import { formatEccOpsStatusLabel } from "@/lib/ecc/ecc-workflow-display";
import { withJobsBillingDispositionSelectFallback } from "@/lib/supabase/jobs-billing-disposition-compat";

const baseSelect =
  "id, title, status, job_type, ops_status, field_complete, field_complete_at, certs_complete, invoice_complete, billing_disposition, permit_number, scheduled_date, city, job_address, customer_first_name, customer_last_name, customer_phone, contractor_id, contractors(name), customer_id, location_id, created_at, next_action_note, action_required_by, visit_scope_summary";
const baseSelectCompat =
  "id, title, status, job_type, ops_status, field_complete, field_complete_at, certs_complete, invoice_complete, permit_number, scheduled_date, city, job_address, customer_first_name, customer_last_name, customer_phone, contractor_id, contractors(name), customer_id, location_id, created_at, next_action_note, action_required_by, visit_scope_summary";

type CloseoutFilter = "all" | "invoice_required" | "paperwork_required" | "failed_review" | "confirm_payment";
type CloseoutSort = "newest" | "oldest" | "contractor";
type CloseoutNotice = "external_billing_complete" | "external_invoice_sent" | "";

function normalizeFilter(value?: string | null): CloseoutFilter {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "invoice_required") return "invoice_required";
  if (normalized === "paperwork_required") return "paperwork_required";
  if (normalized === "failed_review") return "failed_review";
  if (normalized === "confirm_payment") return "confirm_payment";
  return "all";
}

function normalizeSort(value?: string | null): CloseoutSort {
  if (String(value ?? "").trim().toLowerCase() === "contractor") return "contractor";
  return String(value ?? "").trim().toLowerCase() === "oldest" ? "oldest" : "newest";
}

function normalizeNotice(value?: string | null): CloseoutNotice {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "external_billing_complete") return "external_billing_complete";
  if (normalized === "external_invoice_sent") return "external_invoice_sent";
  return "";
}

function digitsOnly(v?: string | null) {
  return String(v ?? "").replace(/\D/g, "");
}

function telHref(phone?: string | null) {
  const p = digitsOnly(phone);
  return p ? `tel:${p}` : "";
}

function smsHref(phone?: string | null) {
  const p = digitsOnly(phone);
  return p ? `sms:${p}` : "";
}

function customerDisplayName(j: any) {
  const first = String(j?.customer_first_name ?? "").trim();
  const last = String(j?.customer_last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || "Unnamed Customer";
}

function addressLine(j: any) {
  const addr = String(j?.job_address ?? "").trim();
  const city = String(j?.city ?? "").trim();
  if (addr && city) return `${addr}, ${city}`;
  return addr || city || "No address";
}

function contractorDisplayName(j: any, internalBusinessDisplayName: string) {
  const contractor = Array.isArray(j?.contractors) ? j.contractors[0] : j?.contractors;
  return resolveContractorResponsibleDisplay({
    contractorName: contractor?.name,
    internalBusinessDisplayName,
  }).label;
}

function jobTitle(j: any) {
  return String(j?.title ?? "").trim() || `Job ${String(j?.id ?? "").slice(0, 8)}`;
}

function jobTypeBadge(j: any) {
  const t = String(j?.job_type ?? "").toLowerCase();
  if (t === "ecc") return { label: "ECC", cls: "border-slate-200 bg-slate-50 text-slate-600" };
  if (t === "service") return { label: "Service", cls: "border-slate-200 bg-slate-50 text-slate-600" };
  return null;
}

function closeoutReasonLabel(job: any, needs: ReturnType<typeof getCloseoutNeeds>) {
  const ops = String(job?.ops_status ?? "").toLowerCase();
  if (ops === "failed" || ops === "retest_needed" || ops === "pending_office_review") {
    return formatEccOpsStatusLabel(ops, "internal") ?? "Failed / Correction Required";
  }
  if (needs.needsInvoice && needs.needsCerts) return "Invoice and paperwork required";
  if (needs.needsInvoice) return "Invoice required";
  if (needs.needsCerts) return "Paperwork required";
  return "Closeout follow-up";
}

function followUpLabel(projection: any) {
  return getCloseoutQueueNextStepLabel(projection);
}

function formatUsdFromCents(cents: number | null | undefined) {
  const amount = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatReconciliationStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "under_review") return "Under Review";
  if (normalized === "needs_correction") return "Needs Correction";
  return "Reported";
}

function formatMethodLabel(method: string | null | undefined) {
  const normalized = String(method ?? "").trim().toLowerCase();
  if (normalized === "cash") return "Cash";
  if (normalized === "check") return "Check";
  if (normalized === "other") return "Other";
  return "Other";
}

function formatReportedAt(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";
  return formatTimestampDateDisplayLA(normalized) || "-";
}

function parseDateOnlyYmd(value?: string | null): Date | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function resolveOverdueDays(job: any) {
  const fieldCompleteAt = String(job?.field_complete_at ?? "").trim();
  const fieldCompleteDate = fieldCompleteAt ? new Date(fieldCompleteAt) : null;
  const scheduledDate = parseDateOnlyYmd(job?.scheduled_date);
  const baseline =
    fieldCompleteDate && Number.isFinite(fieldCompleteDate.getTime()) ? fieldCompleteDate : scheduledDate;

  if (!baseline || !Number.isFinite(baseline.getTime())) return null;

  const elapsedMs = Date.now() - baseline.getTime();
  if (elapsedMs < 0) return 0;
  return Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
}

const labelClass = "text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400";
const subtleChipClass =
  "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600";
const compactActionClass =
  "inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";
const primaryActionClass =
  "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1";

export default async function CloseoutQueuePage({
  searchParams,
}: {
  searchParams?: Promise<{ contractor?: string; filter?: string; sort?: string; notice?: string }>;
}) {
  const actorContext = await getRequestActorContext();
  const supabase = actorContext.supabase;
  const user = actorContext.user;

  if (!user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: actorContext.internalUser.account_owner_user_id,
  });
  const internalBusinessDisplayName = internalBusinessIdentity.display_name;

  const explicitFieldBillingCapabilities = await loadFieldBillingExplicitCapabilitiesForUser({
    supabase: supabase as any,
    accountOwnerUserId: actorContext.internalUser.account_owner_user_id,
    internalUserId: actorContext.internalUser.user_id,
  });
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: user.id,
    internalUser: actorContext.internalUser,
    resourceAccountOwnerUserId: actorContext.internalUser.account_owner_user_id,
    explicitCapabilities: explicitFieldBillingCapabilities,
  });

  const canViewFieldPaymentReconciliationAttention =
    canViewFinancialRegister({
      actorUserId: user.id,
      internalUser: actorContext.internalUser,
      resourceAccountOwnerUserId: actorContext.internalUser.account_owner_user_id,
    }) || fieldBillingCapabilities.can_verify_non_card_collection;

  const fieldPaymentReconciliationAttention = canViewFieldPaymentReconciliationAttention
    ? await listFieldPaymentCollectionReportsForReconciliation({
        admin: supabase,
        accountOwnerUserId: actorContext.internalUser.account_owner_user_id,
        limit: 10,
      })
    : null;

  const sp = (searchParams ? await searchParams : {}) ?? {};
  const contractor = (sp.contractor ?? "").trim() || null;
  const filter = normalizeFilter(sp.filter ?? null);
  const sort = normalizeSort(sp.sort ?? null);
  const notice = normalizeNotice(sp.notice ?? null);

  const buildQueueQuery = (selectClause: string) => {
    let q = supabase
      .from("jobs")
      .select(selectClause)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("field_complete", true)
      .neq("ops_status", "closed")
      .order("created_at", { ascending: sort === "oldest" });

    if (contractor) q = q.eq("contractor_id", contractor);
    return q;
  };

  const { data, error } = await withJobsBillingDispositionSelectFallback<any[]>({
    runPrimary: () => buildQueueQuery(baseSelect),
    runCompat: () => buildQueueQuery(baseSelectCompat),
  });
  if (error) throw error;

  const sourceJobs = data ?? [];

  const { projectionsByJobId } = await buildBillingTruthCloseoutProjectionMap({
    supabase,
    accountOwnerUserId: actorContext.internalUser.account_owner_user_id,
    jobs: sourceJobs.map((job: any) => ({
      id: String(job?.id ?? "").trim(),
      field_complete: job?.field_complete,
      job_type: job?.job_type,
      ops_status: job?.ops_status,
      permit_number: job?.permit_number,
      invoice_complete: job?.invoice_complete,
      billing_disposition: job?.billing_disposition,
      certs_complete: job?.certs_complete,
    })),
  });

  const getProjection = (job: any) => projectionsByJobId.get(String(job?.id ?? "").trim()) ?? job;
  const closeoutJobs = listCloseoutQueueJobs(sourceJobs, getProjection);
  const contractorOptions = Array.from(
    new Map(
      closeoutJobs
        .map((job: any) => {
          const id = String(job?.contractor_id ?? "").trim();
          const contractor = Array.isArray(job?.contractors) ? job.contractors[0] : job?.contractors;
          const name = String(contractor?.name ?? "").trim();
          return id && name ? [id, name] as const : null;
        })
        .filter(Boolean)
        .map((entry) => entry as readonly [string, string]),
    ).entries(),
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const assignmentDisplayMap = await getActiveJobAssignmentDisplayMap({
    supabase,
    jobIds: closeoutJobs.map((job: any) => String(job?.id ?? "")).filter(Boolean),
  });

  const enriched = closeoutJobs.map((job: any) => {
    const projection = getProjection(job);
    const needs = getCloseoutNeeds(projection);
    const ops = String(job?.ops_status ?? "").toLowerCase();
    const overdueDays = resolveOverdueDays(job);
    const canMarkExternalInvoiceSent = canShowExternalInvoiceSentAction({
      needsInvoice: needs.needsInvoice,
      billingState: projection.billingState,
    });

    return {
      job,
      needs,
      ops,
      overdueDays,
      canMarkExternalInvoiceSent,
    };
  });

  const visibleRows = sortCloseoutQueueJobs(
    enriched.filter((row) => {
      if (filter === "confirm_payment") return false;
      if (filter === "invoice_required") return row.needs.needsInvoice;
      if (filter === "paperwork_required") return row.needs.needsCerts;
      if (filter === "failed_review") {
        return (
          row.ops === "failed" || row.ops === "retest_needed" || row.ops === "pending_office_review"
        );
      }
      return true;
    }),
    sort,
    (row) => contractorDisplayName(row.job, internalBusinessDisplayName),
    (row) => String(row.job?.created_at ?? ""),
    (row) => String(row.job?.id ?? ""),
  );

  const openFieldPaymentItems = canViewFieldPaymentReconciliationAttention
    ? fieldPaymentReconciliationAttention?.items ?? []
    : [];
  const openFieldPaymentCount = canViewFieldPaymentReconciliationAttention
    ? fieldPaymentReconciliationAttention?.summary.openCount ?? 0
    : 0;
  const showConfirmPaymentFilter = canViewFieldPaymentReconciliationAttention && openFieldPaymentCount > 0;
  const visibleFieldPaymentItems =
    canViewFieldPaymentReconciliationAttention && (filter === "all" || filter === "confirm_payment")
      ? openFieldPaymentItems
      : [];

  const summary = {
    total: enriched.length,
    invoiceRequired: enriched.filter((row) => row.needs.needsInvoice).length,
    paperworkRequired: enriched.filter((row) => row.needs.needsCerts).length,
    failedReview: enriched.filter(
      (row) =>
        row.ops === "failed" || row.ops === "retest_needed" || row.ops === "pending_office_review",
    ).length,
    overdue: enriched.filter((row) => (row.overdueDays ?? -1) >= 1).length,
  };

  const baseHref = contractor ? `/ops/closeout-queue?contractor=${encodeURIComponent(contractor)}` : "/ops/closeout-queue";
  const currentQueueHref = `${baseHref}${contractor ? "&" : "?"}filter=${filter}&sort=${sort}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/ops"
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            <span aria-hidden="true">&larr;</span> Back to Ops
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Closeout Work Queue</h1>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
              Closeout
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Jobs that need billing, paperwork, report, or completion follow-up before they can fully close.
          </p>
        </div>
      </div>

      {notice === "external_billing_complete" || notice === "external_invoice_sent" ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          External billing marked complete for closeout.
        </div>
      ) : null}

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_14px_28px_-26px_rgba(15,23,42,0.35)]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50/85 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Total</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{summary.total}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/85 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Invoice Required</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{summary.invoiceRequired}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/85 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Paperwork Required</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{summary.paperworkRequired}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/85 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Failed / Correction</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{summary.failedReview}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/85 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Aging/Overdue</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{summary.overdue}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ContractorFilter contractors={contractorOptions} selectedId={contractor ?? ""} />
          <Link
            href={`${baseHref}${contractor ? "&" : "?"}filter=all&sort=${sort}`}
            className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${filter === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            All
          </Link>
          <Link
            href={`${baseHref}${contractor ? "&" : "?"}filter=invoice_required&sort=${sort}`}
            className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${filter === "invoice_required" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            Invoice Required
          </Link>
          <Link
            href={`${baseHref}${contractor ? "&" : "?"}filter=paperwork_required&sort=${sort}`}
            className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${filter === "paperwork_required" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            Paperwork Required
          </Link>
          <Link
            href={`${baseHref}${contractor ? "&" : "?"}filter=failed_review&sort=${sort}`}
            className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${filter === "failed_review" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            Failed / Correction Required
          </Link>
          {showConfirmPaymentFilter ? (
            <Link
              href={`${baseHref}${contractor ? "&" : "?"}filter=confirm_payment&sort=${sort}`}
              className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${filter === "confirm_payment" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              Confirm Payment ({openFieldPaymentCount})
            </Link>
          ) : null}

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Sort</span>
            <Link
              href={`${baseHref}${contractor ? "&" : "?"}filter=${filter}&sort=newest`}
              className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${sort === "newest" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              Newest first
            </Link>
            <Link
              href={`${baseHref}${contractor ? "&" : "?"}filter=${filter}&sort=oldest`}
              className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${sort === "oldest" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              Oldest first
            </Link>
            <Link
              href={`${baseHref}${contractor ? "&" : "?"}filter=${filter}&sort=contractor`}
              className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${sort === "contractor" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              By Contractor
            </Link>
          </div>
        </div>

        {canViewFieldPaymentReconciliationAttention ? (
          <p className="mt-3 text-xs text-slate-600">
            Check, cash, and other reported payments count as collected payment only after office confirmation.
          </p>
        ) : null}
      </section>

      {visibleRows.length === 0 && visibleFieldPaymentItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-500">No closeout work is waiting right now.</p>
          <p className="mt-1 text-xs text-slate-400">
            Completed jobs with billing, paperwork, or report follow-up will appear here.
          </p>
          <Link
            href="/ops"
            className="mt-4 inline-flex rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            Return to Ops
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleFieldPaymentItems.map((item) => {
            const isSelfReported = item.reportedByUserId === user.id;
            return (
              <article
                id={`field-payment-report-${item.reportId}`}
                key={item.reportId}
                className="rounded-xl border border-l-4 border-slate-200 border-l-violet-900/25 bg-white px-4 py-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.45)] transition-colors hover:border-slate-300 hover:border-l-violet-900/35 sm:px-5"
              >
                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(16rem,1.05fr)_minmax(15rem,0.76fr)_minmax(18rem,0.9fr)] lg:items-start lg:gap-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={item.links.jobHref}
                        className="text-[15px] font-semibold leading-5 text-slate-950 underline-offset-4 hover:text-slate-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        {item.jobTitle || item.jobReference}
                      </Link>
                      <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700">
                        Confirm Payment
                      </span>
                    </div>

                    <div className="mt-2 text-sm font-semibold text-slate-800">{item.customerDisplayName || "Customer"}</div>
                    <div className="mt-2 grid gap-1 text-sm leading-5 text-slate-500">
                      <div>
                        <span className={labelClass}>Reason</span>
                        <div className="font-medium text-slate-700">Field-reported payment needs confirmation.</div>
                      </div>
                      <div>
                        <span className={labelClass}>Invoice</span>
                        <div className="font-medium text-slate-700">{item.invoiceReference}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <div className="grid gap-1.5">
                      <span className={labelClass}>Method</span>
                      <span className={subtleChipClass}>{formatMethodLabel(item.paymentMethod)}</span>
                    </div>
                    <div className="grid gap-1.5">
                      <span className={labelClass}>Amount</span>
                      <span className={subtleChipClass}>{formatUsdFromCents(item.amountCents)}</span>
                    </div>
                    <div className="grid gap-1.5">
                      <span className={labelClass}>Reference</span>
                      <span className={subtleChipClass}>{item.reference || "-"}</span>
                    </div>
                    <div className="grid gap-1.5">
                      <span className={labelClass}>Reported By</span>
                      <span className={subtleChipClass}>{item.reportedByDisplayName}</span>
                    </div>
                    <div className="grid gap-1.5">
                      <span className={labelClass}>Reported</span>
                      <span className={subtleChipClass}>{formatReportedAt(item.reportedAt)}</span>
                    </div>
                    <div className="grid gap-1.5">
                      <span className={labelClass}>Status</span>
                      <span className={subtleChipClass}>{formatReconciliationStatus(item.status)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <span className={labelClass}>Next Step</span>
                    <p className="text-sm leading-5 text-slate-700">Field-reported payment needs confirmation.</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Link href={item.links.jobHref} className={primaryActionClass}>
                        View Job
                      </Link>
                      <Link href={item.links.invoiceWorkspaceHref} className={compactActionClass}>
                        Open invoice workspace
                      </Link>
                    </div>

                    {isSelfReported ? (
                      <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                        Reporter cannot verify their own report.
                      </div>
                    ) : (
                      <div className="mt-1 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px]">
                        <form action={verifyFieldPaymentCollectionReportFromForm} className="space-y-2">
                          <input type="hidden" name="field_payment_report_id" value={item.reportId} />
                          <input type="hidden" name="report_id" value={item.reportId} />
                          <input type="hidden" name="invoice_id" value={item.internalInvoiceId} />
                          <input type="hidden" name="job_id" value={item.jobId} />
                          <input type="hidden" name="tab" value="info" />
                          <input type="hidden" name="return_to" value={`${currentQueueHref}#field-payment-report-${item.reportId}`} />
                          <label className="block">
                            <span className="mb-1 block font-semibold text-slate-900">Verification note</span>
                            <input
                              name="verification_note"
                              type="text"
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900"
                              placeholder="Optional office confirmation details"
                            />
                          </label>
                          <p className="text-[10px] text-slate-600">Verify only after confirming the money was received.</p>
                          <CloseoutSubmitButton className={compactActionClass}>
                            Confirm Payment
                          </CloseoutSubmitButton>
                        </form>
                        <form action={rejectFieldPaymentCollectionReportFromForm} className="space-y-2">
                          <input type="hidden" name="field_payment_report_id" value={item.reportId} />
                          <input type="hidden" name="report_id" value={item.reportId} />
                          <input type="hidden" name="invoice_id" value={item.internalInvoiceId} />
                          <input type="hidden" name="job_id" value={item.jobId} />
                          <input type="hidden" name="tab" value="info" />
                          <input type="hidden" name="return_to" value={`${currentQueueHref}#field-payment-report-${item.reportId}`} />
                          <label className="block">
                            <span className="mb-1 block font-semibold text-slate-900">Rejection reason</span>
                            <input
                              name="rejection_reason"
                              type="text"
                              required
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900"
                              placeholder="Required"
                            />
                          </label>
                          <p className="text-[10px] text-slate-600">Rejecting does not record payment.</p>
                          <SubmitButton className={compactActionClass} loadingText="Rejecting...">
                            Reject Report
                          </SubmitButton>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {visibleRows.map(({ job, needs, overdueDays, canMarkExternalInvoiceSent }) => {
            const jobId = String(job?.id ?? "");
            const projection = getProjection(job);
            const title = jobTitle(job);
            const customerName = customerDisplayName(job);
            const location = addressLine(job);
            const contractorName = contractorDisplayName(job, internalBusinessDisplayName);
            const phone = String(job?.customer_phone ?? "").trim();
            const badge = jobTypeBadge(job);
            const scheduledDate = formatBusinessDateUS(String(job?.scheduled_date ?? ""));
            const completedDate = formatTimestampDateDisplayLA(String(job?.field_complete_at ?? ""));
            const reason = closeoutReasonLabel(job, needs);
            const assignments = assignmentDisplayMap[jobId] ?? [];
            const assignmentSummary = assignments.length
              ? assignments.slice(0, 2).map((item) => item.display_name).join(", ")
              : "Unassigned";

            return (
              <article
                id={`job-${jobId}`}
                key={jobId}
                className="rounded-xl border border-l-4 border-slate-200 border-l-violet-900/25 bg-white px-4 py-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.45)] transition-colors hover:border-slate-300 hover:border-l-violet-900/35 sm:px-5"
              >
                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(16rem,1.05fr)_minmax(15rem,0.76fr)_minmax(18rem,0.9fr)] lg:items-start lg:gap-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/jobs/${jobId}?tab=ops`}
                        className="text-[15px] font-semibold leading-5 text-slate-950 underline-offset-4 hover:text-slate-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        {title}
                      </Link>
                      {badge ? (
                        <span
                          className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      ) : null}
                      <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700">
                        {reason}
                      </span>
                    </div>

                    <div className="mt-2 text-sm font-semibold text-slate-800">{customerName}</div>
                    <div className="mt-2 grid gap-1 text-sm leading-5 text-slate-500">
                      <div>
                        <span className={labelClass}>Location</span>
                        <div className="font-medium text-slate-700">{location}</div>
                      </div>
                      <div>
                        <span className={labelClass}>Contractor</span>
                        <div className="font-medium text-slate-700">{contractorName}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <div className="grid gap-1.5">
                      <span className={labelClass}>Scheduled</span>
                      <span className={subtleChipClass}>{scheduledDate || "Not scheduled"}</span>
                    </div>
                    <div className="grid gap-1.5">
                      <span className={labelClass}>Completed</span>
                      <span className={subtleChipClass}>{completedDate || "Not captured"}</span>
                    </div>
                    <div className="grid gap-1.5">
                      <span className={labelClass}>Assigned Tech/Team</span>
                      <span className={subtleChipClass}>{assignmentSummary}</span>
                    </div>
                    {overdueDays != null && overdueDays >= 1 ? (
                      <div className="grid gap-1.5">
                        <span className={labelClass}>Aging</span>
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          {overdueDays} {overdueDays === 1 ? "day" : "days"} overdue
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <span className={labelClass}>Next Step</span>
                    <p className="text-sm leading-5 text-slate-700">{followUpLabel(projection)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Link href={`/jobs/${jobId}?tab=ops`} className={primaryActionClass}>
                        View Job
                      </Link>
                      {telHref(phone) ? (
                        <a href={telHref(phone)} className={compactActionClass}>
                          Call
                        </a>
                      ) : null}
                      {smsHref(phone) ? (
                        <a href={smsHref(phone)} className={compactActionClass}>
                          Open SMS App
                        </a>
                      ) : null}
                      {canMarkExternalInvoiceSent ? (
                        <form action={markInvoiceCompleteFromForm}>
                          <input type="hidden" name="job_id" value={jobId} />
                          <input type="hidden" name="return_to" value={`${currentQueueHref}#job-${jobId}`} />
                          <input type="hidden" name="success_notice" value="external_billing_complete" />
                          <CloseoutSubmitButton className={compactActionClass}>
                            External Billing Complete
                          </CloseoutSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
