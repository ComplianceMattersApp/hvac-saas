import Link from "next/link";
import { redirect } from "next/navigation";

import SubmitButton from "@/components/SubmitButton";
import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import { respondToWorkflowHandoffRequestFromForm } from "@/lib/workflows/actions";
import {
  listOpenWorkflowHandoffRequestsForInstallerAccount,
  type WorkflowHandoffRequestRow,
} from "@/lib/workflows/workflow-handoff-requests-read";

export const metadata = {
  title: "Handoff Requests",
  description: "Review internal workflow handoff requests and capture rater/operator responses.",
};

type SearchParams = Promise<{ banner?: string }>;

const NOTICE_TEXT: Record<string, { tone: "success" | "warn"; message: string }> = {
  handoff_response_accepted: { tone: "success", message: "Handoff request accepted." },
  handoff_response_completed: { tone: "success", message: "Handoff request marked complete." },
  handoff_response_rejected: { tone: "success", message: "Handoff request rejected." },
  handoff_response_failed: { tone: "warn", message: "Handoff response could not be recorded. Review the request and try again." },
};

function bannerClass(tone: "success" | "warn") {
  return tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : "border-amber-200 bg-amber-50 text-amber-900";
}

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

function statusBadgeClass(status: WorkflowHandoffRequestRow["handoff_status"]) {
  if (status === "accepted") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function sourceJobLabel(sourceJobId: string | null) {
  const normalized = String(sourceJobId ?? "").trim();
  if (!normalized) return "No source job linked";
  return `Job ${normalized.slice(0, 8)}`;
}

function responseSummary(request: WorkflowHandoffRequestRow) {
  if (!request.response_note && !request.evidence_reference) return null;

  return (
    <div className="mt-3 space-y-1 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
      {request.response_note ? <div>Response note: {request.response_note}</div> : null}
      {request.evidence_reference ? <div>Evidence: {request.evidence_reference}</div> : null}
    </div>
  );
}

function AcceptForm({ request }: { request: WorkflowHandoffRequestRow }) {
  return (
    <form action={respondToWorkflowHandoffRequestFromForm} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <input type="hidden" name="handoff_request_id" value={request.id} />
      <input type="hidden" name="response_status" value="accepted" />
      <input type="hidden" name="source_job_id" value={request.source_job_id ?? ""} />
      <input type="hidden" name="return_to" value="/ops/handoffs" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Accept</div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-700">Optional note</span>
        <textarea
          name="response_note"
          rows={2}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          placeholder="Accepted for review"
        />
      </label>
      <SubmitButton
        className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
        loadingText="Accepting..."
      >
        Accept
      </SubmitButton>
    </form>
  );
}

function CompleteForm({ request }: { request: WorkflowHandoffRequestRow }) {
  return (
    <form action={respondToWorkflowHandoffRequestFromForm} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <input type="hidden" name="handoff_request_id" value={request.id} />
      <input type="hidden" name="response_status" value="completed" />
      <input type="hidden" name="source_job_id" value={request.source_job_id ?? ""} />
      <input type="hidden" name="return_to" value="/ops/handoffs" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Mark complete</div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-700">Response note</span>
        <textarea
          name="response_note"
          rows={2}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          placeholder="ECC completed by authorized rater."
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-700">Evidence reference</span>
        <input
          name="evidence_reference"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          placeholder="CF3R, permit packet, inspector sign-off"
        />
      </label>
      <SubmitButton
        className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
        loadingText="Saving..."
      >
        Mark complete
      </SubmitButton>
    </form>
  );
}

function RejectForm({ request }: { request: WorkflowHandoffRequestRow }) {
  return (
    <form action={respondToWorkflowHandoffRequestFromForm} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <input type="hidden" name="handoff_request_id" value={request.id} />
      <input type="hidden" name="response_status" value="rejected" />
      <input type="hidden" name="source_job_id" value={request.source_job_id ?? ""} />
      <input type="hidden" name="return_to" value="/ops/handoffs" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Reject</div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-700">Required note</span>
        <textarea
          required
          name="response_note"
          rows={2}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          placeholder="Explain what is missing or why the handoff cannot proceed"
        />
      </label>
      <SubmitButton
        className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-1"
        loadingText="Rejecting..."
      >
        Reject
      </SubmitButton>
    </form>
  );
}

function HandoffRequestCard({ request }: { request: WorkflowHandoffRequestRow }) {
  const sourceJobId = String(request.source_job_id ?? "").trim();
  const showAccept = request.handoff_status === "sent";
  const showComplete = request.handoff_status === "sent" || request.handoff_status === "accepted";
  const showReject = request.handoff_status === "sent" || request.handoff_status === "accepted";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusBadgeClass(request.handoff_status)}`}>
              {request.handoff_status}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
              {formatHandoffKindLabel(request.handoff_kind)}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{request.recipient_display_name_snapshot || "Authorized recipient"}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Internal operator/rater response queue for workflow handoff requests.</p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Sent {formatDateTime(request.sent_at)}</div>
          {request.responded_at ? <div className="mt-1">Updated {formatDateTime(request.responded_at)}</div> : null}
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Recipient snapshot</dt>
          <dd className="mt-1">{request.recipient_display_name_snapshot || "Unknown recipient"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Source job</dt>
          <dd className="mt-1">
            {sourceJobId ? (
              <Link href={`/jobs/${sourceJobId}?tab=info`} className="font-medium text-blue-700 hover:text-blue-800 hover:underline">
                {sourceJobLabel(sourceJobId)}
              </Link>
            ) : (
              sourceJobLabel(sourceJobId)
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Workflow instance</dt>
          <dd className="mt-1 break-all text-xs text-slate-600">{request.workflow_instance_id}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Service case</dt>
          <dd className="mt-1 break-all text-xs text-slate-600">{request.service_case_id}</dd>
        </div>
      </dl>

      {responseSummary(request)}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {showAccept ? <AcceptForm request={request} /> : null}
        {showComplete ? <CompleteForm request={request} /> : null}
        {showReject ? <RejectForm request={request} /> : null}
      </div>
    </article>
  );
}

export default async function OpsHandoffsPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const notice = NOTICE_TEXT[String(sp.banner ?? "").trim().toLowerCase()] ?? null;

  const actorContext = await getRequestActorContext();
  const supabase = actorContext.supabase;
  const user = actorContext.user;

  if (!user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const requests = await listOpenWorkflowHandoffRequestsForInstallerAccount(supabase, {
    installerAccountOwnerUserId: actorContext.internalUser.account_owner_user_id,
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 text-slate-900 sm:space-y-6 sm:p-6">
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.28)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Operations</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Handoff Requests</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Review open workflow handoff requests for internal operator and rater response. This queue updates only durable handoff request state and does not complete milestones or mutate jobs.
            </p>
          </div>
          <Link href="/ops" className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300">
            Back to Ops
          </Link>
        </div>

        {notice ? (
          <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-medium ${bannerClass(notice.tone)}`}>
            {notice.message}
          </div>
        ) : null}
      </section>

      {requests.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center shadow-[0_18px_36px_-32px_rgba(15,23,42,0.24)]">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">No open handoff requests.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Requests in sent or accepted status will appear here for internal response handling.
          </p>
        </section>
      ) : (
        <section className="space-y-4">
          {requests.map((request) => (
            <HandoffRequestCard key={request.id} request={request} />
          ))}
        </section>
      )}
    </div>
  );
}