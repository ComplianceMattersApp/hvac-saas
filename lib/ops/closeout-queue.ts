import { isInCloseoutQueue } from "@/lib/utils/closeout";
import type { JobBillingStateReadModel } from "@/lib/business/job-billing-state";

type CloseoutQueueJob = {
  id?: string | null;
  field_complete?: boolean | null;
  job_type?: string | null;
  ops_status?: string | null;
  invoice_complete?: boolean | null;
  certs_complete?: boolean | null;
};

export function listCloseoutQueueJobs<T extends CloseoutQueueJob>(
  jobs: T[],
  getProjection: (job: T) => CloseoutQueueJob,
): T[] {
  return (jobs ?? []).filter((job) => isInCloseoutQueue(getProjection(job)));
}

export function canShowExternalInvoiceSentAction(input: {
  needsInvoice: boolean;
  billingState?: Pick<JobBillingStateReadModel, "lightweightBillingAllowed" | "usesInternalInvoicing" | "jobInvoiceCompleteProjection"> | null;
}) {
  if (!input.needsInvoice) return false;
  if (!input.billingState) return false;
  if (input.billingState.usesInternalInvoicing) return false;
  if (!input.billingState.lightweightBillingAllowed) return false;
  if (input.billingState.jobInvoiceCompleteProjection) return false;
  return true;
}
