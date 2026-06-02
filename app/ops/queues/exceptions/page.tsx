import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import {
  buildExceptionQueueRows,
  customerLocationLabel,
  formatOpsStatusLabel,
} from "@/lib/ops/focused-queues";
import { buildOpsStatusEnteredAtByJob, resolveLifecycleAging } from "@/lib/utils/lifecycle-aging";

const exceptionSelect =
  "id, title, status, ops_status, customer_first_name, customer_last_name, city, job_address, created_at";

function jobTitle(job: any) {
  return String(job?.title ?? "").trim() || `Job ${String(job?.id ?? "").slice(0, 8)}`;
}

function ageDays(job: any): number | null {
  const resolved = resolveLifecycleAging({
    status: String(job?.status ?? "").trim() || null,
    opsStatus: String(job?.ops_status ?? "").trim() || null,
    createdAt: String(job?.created_at ?? "").trim() || null,
    stateEnteredAtByStatus: (job as any)._stateEnteredAtByStatus ?? null,
    failedEvidenceAt: (job as any)._failedEvidenceAt ?? null,
  });

  const source = String(resolved.sourceTimestamp ?? "").trim();
  if (!source) return null;

  const stamp = new Date(source).getTime();
  if (!Number.isFinite(stamp)) return null;

  return Math.max(0, Math.floor((Date.now() - stamp) / 86400000));
}

function ageLabel(job: any): string {
  return (
    resolveLifecycleAging({
      status: String(job?.status ?? "").trim() || null,
      opsStatus: String(job?.ops_status ?? "").trim() || null,
      createdAt: String(job?.created_at ?? "").trim() || null,
      stateEnteredAtByStatus: (job as any)._stateEnteredAtByStatus ?? null,
      failedEvidenceAt: (job as any)._failedEvidenceAt ?? null,
    }).label ?? "-"
  );
}

export default async function OpsExceptionsQueuePage() {
  const actorContext = await getRequestActorContext();
  const supabase = actorContext.supabase;
  const user = actorContext.user;

  if (!user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const { data, error } = await supabase
    .from("jobs")
    .select(exceptionSelect)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .neq("ops_status", "closed")
    .in("ops_status", ["failed", "retest_needed", "pending_office_review", "problem"])
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = buildExceptionQueueRows((data ?? []) as any[]);
  const rowJobIds = rows.map((job: any) => String(job?.id ?? "").trim()).filter(Boolean);

  const [statusEventsRes, failedRunsRes] = await Promise.all([
    rowJobIds.length
      ? supabase
          .from("job_events")
          .select("job_id, created_at, meta")
          .in("job_id", rowJobIds)
          .eq("event_type", "ops_update")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    rowJobIds.length
      ? supabase
          .from("ecc_test_runs")
          .select("job_id, created_at, computed_pass, override_pass, is_completed")
          .in("job_id", rowJobIds)
          .eq("is_completed", true)
          .or("override_pass.eq.false,computed_pass.eq.false")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (statusEventsRes.error) throw statusEventsRes.error;
  if (failedRunsRes.error) throw failedRunsRes.error;

  const enteredAtByJob = buildOpsStatusEnteredAtByJob(
    (statusEventsRes.data ?? []) as Array<{ job_id?: unknown; created_at?: unknown; meta?: unknown }>,
  );

  const latestFailedEvidenceByJob = new Map<string, string>();
  for (const row of failedRunsRes.data ?? []) {
    const jobId = String((row as any)?.job_id ?? "").trim();
    if (!jobId || latestFailedEvidenceByJob.has(jobId)) continue;
    const createdAt = String((row as any)?.created_at ?? "").trim();
    if (!createdAt) continue;
    latestFailedEvidenceByJob.set(jobId, createdAt);
  }

  const rowsWithLifecycleMeta = rows.map((job: any) => {
    const jobId = String(job?.id ?? "").trim();
    return {
      ...job,
      _stateEnteredAtByStatus: enteredAtByJob.get(jobId) ?? null,
      _failedEvidenceAt: latestFailedEvidenceByJob.get(jobId) ?? null,
    };
  });
  const agedOpenExceptions = rowsWithLifecycleMeta.filter((job: any) => (ageDays(job) ?? 0) >= 14).length;

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
            <span className="font-semibold text-slate-800">{rows.length}</span>{" "}
            {rows.length === 1 ? "item" : "items"}
            {agedOpenExceptions > 0 ? (
              <span className="ml-2 text-rose-700">• {agedOpenExceptions} aged 14+ days</span>
            ) : null}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
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
          {rowsWithLifecycleMeta.map((job: any) => {
            const jobId = String(job?.id ?? "");
            const isAged = (ageDays(job) ?? 0) >= 14;

            return (
              <li
                key={jobId}
                className="rounded-xl border border-l-4 border-l-rose-300 border-slate-200 bg-white px-4 py-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.45)]"
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
                      <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-800">
                        {formatOpsStatusLabel(job?.ops_status ?? null)}
                      </span>
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-500">
                        Age {ageLabel(job)}
                      </span>
                      {isAged ? (
                        <span className="inline-flex rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">
                          Aged exception
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/jobs/${jobId}?tab=ops`}
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
                    >
                      Review Exception
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
