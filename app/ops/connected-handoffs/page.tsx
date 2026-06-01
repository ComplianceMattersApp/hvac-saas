import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import {
  listActiveConnectedRecipientHandoffProjectionsForAccount,
  type ConnectedRecipientHandoffProjection,
} from "@/lib/workflows/connected-recipient-handoff-projection-read";
import { respondToConnectedRecipientHandoffRequestFromForm } from "@/lib/workflows/connected-recipient-handoff-response-actions";

export const metadata = {
  title: "Connected Handoff Requests",
  description: "Visibility and response controls for handoff requests granted to the active connected recipient account.",
};

type SearchParams = Promise<{ banner?: string }>;

const BANNER_COPY: Record<string, string> = {
  connected_handoff_accepted: "Handoff request accepted.",
  connected_handoff_completed: "Handoff request marked complete.",
  connected_handoff_rejected: "Handoff request rejected.",
  connected_handoff_response_error: "Could not update the connected handoff request.",
};

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

function canAcceptHandoff(projection: ConnectedRecipientHandoffProjection) {
  return projection.handoff_status === "sent";
}

function canCompleteHandoff(projection: ConnectedRecipientHandoffProjection) {
  return projection.handoff_status === "sent" || projection.handoff_status === "accepted";
}

function canRejectHandoff(projection: ConnectedRecipientHandoffProjection) {
  return projection.handoff_status === "sent" || projection.handoff_status === "accepted";
}

function RespondControls({ projection }: { projection: ConnectedRecipientHandoffProjection }) {
  const showAccept = canAcceptHandoff(projection);
  const showComplete = canCompleteHandoff(projection);
  const showReject = canRejectHandoff(projection);

  if (!showAccept && !showComplete && !showReject) {
    return (
      <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        This handoff is in a terminal state. Response controls are no longer available.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
      <p className="text-xs leading-5 text-slate-600">
        Responding here updates the handoff request only. The installer still reviews and manually completes their milestone separately.
      </p>

      {showAccept ? (
        <form action={respondToConnectedRecipientHandoffRequestFromForm} className="rounded-xl border border-emerald-200/80 bg-white p-3">
          <input type="hidden" name="grant_id" value={projection.grant_id} />
          <input type="hidden" name="response_status" value="accepted" />
          <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600" htmlFor={`accept-note-${projection.grant_id}`}>
            Optional note
          </label>
          <textarea
            id={`accept-note-${projection.grant_id}`}
            name="response_note"
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
          />
          <button
            type="submit"
            className="mt-2 inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-800 transition hover:bg-emerald-100 active:translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            Accept
          </button>
        </form>
      ) : null}

      {showComplete ? (
        <form action={respondToConnectedRecipientHandoffRequestFromForm} className="rounded-xl border border-sky-200/80 bg-white p-3">
          <input type="hidden" name="grant_id" value={projection.grant_id} />
          <input type="hidden" name="response_status" value="completed" />
          <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600" htmlFor={`complete-note-${projection.grant_id}`}>
            Completion note (optional)
          </label>
          <textarea
            id={`complete-note-${projection.grant_id}`}
            name="response_note"
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
          />
          <label className="mt-2 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600" htmlFor={`complete-evidence-${projection.grant_id}`}>
            Evidence reference (optional)
          </label>
          <input
            id={`complete-evidence-${projection.grant_id}`}
            name="evidence_reference"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
          />
          <button
            type="submit"
            className="mt-2 inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-800 transition hover:bg-sky-100 active:translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            Mark complete
          </button>
        </form>
      ) : null}

      {showReject ? (
        <form action={respondToConnectedRecipientHandoffRequestFromForm} className="rounded-xl border border-rose-200/80 bg-white p-3">
          <input type="hidden" name="grant_id" value={projection.grant_id} />
          <input type="hidden" name="response_status" value="rejected" />
          <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600" htmlFor={`reject-note-${projection.grant_id}`}>
            Rejection note
          </label>
          <textarea
            id={`reject-note-${projection.grant_id}`}
            name="response_note"
            required
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
          />
          <button
            type="submit"
            className="mt-2 inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-800 transition hover:bg-rose-100 active:translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-rose-300"
          >
            Reject
          </button>
        </form>
      ) : null}
    </div>
  );
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
              Respond to this granted handoff request without exposing installer job, customer, or service-case details.
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

      <RespondControls projection={projection} />
    </article>
  );
}

export default async function ConnectedHandoffsPage({ searchParams }: { searchParams?: SearchParams }) {
  const resolvedSearchParams = await searchParams;
  const bannerKey = String(resolvedSearchParams?.banner ?? "").trim();
  const bannerCopy = BANNER_COPY[bannerKey] ?? null;

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
              These are handoff requests granted to your account by connected companies. Responding here updates request status only and does not complete installer milestones.
            </p>
          </div>
          <Link href="/ops" className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300">
            Back to Ops
          </Link>
        </div>
        {bannerCopy ? (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{bannerCopy}</p>
        ) : null}
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