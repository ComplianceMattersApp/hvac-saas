import { isInCloseoutQueue } from "@/lib/utils/closeout";

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
