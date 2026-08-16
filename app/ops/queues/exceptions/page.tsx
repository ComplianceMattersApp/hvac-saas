import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import { buildFocusedQueueRowPresentation } from "@/lib/ops/focused-queue-row-presentation";
import { loadFocusedOpsQueueData } from "@/lib/ops/waiting-exception-loader";

export default async function OpsExceptionsQueuePage() {
  const actorContext = await getRequestActorContext();
  const supabase = actorContext.supabase;
  const user = actorContext.user;

  if (!user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const {
    rows,
    opsStatusEnteredAtByJob: enteredAtByJob,
    latestFailedEvidenceByJob,
    primaryFailureReasonByJob,
  } = await loadFocusedOpsQueueData({
    supabase,
    queueKey: "exceptions",
    sortKey: "oldest",
    includeLifecycleEvidence: true,
  });

  const presentationNow = new Date();
  const presentedRows = rows.map((job) => buildFocusedQueueRowPresentation({
    job,
    queueKey: "exceptions",
    stateEnteredAtByStatus: enteredAtByJob.get(job.id) ?? null,
    failedEvidenceAt: latestFailedEvidenceByJob.get(job.id) ?? null,
    primaryFailureReason: primaryFailureReasonByJob.get(job.id) ?? null,
    now: presentationNow,
  }));
  const agedOpenExceptions = presentedRows.filter((row) => row.isAged).length;

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
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Exceptions</h1>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800">
              Exception Queue
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Work that needs review, correction, retest, or escalation before it can progress. {" "}
            <span className="font-semibold text-slate-800">{presentedRows.length}</span>{" "}
            {presentedRows.length === 1 ? "item" : "items"}
            {agedOpenExceptions > 0 ? (
              <span className="ml-2 text-rose-700">• {agedOpenExceptions} aged 14+ days</span>
            ) : null}
          </p>
        </div>
      </div>

      {presentedRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-500">No exceptions are waiting right now.</p>
          <p className="mt-1 text-xs text-slate-400">No failed, retest, or review states currently need action.</p>
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
                className="rounded-xl border border-l-4 border-l-rose-300 border-slate-200 bg-white px-4 py-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.45)]"
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
                      <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-800">
                        {presentation.queueStatusLabel}
                      </span>
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-500">
                        {presentation.ageLabel}
                      </span>
                      {presentation.isAged ? (
                        <span className="inline-flex rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">
                          Aged exception
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={presentation.href}
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
                    >
                      {presentation.primaryActionLabel}
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
