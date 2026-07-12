import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import {
  acceptAccountWorkshareRequestFromForm,
  declineAccountWorkshareRequestFromForm,
} from "@/lib/workflows/account-workshare-requests-actions";
import {
  listIncomingAccountWorkshareRequestsForReceiver,
  type AccountWorkshareRequestRow,
} from "@/lib/workflows/account-workshare-requests-read";
import { resolveWorkshareSenderCompanyNames } from "@/lib/workflows/workshare-sender-identity";
import { WorkshareRequestCard } from "@/app/ops/workshare/_components/workshare-request-card";

export const metadata = {
  title: "Incoming ECC/HERS Requests",
  description: "Queue of ECC/HERS testing requests sent to this account by connected contractors.",
};

function RequestActions({ request }: { request: AccountWorkshareRequestRow }) {
  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <form action={acceptAccountWorkshareRequestFromForm}>
        <input type="hidden" name="request_id" value={request.id} />
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-emerald-600 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        >
          Accept &amp; create job
        </button>
        <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
          Creates an ECC/HERS job in your account from this request and opens it.
        </p>
      </form>
      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300">
          Decline request
        </summary>
        <form action={declineAccountWorkshareRequestFromForm} className="mt-3 space-y-2">
          <input type="hidden" name="request_id" value={request.id} />
          <label
            htmlFor={`decline-reason-${request.id}`}
            className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            Reason (required)
          </label>
          <textarea
            id={`decline-reason-${request.id}`}
            name="decline_reason"
            required
            rows={3}
            maxLength={2000}
            placeholder="Let the sender know why you're declining this request."
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-800 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-rose-600 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-300"
            >
              Confirm decline
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}

function NoticeBanner({ notice }: { notice: string | undefined }) {
  if (notice === "workshare_declined") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
        Request declined. The sender has been recorded as notified in the request history.
      </div>
    );
  }
  if (notice === "workshare_decline_error") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
        We couldn&apos;t decline that request. It may have already been decided or withdrawn — refresh and try again.
      </div>
    );
  }
  if (notice === "workshare_accept_error") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
        We couldn&apos;t accept that request. It may have already been decided or withdrawn, or your plan may not allow
        creating jobs — refresh and try again.
      </div>
    );
  }
  return null;
}

export default async function OpsWorkshareIncomingPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string | string[] }>;
}) {
  const actorContext = await getRequestActorContext();
  const user = actorContext.user;

  if (!user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const resolvedSearchParams = (await searchParams) ?? {};
  const noticeParam = resolvedSearchParams.notice;
  const notice = Array.isArray(noticeParam) ? noticeParam[0] : noticeParam;

  const supabase = actorContext.supabase;
  const accountOwnerUserId = String(actorContext.internalUser.account_owner_user_id ?? "").trim();
  const requests = await listIncomingAccountWorkshareRequestsForReceiver(supabase, accountOwnerUserId);
  const senderNameById = await resolveWorkshareSenderCompanyNames(requests);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 text-slate-900 sm:space-y-6 sm:p-6">
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.28)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Operations</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Incoming ECC/HERS Requests</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              These are ECC/HERS testing requests sent to your account by connected contractors. Decline a request with a
              reason if you can&apos;t take it on — declined requests move to your{" "}
              <Link href="/ops/workshare/decided" className="font-semibold text-slate-800 underline underline-offset-2">
                decided history
              </Link>
              .
            </p>
          </div>
          <Link
            href="/ops"
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            Back to Ops
          </Link>
        </div>
      </section>

      <NoticeBanner notice={notice} />

      {requests.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center shadow-[0_18px_36px_-32px_rgba(15,23,42,0.24)]">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
            No incoming ECC/HERS requests yet.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            When a connected contractor sends you a request, it will appear here.
          </p>
        </section>
      ) : (
        <section className="space-y-4">
          {requests.map((request) => (
            <WorkshareRequestCard
              key={request.id}
              request={request}
              senderCompanyName={
                senderNameById.get(String(request.sender_account_id ?? "").trim()) || "Connected contractor"
              }
              footer={<RequestActions request={request} />}
            />
          ))}
        </section>
      )}
    </div>
  );
}
