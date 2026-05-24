import Link from "next/link";
import { createSupportCaseFromAccountSnapshot } from "@/lib/actions/support-case-actions";
import {
  formatSupportCasePriority,
  formatSupportCaseSource,
  formatSupportCaseStatus,
  loadSupportCaseCountsForAccount,
  loadSupportCasesForAccount,
  type SupportCaseSummary,
} from "@/lib/business/support-cases";
import { createAdminClient } from "@/lib/supabase/server";

function formatDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function CountCard(props: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</p>
      <p className="mt-2 text-base font-semibold text-slate-950">{props.value}</p>
      <p className="mt-1 text-xs text-slate-500">{props.helper}</p>
    </div>
  );
}

export default async function SupportCasesPanel({
  accountOwnerUserId,
}: {
  accountOwnerUserId: string;
}) {
  const admin = createAdminClient();
  const [cases, counts]: [SupportCaseSummary[], Awaited<ReturnType<typeof loadSupportCaseCountsForAccount>>] = await Promise.all([
    loadSupportCasesForAccount({ supabase: admin, accountOwnerUserId, limit: 6 }),
    loadSupportCaseCountsForAccount({ supabase: admin, accountOwnerUserId }),
  ]);

  return (
    <div id="support-cases" className="mx-auto max-w-[1100px] scroll-mt-24 space-y-5 px-4 pb-6 text-slate-900 sm:px-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Support Cases</p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">Call log and issue tracking</h2>
            <p className="mt-1 text-sm text-slate-500">
              Internal owner/support records only. These notes are not tenant-visible and do not change tenant account data.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <CountCard label="Open" value={counts.open} helper="Active issues needing work." />
          <CountCard label="Waiting" value={counts.waiting} helper="Waiting on customer or follow-up." />
          <CountCard label="Resolved" value={counts.resolved} helper="Closed support cases." />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <form action={createSupportCaseFromAccountSnapshot} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <input type="hidden" name="account_owner_user_id" value={accountOwnerUserId} />
            <h3 className="text-sm font-semibold text-slate-900">Create support case</h3>
            <p className="mt-1 text-xs text-slate-500">Creates an internal support record only.</p>

            <label className="mt-3 block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Title</span>
              <input
                name="title"
                required
                maxLength={200}
                placeholder="Example: Customer cannot find invoice link"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Issue Summary</span>
              <textarea
                name="issue_summary"
                required
                maxLength={4000}
                rows={4}
                placeholder="What did they call about? What should be checked next?"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
              />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Source</span>
                <select name="source" defaultValue="phone" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900">
                  <option value="phone">Phone</option>
                  <option value="text">Text</option>
                  <option value="email">Email</option>
                  <option value="in_app">In-app</option>
                  <option value="internal">Internal</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Priority</span>
                <select name="priority" defaultValue="normal" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900">
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
            </div>

            <button type="submit" className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              Create Case
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Recent cases</h3>
              <p className="mt-1 text-xs text-slate-500">Most recent internal support cases for this account.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {cases.map((supportCase) => (
                <div key={supportCase.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">{supportCase.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatSupportCaseStatus(supportCase.status)} · {formatSupportCasePriority(supportCase.priority)} · {formatSupportCaseSource(supportCase.source)} · {formatDate(supportCase.lastActivityAt)}
                      </p>
                    </div>
                    <Link
                      href={`/ops/owner-console/support-cases/${encodeURIComponent(supportCase.id)}`}
                      className="inline-flex rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Open
                    </Link>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{supportCase.issueSummary}</p>
                </div>
              ))}
              {cases.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">No support cases yet for this account.</div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
