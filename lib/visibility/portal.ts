export type PortalVisibleJob = {
  lifecycle_state?: string | null;
  ops_status?: string | null;
  status?: string | null;
};

export function isPortalVisibleJob(job: PortalVisibleJob) {
  const lifecycle = String(job.lifecycle_state ?? "").trim().toLowerCase();
  if (lifecycle === "cancelled") return false;

  const opsStatus = String(job.ops_status ?? "").trim().toLowerCase();
  if (opsStatus === "cancelled") return false;

  const status = String(job.status ?? "").trim().toLowerCase();
  if (status === "cancelled") return false;

  return true;
}
