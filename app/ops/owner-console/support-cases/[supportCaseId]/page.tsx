import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  addSupportCaseNoteFromDetail,
  updateSupportCaseStateFromDetail,
} from "@/lib/actions/support-case-actions";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import {
  formatSupportCasePriority,
  formatSupportCaseSource,
  formatSupportCaseStatus,
  loadSupportCaseById,
  loadSupportCaseNotes,
  type SupportCaseNote,
} from "@/lib/business/support-cases";
import { loadPlatformOwnerDashboardModel } from "@/lib/business/platform-owner-dashboard";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type PageParams = Promise<{
  supportCaseId?: string;
}>;

async function requirePlatformOwnerOrFailClosed() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) redirect("/login");

  const allowed = isPlatformOwnerActor({
    userId: user.id,
    email: user.email,
    env: process.env,
  });

  if (!allowed) notFound();
}

function formatDateTime(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function FieldCard(props: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</p>
      <p className="mt-2 break-words text-base font-semibold text-slate-950">{props.value}</p>
      {props.helper ? <p className="mt-1 text-xs text-slate-500">{props.helper}</p> : null}
    </div>
  );
}

function NoteTypeLabel({ value }: { value: string }) {
  if (value === "customer_update_summary") return <>Customer Update Summary</>;
  if (value === "resolution_note") return <>Resolution Note</>;
  return <>Internal Note</>;
}

export default async function SupportCaseDetailPage({ params }: { params: PageParams }) {
  await requirePlatformOwnerOrFailClosed();

  const rawParams = (await params) ?? {};
  const supportCaseId = decodeURIComponent(String(rawParams.supportCaseId ?? "").trim());
  if (!supportCaseId) notFound();

  const admin = createAdminClient();
  const supportCase = await loadSupportCaseById({ supabase: admin, supportCaseId });
  if (!supportCase) notFound();

  const [notes, dashboardModel]: [SupportCaseNote[], Awaited<ReturnType<typeof loadPlatformOwnerDashboardModel>>] = await Promise.all([
    loadSupportCaseNotes({ supabase: admin, supportCaseId }),
    loadPlatformOwnerDashboardModel({ admin }),
  ]);
  const accountRow = dashboardModel.rows.find(
    (candidate) => candidate.accountOwnerUserId === supportCase.accountOwnerUserId,
  );

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-4 text-slate-900 sm:p-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Support Case</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950">{supportCase.title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Internal support case. This page can update support-case records only, not tenant operational records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/ops/owner-console/${encodeURIComponent(supportCase.accountOwnerUserId)}`}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Back to Account Snapshot
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Account</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">{accountRow?.company ?? "Account"}</h2>
        <p className="mt-1 text-sm text-slate-500">Owner: {accountRow?.ownerEmail ?? supportCase.accountOwnerUserId}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FieldCard label="Status" value={formatSupportCaseStatus(supportCase.status)} />
        <FieldCard label="Priority" value={formatSupportCasePriority(supportCase.priority)} />
        <FieldCard label="Source" value={formatSupportCaseSource(supportCase.source)} />
        <FieldCard label="Last Activity" value={formatDateTime(supportCase.lastActivityAt)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Issue Summary</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{supportCase.issueSummary}</p>
          {supportCase.resolutionSummary ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">Resolution Summary</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-900">{supportCase.resolutionSummary}</p>
            </div>
          ) : null}
        </div>

        <form action={updateSupportCaseStateFromDetail} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="support_case_id" value={supportCase.id} />
          <h2 className="text-base font-semibold text-slate-900">Update case state</h2>
          <p className="mt-1 text-sm text-slate-500">Updates support-case state only.</p>

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</span>
            <select name="status" defaultValue={supportCase.status} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900">
              <option value="open">Open</option>
              <option value="waiting">Waiting</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>

          <label className="mt-3 block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Priority</span>
            <select name="priority" defaultValue={supportCase.priority} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>

          <label className="mt-3 block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Resolution Summary</span>
            <textarea
              name="resolution_summary"
              defaultValue={supportCase.resolutionSummary ?? ""}
              maxLength={4000}
              rows={4}
              placeholder="Use when resolving or summarizing the outcome."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </label>

          <button type="submit" className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Save Case State
          </button>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <form action={addSupportCaseNoteFromDetail} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="support_case_id" value={supportCase.id} />
          <h2 className="text-base font-semibold text-slate-900">Add internal note</h2>
          <p className="mt-1 text-sm text-slate-500">Notes are platform-internal only in V1.</p>

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Note Type</span>
            <select name="note_type" defaultValue="internal_note" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900">
              <option value="internal_note">Internal Note</option>
              <option value="customer_update_summary">Customer Update Summary</option>
              <option value="resolution_note">Resolution Note</option>
            </select>
          </label>

          <label className="mt-3 block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Note</span>
            <textarea
              name="body"
              required
              maxLength={4000}
              rows={5}
              placeholder="What happened on the call? What needs follow-up?"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </label>

          <button type="submit" className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Add Note
          </button>
        </form>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Case Notes</h2>
          <div className="mt-4 space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900"><NoteTypeLabel value={note.noteType} /></p>
                  <p className="text-xs text-slate-500">{formatDateTime(note.createdAt)}</p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{note.body}</p>
                <p className="mt-2 break-all font-mono text-[11px] text-slate-400">Author: {note.authorUserId}</p>
              </div>
            ))}
            {notes.length === 0 ? <p className="text-sm text-slate-500">No notes yet.</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
        <h2 className="font-semibold">Support boundary</h2>
        <p className="mt-1">
          This page can create notes and update support-case status only. It does not edit tenant customers, jobs, invoices, payments, users, profile, SMS, QBO, Stripe, or portal data.
        </p>
      </section>
    </div>
  );
}
