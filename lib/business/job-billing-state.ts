import {
  resolveBillingModeByAccountOwnerId,
  type BillingMode,
} from "@/lib/business/internal-business-profile";
import {
  normalizeInternalInvoiceStatus,
  type InternalInvoiceRecord,
  type InternalInvoiceStatus,
} from "@/lib/business/internal-invoice";

function isOpsTimingEnabled() {
  return process.env.OPS_TIMING_DEBUG === "true";
}

function finishOpsTiming(label: string, startedAt: number) {
  if (!startedAt) return;
  console.log(`[${label}] ${Date.now() - startedAt}ms`);
}

type InternalInvoiceSnapshot = Pick<InternalInvoiceRecord, "status" | "invoice_number" | "issued_at"> | null | undefined;

export type JobBillingStateTone = "slate" | "amber" | "emerald" | "rose";
export type JobBillingDisposition = "externally_billed" | "no_charge";

export type JobBillingStateReadModel = {
  billingMode: BillingMode;
  usesExternalBilling: boolean;
  usesInternalInvoicing: boolean;
  hasInternalInvoice: boolean;
  internalInvoiceStatus: InternalInvoiceStatus | "missing";
  billedTruthSatisfied: boolean;
  jobInvoiceCompleteProjection: boolean;
  projectionMatchesBilledTruth: boolean;
  legacyExternalBillingClosedService?: boolean;
  lightweightBillingAllowed: boolean;
  internalInvoicePanelEnabled: boolean;
  statusLabel: string;
  statusTone: JobBillingStateTone;
};

export type BillingTruthProjectionJobInput = {
  id: string;
  field_complete?: boolean | null;
  job_type?: string | null;
  ops_status?: string | null;
  pending_info_reason?: string | null;
  on_hold_reason?: string | null;
  permit_number?: string | null;
  invoice_complete?: boolean | null;
  certs_complete?: boolean | null;
  billing_disposition?: string | null;
};

export type BillingTruthCloseoutProjection = {
  id: string;
  field_complete: boolean;
  job_type: string | null;
  ops_status: string | null;
  pending_info_reason: string | null;
  on_hold_reason: string | null;
  permit_number: string | null;
  invoice_complete: boolean;
  certs_complete: boolean;
  billingState: JobBillingStateReadModel;
};

export function buildJobBillingStateReadModel(input: {
  billingMode: BillingMode;
  invoiceComplete?: boolean | null;
  internalInvoice?: InternalInvoiceSnapshot;
  billingDisposition?: string | null;
  fieldComplete?: boolean | null;
  jobType?: string | null;
  opsStatus?: string | null;
}): JobBillingStateReadModel {
  const billingMode = input.billingMode;
  const usesInternalInvoicing = billingMode === "internal_invoicing";
  const usesExternalBilling = !usesInternalInvoicing;
  const jobInvoiceCompleteProjection = Boolean(input.invoiceComplete);
  const hasInternalInvoice = input.internalInvoice != null;
  const internalInvoiceStatus = hasInternalInvoice
    ? normalizeInternalInvoiceStatus(input.internalInvoice?.status)
    : "missing";
  const billingDisposition = normalizeJobBillingDisposition(input.billingDisposition);
  const hasResolvedBillingDisposition = Boolean(billingDisposition);
  const legacyExternalBillingClosedService =
    usesExternalBilling &&
    !jobInvoiceCompleteProjection &&
    !hasResolvedBillingDisposition &&
    Boolean(input.fieldComplete) &&
    String(input.jobType ?? "").trim().toLowerCase() === "service" &&
    String(input.opsStatus ?? "").trim().toLowerCase() === "closed";

  if (usesInternalInvoicing) {
    const billedTruthSatisfied = internalInvoiceStatus === "issued" || hasResolvedBillingDisposition;
    const statusLabel = billingDisposition === "no_charge"
      ? "No Charge Recorded"
      : billingDisposition === "externally_billed"
        ? "Externally Billed"
        : internalInvoiceStatus === "issued"
          ? "Issued"
          : internalInvoiceStatus === "void"
            ? "Void"
            : internalInvoiceStatus === "draft"
              ? "Draft"
              : "Not Started";

    return {
      billingMode,
      usesExternalBilling,
      usesInternalInvoicing,
      hasInternalInvoice,
      internalInvoiceStatus,
      billedTruthSatisfied,
      jobInvoiceCompleteProjection,
      projectionMatchesBilledTruth: jobInvoiceCompleteProjection === billedTruthSatisfied,
      legacyExternalBillingClosedService: false,
      lightweightBillingAllowed: false,
      internalInvoicePanelEnabled: true,
      statusLabel,
      statusTone:
        hasResolvedBillingDisposition || internalInvoiceStatus === "issued"
          ? "emerald"
          : internalInvoiceStatus === "void"
            ? "rose"
            : internalInvoiceStatus === "draft"
              ? "amber"
              : "slate",
    };
  }

  const billedTruthSatisfied =
    jobInvoiceCompleteProjection || hasResolvedBillingDisposition || legacyExternalBillingClosedService;
  const statusLabel = billingDisposition === "no_charge"
    ? "No Charge Recorded"
    : billingDisposition === "externally_billed"
      ? "Externally Billed"
      : legacyExternalBillingClosedService
        ? "Externally Billed"
      : jobInvoiceCompleteProjection
        ? "Invoice Complete"
        : "Billing Pending";

  return {
    billingMode,
    usesExternalBilling,
    usesInternalInvoicing,
    hasInternalInvoice,
    internalInvoiceStatus,
    billedTruthSatisfied,
    jobInvoiceCompleteProjection,
    projectionMatchesBilledTruth: jobInvoiceCompleteProjection === billedTruthSatisfied,
    legacyExternalBillingClosedService,
    lightweightBillingAllowed: true,
    internalInvoicePanelEnabled: false,
    statusLabel,
    statusTone: billedTruthSatisfied ? "emerald" : "amber",
  };
}

export function normalizeJobBillingDisposition(value?: string | null): JobBillingDisposition | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "no_charge" || normalized === "externally_billed"
    ? normalized
    : null;
}

export function formatJobBillingDispositionLabel(value?: string | null): string | null {
  const disposition = normalizeJobBillingDisposition(value);
  if (disposition === "no_charge") return "No Charge Recorded";
  if (disposition === "externally_billed") return "Externally Billed";
  return null;
}

export async function buildBillingTruthCloseoutProjectionMap(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
  jobs: BillingTruthProjectionJobInput[];
}): Promise<{
  billingMode: BillingMode;
  projectionsByJobId: Map<string, BillingTruthCloseoutProjection>;
}> {
  const _t_billingMode = isOpsTimingEnabled() ? Date.now() : 0;
  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase: params.supabase,
    accountOwnerUserId: params.accountOwnerUserId,
  });
  finishOpsTiming("ops:closeoutProjection:billingMode", _t_billingMode);

  const jobs = Array.isArray(params.jobs) ? params.jobs : [];
  const jobIds = Array.from(
    new Set(
      jobs
        .map((job) => String(job?.id ?? "").trim())
        .filter(Boolean),
    ),
  );

  const internalInvoiceByJobId = new Map<string, InternalInvoiceSnapshot>();

  if (billingMode === "internal_invoicing" && jobIds.length > 0) {
    const _t_invoiceFetch = isOpsTimingEnabled() ? Date.now() : 0;
    const { data, error } = await params.supabase
      .from("internal_invoices")
      .select("job_id, status, invoice_number, issued_at")
      .neq("status", "void")
      .in("job_id", jobIds);

    finishOpsTiming("ops:closeoutProjection:invoiceFetch", _t_invoiceFetch);

    if (error) throw error;

    for (const row of data ?? []) {
      const jobId = String(row?.job_id ?? "").trim();
      if (!jobId || internalInvoiceByJobId.has(jobId)) continue;

      internalInvoiceByJobId.set(jobId, {
        status: row?.status ?? null,
        invoice_number: row?.invoice_number ?? null,
        issued_at: row?.issued_at ?? null,
      });
    }

    const unresolvedJobIds = jobIds.filter((jobId) => !internalInvoiceByJobId.has(jobId));
    if (unresolvedJobIds.length > 0) {
      const { data: memberships, error: membershipError } = await params.supabase
        .from("internal_invoice_jobs")
        .select("job_id, internal_invoices!inner(status, invoice_number, issued_at, invoice_kind)")
        .in("job_id", unresolvedJobIds)
        .eq("internal_invoices.invoice_kind", "primary")
        .neq("internal_invoices.status", "void");
      if (membershipError) throw membershipError;
      for (const membership of memberships ?? []) {
        const jobId = String(membership?.job_id ?? "").trim();
        const joined = Array.isArray(membership?.internal_invoices)
          ? membership.internal_invoices[0]
          : membership?.internal_invoices;
        if (!jobId || !joined || internalInvoiceByJobId.has(jobId)) continue;
        internalInvoiceByJobId.set(jobId, {
          status: joined.status ?? null,
          invoice_number: joined.invoice_number ?? null,
          issued_at: joined.issued_at ?? null,
        });
      }
    }
  }

  const _t_mapBuild = isOpsTimingEnabled() ? Date.now() : 0;
  const projectionsByJobId = new Map<string, BillingTruthCloseoutProjection>();

  for (const job of jobs) {
    const jobId = String(job?.id ?? "").trim();
    if (!jobId) continue;

    const billingState = buildJobBillingStateReadModel({
      billingMode,
      invoiceComplete: job.invoice_complete,
      internalInvoice: internalInvoiceByJobId.get(jobId),
      billingDisposition: job.billing_disposition,
      fieldComplete: job.field_complete,
      jobType: job.job_type,
      opsStatus: job.ops_status,
    });

    projectionsByJobId.set(jobId, {
      id: jobId,
      field_complete: Boolean(job.field_complete),
      job_type: job.job_type ?? null,
      ops_status: job.ops_status ?? null,
      pending_info_reason: job.pending_info_reason ?? null,
      on_hold_reason: job.on_hold_reason ?? null,
      permit_number: job.permit_number ?? null,
      invoice_complete: billingState.billedTruthSatisfied,
      certs_complete: Boolean(job.certs_complete),
      billingState,
    });
  }

  finishOpsTiming("ops:closeoutProjection:mapBuild", _t_mapBuild);

  return {
    billingMode,
    projectionsByJobId,
  };
}
