import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import {
  buildWaitingQueueRows,
  customerLocationLabel,
  formatOpsStatusLabel,
} from "@/lib/ops/focused-queues";
import { getActiveWaitingState } from "@/lib/utils/ops-status";

const waitingSelect =
  "id, title, status, ops_status, customer_first_name, customer_last_name, city, job_address, pending_info_reason, created_at";

function jobTitle(job: any) {
  return String(job?.title ?? "").trim() || `Job ${String(job?.id ?? "").slice(0, 8)}`;
}

function waitingReason(job: any): string {
  const waitingState = getActiveWaitingState({
    ops_status: job?.ops_status ?? null,
    pending_info_reason: job?.pending_info_reason ?? null,
    on_hold_reason: job?.on_hold_reason ?? null,
  });

  if (waitingState?.parsed && waitingState.blockerReason) {
    return waitingState.blockerReason;
  }

  const pendingReason = String(job?.pending_info_reason ?? "").trim();
  if (pendingReason) return pendingReason;

  const holdReason = String(job?.on_hold_reason ?? "").trim();
  if (holdReason) return holdReason;

  return "Dependency pending";
}

function waitingStateLabel(job: any): string {
  const waitingState = getActiveWaitingState({
    ops_status: job?.ops_status ?? null,
    pending_info_reason: job?.pending_info_reason ?? null,
    on_hold_reason: job?.on_hold_reason ?? null,
  });

  if (waitingState?.parsed) return waitingState.blockerLabel;
  return formatOpsStatusLabel(job?.ops_status ?? null);
}

function ageLabel(job: any): string {
  const source = String(job?.created_at ?? "").trim();
  if (!source) return "-";

  const stamp = new Date(source).getTime();
  if (!Number.isFinite(stamp)) return "-";

  const days = Math.max(0, Math.floor((Date.now() - stamp) / 86400000));
  return `${days}d`;
}

export default async function OpsWaitingQueuePage() {
  const actorContext = await getRequestActorContext();
  const supabase = actorContext.supabase;
  const user = actorContext.user;

  if (!user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const { data, error } = await supabase
    .from("jobs")
    .select(waitingSelect)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .neq("ops_status", "closed")
    .in("ops_status", ["pending_info", "on_hold", "waiting", "pending_office_review"])
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = buildWaitingQueueRows((data ?? []) as any[]);

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
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Waiting / Pending Info</h1>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
              Waiting Queue
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Work that cannot move forward until missing information or blockers are resolved. {" "}
            <span className="font-semibold text-slate-800">{rows.length}</span>{" "}
            {rows.length === 1 ? "item" : "items"}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-500">No waiting work right now.</p>
          <p className="mt-1 text-xs text-slate-400">The queue is clear. Return to Operations for broad monitoring.</p>
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
                        {waitingStateLabel(job)}
                      </span>
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-500">
                        Age {ageLabel(job)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">Reason: {waitingReason(job)}</div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/jobs/${jobId}?tab=ops`}
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
                    >
                      Open Job
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
