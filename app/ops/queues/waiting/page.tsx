import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import { buildFocusedQueueRowPresentation } from "@/lib/ops/focused-queue-row-presentation";
import { loadFocusedOpsQueueData } from "@/lib/ops/waiting-exception-loader";

export default async function OpsWaitingQueuePage() {
  const actorContext = await getRequestActorContext();
  const supabase = actorContext.supabase;
  const user = actorContext.user;

  if (!user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const {
    rows,
    serviceFollowUpByJob,
    opsStatusEnteredAtByJob: enteredAtByJob,
  } = await loadFocusedOpsQueueData({
    supabase,
    queueKey: "waiting",
    sortKey: "oldest",
    includeLifecycleEvidence: true,
  });
  const presentationNow = new Date();
  const presentedRows = rows.map((job) => buildFocusedQueueRowPresentation({
    job,
    queueKey: "waiting",
    serviceFollowUpByJob,
    stateEnteredAtByStatus: enteredAtByJob.get(job.id) ?? null,
    now: presentationNow,
  }));

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
            <span className="font-semibold text-slate-800">{presentedRows.length}</span>{" "}
            {presentedRows.length === 1 ? "item" : "items"}
          </p>
        </div>
      </div>

      {presentedRows.length === 0 ? (
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
          {presentedRows.map((presentation) => {
            return (
              <li
                key={presentation.jobId}
                className="rounded-xl border border-l-4 border-l-amber-300 border-slate-200 bg-white px-4 py-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.45)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link
                      href={presentation.href}
                      className="text-[15px] font-semibold leading-5 text-slate-950 underline-offset-4 hover:text-slate-700 hover:underline"
                    >
                      {presentation.title}
                    </Link>
                    <div className="mt-1 text-sm text-slate-700">{presentation.customerLocation}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-700">
                        {presentation.queueStatusLabel}
                      </span>
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-500">
                        {presentation.ageLabel}
                      </span>
                      {presentation.progressLabel ? (
                        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-semibold text-blue-800">
                          {presentation.progressLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      {presentation.isReadyToSchedule ? "Original reason" : "Reason"}: {presentation.visibleReason.label}
                      {presentation.visibleReason.detail ? ` · ${presentation.visibleReason.detail}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Next step: {presentation.nextStepText}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={presentation.href}
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
                    >
                      {presentation.primaryActionLabel}
                    </Link>
                    {presentation.secondaryAction ? (
                      <Link
                        href={presentation.secondaryAction.href}
                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                      >
                        {presentation.secondaryAction.label}
                      </Link>
                    ) : null}
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
