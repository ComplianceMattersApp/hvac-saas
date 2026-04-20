import {
  resolveBillingModeByAccountOwnerId,
  type BillingMode,
} from "@/lib/business/internal-business-profile";
import {
  normalizeInternalInvoiceStatus,
  type InternalInvoiceRecord,
  type InternalInvoiceStatus,
} from "@/lib/business/internal-invoice";

type InternalInvoiceSnapshot = Pick<InternalInvoiceRecord, "status" | "invoice_number" | "issued_at"> | null | undefined;

export type JobBillingStateTone = "slate" | "amber" | "emerald" | "rose";

export type JobBillingStateReadModel = {
  billingMode: BillingMode;
  usesExternalBilling: boolean;
  usesInternalInvoicing: boolean;
  hasInternalInvoice: boolean;
  internalInvoiceStatus: InternalInvoiceStatus | "missing";
  billedTruthSatisfied: boolean;
  jobInvoiceCompleteProjection: boolean;
  projectionMatchesBilledTruth: boolean;
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
  invoice_complete?: boolean | null;
  certs_complete?: boolean | null;
};

export type BillingTruthCloseoutProjection = {
  id: string;
  field_complete: boolean;
  job_type: string | null;
  ops_status: string | null;
  invoice_complete: boolean;
  certs_complete: boolean;
  billingState: JobBillingStateReadModel;
};

export function buildJobBillingStateReadModel(input: {
  billingMode: BillingMode;
  invoiceComplete?: boolean | null;
  internalInvoice?: InternalInvoiceSnapshot;
}): JobBillingStateReadModel {
  const billingMode = input.billingMode;
  const usesInternalInvoicing = billingMode === "internal_invoicing";
  const usesExternalBilling = !usesInternalInvoicing;
  const jobInvoiceCompleteProjection = Boolean(input.invoiceComplete);
  const hasInternalInvoice = input.internalInvoice != null;
  const internalInvoiceStatus = hasInternalInvoice
    ? normalizeInternalInvoiceStatus(input.internalInvoice?.status)
    : "missing";

  if (usesInternalInvoicing) {
    const billedTruthSatisfied = internalInvoiceStatus === "issued";

    return {
      billingMode,
      usesExternalBilling,
      usesInternalInvoicing,
      hasInternalInvoice,
      internalInvoiceStatus,
      billedTruthSatisfied,
      jobInvoiceCompleteProjection,
      projectionMatchesBilledTruth: jobInvoiceCompleteProjection === billedTruthSatisfied,
      lightweightBillingAllowed: false,
      internalInvoicePanelEnabled: true,
      statusLabel:
        internalInvoiceStatus === "issued"
          ? "Issued"
          : internalInvoiceStatus === "void"
            ? "Void"
            : internalInvoiceStatus === "draft"
              ? "Draft"
              : "Not Started",
      statusTone:
        internalInvoiceStatus === "issued"
          ? "emerald"
          : internalInvoiceStatus === "void"
            ? "rose"
            : internalInvoiceStatus === "draft"
              ? "amber"
              : "slate",
    };
  }

  return {
    billingMode,
    usesExternalBilling,
    usesInternalInvoicing,
    hasInternalInvoice,
    internalInvoiceStatus,
    billedTruthSatisfied: jobInvoiceCompleteProjection,
    jobInvoiceCompleteProjection,
    projectionMatchesBilledTruth: true,
    lightweightBillingAllowed: true,
    internalInvoicePanelEnabled: false,
    statusLabel: jobInvoiceCompleteProjection ? "Invoice Complete" : "Billing Pending",
    statusTone: jobInvoiceCompleteProjection ? "emerald" : "amber",
  };
}

export async function buildBillingTruthCloseoutProjectionMap(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
  jobs: BillingTruthProjectionJobInput[];
}): Promise<{
  billingMode: BillingMode;
  projectionsByJobId: Map<string, BillingTruthCloseoutProjection>;
}> {
  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase: params.supabase,
    accountOwnerUserId: params.accountOwnerUserId,
  });

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
    const { data, error } = await params.supabase
      .from("internal_invoices")
      .select("job_id, status, invoice_number, issued_at")
      .in("job_id", jobIds);

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
  }

  const projectionsByJobId = new Map<string, BillingTruthCloseoutProjection>();

  for (const job of jobs) {
    const jobId = String(job?.id ?? "").trim();
    if (!jobId) continue;

    const billingState = buildJobBillingStateReadModel({
      billingMode,
      invoiceComplete: job.invoice_complete,
      internalInvoice: internalInvoiceByJobId.get(jobId),
    });

    projectionsByJobId.set(jobId, {
      id: jobId,
      field_complete: Boolean(job.field_complete),
      job_type: job.job_type ?? null,
      ops_status: job.ops_status ?? null,
      invoice_complete: billingState.billedTruthSatisfied,
      certs_complete: Boolean(job.certs_complete),
      billingState,
    });
  }

  return {
    billingMode,
    projectionsByJobId,
  };
}