import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import {
  listActiveConnectedRecipientHandoffProjectionsForAccount,
  type ConnectedRecipientHandoffProjection,
} from "@/lib/workflows/connected-recipient-handoff-projection-read";

export const metadata = {
  title: "Connected Handoff Requests",
  description: "Read-only visibility into handoff requests granted to the active internal account.",
};

type SearchParams = Promise<{ banner?: string }>;

function formatDateTime(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatHandoffKindLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "ecc") return "ECC";
  if (!normalized) return "Unknown";
  return normalized.replace(/_/g, " ");
}

function formatDisplayValue(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || "-";
}

function ProjectionCard({ projection }: { projection: ConnectedRecipientHandoffProjection }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
              {formatHandoffKindLabel(projection.handoff_kind)}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
              {projection.handoff_status}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
              Grant {projection.grant_status}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">
              {formatDisplayValue(projection.recipient_display_name_snapshot)}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Read-only handoff visibility for requests granted to this account.
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Sent {formatDateTime(projection.sent_at)}</div>
          {projection.responded_at ? <div className="mt-1">Responded {formatDateTime(projection.responded_at)}</div> : null}
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Recipient snapshot</dt>
          <dd className="mt-1">{formatDisplayValue(projection.recipient_display_name_snapshot)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Installer account</dt>
          <dd className="mt-1 break-all text-xs text-slate-600">{projection.installer_account_owner_user_id}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Shared scope</dt>
          <dd className="mt-1 break-all text-xs text-slate-600">{projection.shared_scope}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Granted at</dt>
          <dd className="mt-1">{formatDateTime(projection.granted_at)}</dd>
        </div>
      </dl>

      <dl className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Response note</dt>
          <dd className="mt-1 whitespace-pre-wrap">{formatDisplayValue(projection.response_note)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Evidence reference</dt>
          <dd className="mt-1 whitespace-pre-wrap">{formatDisplayValue(projection.evidence_reference)}</dd>
        </div>
      </dl>
    </article>
  );
}

export default async function ConnectedHandoffsPage({ searchParams }: { searchParams?: SearchParams }) {
  void searchParams;

  const actorContext = await getRequestActorContext();
  const supabase = actorContext.supabase;
  const user = actorContext.user;

  if (!user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const accountOwnerUserId = String(actorContext.internalUser.account_owner_user_id ?? "").trim();
  const projections = await listActiveConnectedRecipientHandoffProjectionsForAccount(supabase, accountOwnerUserId);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 text-slate-900 sm:space-y-6 sm:p-6">
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.28)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Operations</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Connected Handoff Requests</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              These are handoff requests granted to your account by connected companies. This view is read-only while connected response actions are being finalized.
            </p>
          </div>
          <Link href="/ops" className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300">
            Back to Ops
          </Link>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.28)] sm:p-6">
        {projections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-sm text-slate-600">
            No connected handoff requests are available yet.
          </div>
        ) : (
          <div className="space-y-4">
            {projections.map((projection) => (
              <ProjectionCard key={projection.grant_id} projection={projection} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}