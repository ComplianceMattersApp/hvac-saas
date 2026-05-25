import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import {
  buildWithoutTechQueueRows,
  customerLocationLabel,
  formatOpsStatusLabel,
} from "@/lib/ops/focused-queues";
import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";

const withoutTechSelect =
  "id, title, status, ops_status, account_owner_user_id, scheduled_date, window_start, window_end, customer_first_name, customer_last_name, city, job_address, created_at";

function jobTitle(job: any) {
  return String(job?.title ?? "").trim() || `Job ${String(job?.id ?? "").slice(0, 8)}`;
}

function scheduleLabel(job: any): string {
  const dateLabel = job?.scheduled_date
    ? formatBusinessDateUS(String(job.scheduled_date)) || String(job.scheduled_date)
    : "Date pending";
  const windowLabel = displayWindowLA(job?.window_start ?? null, job?.window_end ?? null);
  return windowLabel ? `${dateLabel} • ${windowLabel}` : dateLabel;
}

function buildAssignmentMap(rows: Array<any>): Record<string, Array<any>> {
  const map: Record<string, Array<any>> = {};
  for (const row of rows) {
    const jobId = String(row?.job_id ?? "").trim();
    if (!jobId) continue;
    if (!Array.isArray(map[jobId])) map[jobId] = [];
    map[jobId].push(row);
  }
  return map;
}

export default async function OpsWithoutTechQueuePage() {
  const actorContext = await getRequestActorContext();
  const supabase = actorContext.supabase;
  const user = actorContext.user;

  if (!user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const { data, error } = await supabase
    .from("jobs")
    .select(withoutTechSelect)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .eq("status", "open")
    .eq("ops_status", "scheduled")
    .order("scheduled_date", { ascending: true })
    .order("window_start", { ascending: true });

  if (error) throw error;

  const allScheduled = (data ?? []) as any[];
  const jobIds = allScheduled.map((job) => String(job?.id ?? "").trim()).filter(Boolean);

  const { data: assignmentRows, error: assignmentError } = jobIds.length
    ? await supabase
        .from("job_assignments")
        .select("job_id, user_id, is_primary, is_active, deleted_at, removed_at")
        .eq("is_active", true)
        .in("job_id", jobIds)
    : { data: [], error: null };

  if (assignmentError) throw assignmentError;

  const rows = buildWithoutTechQueueRows({
    jobs: allScheduled,
    assignmentDisplayMap: buildAssignmentMap(assignmentRows ?? []),
    accountOwnerUserId: actorContext.internalUser.account_owner_user_id,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/ops"
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            <span aria-hidden="true">&larr;</span> Back to Operations
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Without Tech</h1>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
              Coverage Gaps
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Scheduled open work that is missing an active technician assignment. {" "}
            <span className="font-semibold text-slate-800">{rows.length}</span>{" "}
            {rows.length === 1 ? "item" : "items"}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-500">No coverage gaps right now.</p>
          <p className="mt-1 text-xs text-slate-400">All scheduled open jobs currently have active technician assignments.</p>
          <Link
            href="/ops"
            className="mt-4 inline-flex rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            Return to Operations
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((job: any) => {
            const jobId = String(job?.id ?? "");

            return (
              <li
                key={jobId}
                className="rounded-xl border border-l-4 border-l-amber-300 border-slate-200 bg-white px-4 py-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.45)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link
                      href={`/jobs/${jobId}?tab=ops`}
                      className="text-[15px] font-semibold leading-5 text-slate-950 underline-offset-4 hover:text-slate-700 hover:underline"
                    >
                      {jobTitle(job)}
                    </Link>
                    <div className="mt-1 text-sm text-slate-700">{customerLocationLabel(job)}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-700">
                        {scheduleLabel(job)}
                      </span>
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                        {formatOpsStatusLabel(job?.ops_status ?? null)}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/jobs/${jobId}?tab=ops`}
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
                    >
                      Open Job
                    </Link>
                    <Link
                      href="/calendar"
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                    >
                      Open Calendar
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
