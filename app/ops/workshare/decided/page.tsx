import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import {
  listDecidedAccountWorkshareRequestsForReceiver,
  type AccountWorkshareRequestRow,
} from "@/lib/workflows/account-workshare-requests-read";
import { resolveWorkshareSenderCompanyNames } from "@/lib/workflows/workshare-sender-identity";
import {
  WorkshareRequestCard,
  formatWorkshareDateTime,
} from "@/app/ops/workshare/_components/workshare-request-card";

export const metadata = {
  title: "Decided ECC/HERS Requests",
  description: "Read-only history of ECC/HERS testing requests this account has decided.",
};

function DeclinedBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700">
      Declined
    </span>
  );
}

function DeclinedFooter({ request }: { request: AccountWorkshareRequestRow }) {
  const reason = String(request.decline_reason ?? "").trim();
  return (
    <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-600">
        Declined {formatWorkshareDateTime(request.declined_at)}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {reason || "No reason recorded."}
      </p>
    </div>
  );
}

function AcceptedBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
      Accepted
    </span>
  );
}

function AcceptedFooter({ request }: { request: AccountWorkshareRequestRow }) {
  const jobId = String(request.receiving_job_id ?? "").trim();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
        Accepted {formatWorkshareDateTime(request.accepted_at)}
      </div>
      {jobId ? (
        <Link
          href={`/jobs/${jobId}/v2`}
          className="inline-flex items-center rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        >
          View job
        </Link>
      ) : null}
    </div>
  );
}

export default async function OpsWorkshareDecidedPage() {
  const actorContext = await getRequestActorContext();
  const user = actorContext.user;

  if (!user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const supabase = actorContext.supabase;
  const accountOwnerUserId = String(actorContext.internalUser.account_owner_user_id ?? "").trim();
  const requests = await listDecidedAccountWorkshareRequestsForReceiver(supabase, accountOwnerUserId);
  const senderNameById = await resolveWorkshareSenderCompanyNames(requests);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 text-slate-900 sm:space-y-6 sm:p-6">
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.28)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Operations</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Decided ECC/HERS Requests</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              A read-only history of ECC/HERS testing requests you have decided — declined (with the reason recorded) or
              accepted (with a link to the job created in your account).
            </p>
          </div>
          <Link
            href="/ops/workshare/incoming"
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            Back to Incoming
          </Link>
        </div>
      </section>

      {requests.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center shadow-[0_18px_36px_-32px_rgba(15,23,42,0.24)]">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
            No decided requests yet.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Requests you decline or accept will appear here for your records.
          </p>
        </section>
      ) : (
        <section className="space-y-4">
          {requests.map((request) => {
            const accepted = request.status === "accepted";
            return (
              <WorkshareRequestCard
                key={request.id}
                request={request}
                senderCompanyName={
                  senderNameById.get(String(request.sender_account_id ?? "").trim()) || "Connected contractor"
                }
                decisionBadge={accepted ? <AcceptedBadge /> : <DeclinedBadge />}
                footer={accepted ? <AcceptedFooter request={request} /> : <DeclinedFooter request={request} />}
              />
            );
          })}
        </section>
      )}
    </div>
  );
}
