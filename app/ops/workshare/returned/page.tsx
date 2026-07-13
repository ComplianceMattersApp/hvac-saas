import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { acknowledgeWorkshareOutcomeFromForm } from "@/lib/workflows/account-workshare-requests-actions";
import {
  listReturnedWorkshareRequestsForSender,
  type AccountWorkshareRequestRow,
} from "@/lib/workflows/account-workshare-requests-read";
import { formatWorkshareDateTime } from "@/app/ops/workshare/_components/workshare-request-card";

export const metadata = {
  title: "Returned ECC/HERS Work",
  description: "ECC/HERS requests where the rater has returned a result you still need to act on.",
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function ReturnedCard({
  request,
  raterName,
}: {
  request: AccountWorkshareRequestRow;
  raterName: string;
}) {
  const passed = request.outcome === "passed";
  const customer = cleanText(request.customer_name_snapshot) || "Customer not provided";
  const note = cleanText(request.outcome_note);
  const sourceJobId = cleanText(request.source_job_id);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.28)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
              passed
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {passed ? "Test passed" : "Test failed"}
          </span>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{customer}</h2>
          <div className="text-xs text-slate-500">
            {raterName} · returned {formatWorkshareDateTime(request.outcome_recorded_at)}
            {request.retest_count > 0 ? ` · retest #${request.retest_count}` : ""}
          </div>
        </div>
        {sourceJobId ? (
          <Link
            href={`/jobs/${sourceJobId}/v2`}
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:bg-slate-100"
          >
            Open job
          </Link>
        ) : null}
      </div>

      {note ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Rater note</div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{note}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-sm font-medium text-slate-700">
          {passed
            ? "Next: schedule the final inspection, then mark this handled."
            : "Next: make corrections, then request a retest from the job."}
        </p>
        {passed ? (
          <form action={acknowledgeWorkshareOutcomeFromForm}>
            <input type="hidden" name="request_id" value={request.id} />
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-slate-700"
            >
              Mark handled
            </button>
          </form>
        ) : sourceJobId ? (
          <Link
            href={`/jobs/${sourceJobId}/v2#account-workshare-requests`}
            className="inline-flex items-center rounded-full border border-rose-300 bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:bg-rose-50"
          >
            Request retest
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export default async function OpsWorkshareReturnedPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string | string[] }>;
}) {
  const actorContext = await getRequestActorContext();
  if (!actorContext.user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const resolvedSearchParams = (await searchParams) ?? {};
  const noticeParam = resolvedSearchParams.notice;
  const notice = Array.isArray(noticeParam) ? noticeParam[0] : noticeParam;

  const supabase = actorContext.supabase;
  const accountOwnerUserId = String(actorContext.internalUser.account_owner_user_id ?? "").trim();
  const requests = await listReturnedWorkshareRequestsForSender(supabase, accountOwnerUserId);

  const raterNameById = new Map<string, string>();
  const uniqueRaterIds = Array.from(
    new Set(requests.map((request) => String(request.receiver_account_id ?? "").trim()).filter(Boolean)),
  );
  if (uniqueRaterIds.length > 0) {
    const admin = createAdminClient();
    const resolved = await Promise.all(
      uniqueRaterIds.map(async (raterId) => {
        const identity = await resolveInternalBusinessIdentityByAccountOwnerId({
          accountOwnerUserId: raterId,
          supabase: admin,
        });
        return [raterId, identity.display_name] as const;
      }),
    );
    for (const [raterId, name] of resolved) raterNameById.set(raterId, name);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 text-slate-900 sm:space-y-6 sm:p-6">
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.28)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Operations</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Returned ECC/HERS Work</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Requests where your rater has returned a result and there&apos;s still a next step. Passed jobs stay here
              until you mark them handled; failed jobs stay until you request a retest.
            </p>
          </div>
          <Link
            href="/ops"
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:bg-slate-100"
          >
            Back to Ops
          </Link>
        </div>
      </section>

      {notice === "workshare_handled" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          Marked handled.
        </div>
      ) : notice === "workshare_ack_error" ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          We couldn&apos;t update that item — refresh and try again.
        </div>
      ) : null}

      {requests.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center shadow-[0_18px_36px_-32px_rgba(15,23,42,0.24)]">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">No returned work right now.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            When a rater sends back a result, it will appear here with the next step.
          </p>
        </section>
      ) : (
        <section className="space-y-4">
          {requests.map((request) => (
            <ReturnedCard
              key={request.id}
              request={request}
              raterName={raterNameById.get(String(request.receiver_account_id ?? "").trim()) || "Connected rater"}
            />
          ))}
        </section>
      )}
    </div>
  );
}
