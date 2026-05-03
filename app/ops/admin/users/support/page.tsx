import Link from "next/link";
import { redirect } from "next/navigation";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import {
  endSupportSessionFromForm,
  startSupportSessionFromForm,
} from "@/lib/actions/support-console-actions";
import { isSupportConsoleEnabled } from "@/lib/support/support-console-exposure";
import { getSupportConsoleSnapshot, getSupportOperatorStatus } from "@/lib/support/support-console";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{
  account_owner_user_id?: string;
  notice?: string;
}>;

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  session_started: { tone: "success", message: "Read-only support session started." },
  session_ended: { tone: "success", message: "Support session ended." },
  invalid_target: { tone: "warn", message: "Enter a valid account owner user id." },
  reason_required: { tone: "warn", message: "A support reason is required before starting a session." },
  access_denied: { tone: "error", message: "Support session request was denied." },
};

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

async function requireAdminOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  try {
    const authz = await requireInternalRole("admin", { supabase, userId: user.id });
    return { supabase, userId: user.id, internalUser: authz.internalUser };
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: cu, error: cuErr } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cuErr) throw cuErr;
      if (cu?.contractor_id) redirect("/portal");
      redirect("/ops");
    }

    throw error;
  }
}

function isoOrDash(value: string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return raw;
  return dt.toISOString();
}

function expiresTone(expiresAt: string | null): "ok" | "warn" {
  const raw = String(expiresAt ?? "").trim();
  if (!raw) return "warn";
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return "warn";
  return dt.getTime() > Date.now() ? "ok" : "warn";
}

export default async function SupportConsolePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const accountOwnerUserId = String(sp.account_owner_user_id ?? "").trim();
  const notice = NOTICE_TEXT[String(sp.notice ?? "").trim().toLowerCase()];

  const { userId } = await requireAdminOrRedirect();
  if (!isSupportConsoleEnabled()) {
    redirect("/ops/admin/users?notice=support_console_unavailable");
  }

  const operator = await getSupportOperatorStatus({ actorUserId: userId });
  if (!operator.supportUserId || !operator.isSupportUserActive) {
    redirect("/ops/admin/users?notice=support_console_support_user_required");
  }

  const snapshot = await getSupportConsoleSnapshot({
    actorUserId: userId,
    accountOwnerUserId,
  });

  const session = snapshot.session;
  const grant = snapshot.grant;
  const sessionExpiryTone = expiresTone(session?.expires_at ?? null);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 text-slate-900 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Admin Center</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Support Console</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Sandbox-first read-only support session console. No tenant browsing or mutations are available in V1B.
            </p>
          </div>
          <Link
            href="/ops/admin/users"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Back to People &amp; Access
          </Link>
        </div>
      </div>

      {notice ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Operator status</h2>
          <dl className="mt-3 space-y-2 text-sm text-slate-700">
            <div>
              <dt className="font-medium text-slate-500">Auth user id</dt>
              <dd className="font-mono text-xs text-slate-800">{snapshot.operator.authUserId}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Support user id</dt>
              <dd className="font-mono text-xs text-slate-800">{snapshot.operator.supportUserId ?? "-"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Display name</dt>
              <dd>{snapshot.operator.displayName ?? "-"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Support active</dt>
              <dd>{snapshot.operator.isSupportUserActive ? "yes" : "no"}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-900">Target account scope</h2>
          <form action="/ops/admin/users/support" method="get" className="mt-3 space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="account_owner_user_id">
              account_owner_user_id
            </label>
            <input
              id="account_owner_user_id"
              name="account_owner_user_id"
              defaultValue={snapshot.accountOwnerUserId ?? ""}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900"
              placeholder="00000000-0000-0000-0000-000000000000"
            />
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Load scope
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Grant and session status</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Grant</p>
            <dl className="mt-3 space-y-1 text-sm text-slate-700">
              <div><dt className="inline font-medium text-slate-500">Grant id:</dt> <dd className="inline font-mono text-xs">{grant?.id ?? "-"}</dd></div>
              <div><dt className="inline font-medium text-slate-500">Status:</dt> <dd className="inline">{grant?.status ?? "-"}</dd></div>
              <div><dt className="inline font-medium text-slate-500">Access mode:</dt> <dd className="inline">{grant?.access_mode ?? "-"}</dd></div>
              <div><dt className="inline font-medium text-slate-500">Starts:</dt> <dd className="inline">{isoOrDash(grant?.starts_at ?? null)}</dd></div>
              <div><dt className="inline font-medium text-slate-500">Expires:</dt> <dd className="inline">{isoOrDash(grant?.expires_at ?? null)}</dd></div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Session</p>
            <dl className="mt-3 space-y-1 text-sm text-slate-700">
              <div><dt className="inline font-medium text-slate-500">Session id:</dt> <dd className="inline font-mono text-xs">{session?.id ?? "-"}</dd></div>
              <div><dt className="inline font-medium text-slate-500">Status:</dt> <dd className="inline">{session?.status ?? "-"}</dd></div>
              <div><dt className="inline font-medium text-slate-500">Access mode:</dt> <dd className="inline">{session?.access_mode ?? "-"}</dd></div>
              <div><dt className="inline font-medium text-slate-500">Started:</dt> <dd className="inline">{isoOrDash(session?.started_at ?? null)}</dd></div>
              <div>
                <dt className="inline font-medium text-slate-500">Expires:</dt>{" "}
                <dd className={`inline ${sessionExpiryTone === "ok" ? "text-emerald-700" : "text-amber-700"}`}>
                  {isoOrDash(session?.expires_at ?? null)}
                </dd>
              </div>
              <div><dt className="inline font-medium text-slate-500">Ended:</dt> <dd className="inline">{isoOrDash(session?.ended_at ?? null)}</dd></div>
            </dl>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <form action={startSupportSessionFromForm}>
            <input type="hidden" name="return_to" value="/ops/admin/users/support" />
            <input type="hidden" name="account_owner_user_id" value={snapshot.accountOwnerUserId ?? ""} />
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="operator_reason">
              Support reason
            </label>
            <textarea
              id="operator_reason"
              name="operator_reason"
              required
              minLength={5}
              maxLength={500}
              className="mb-3 min-h-[72px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder="Briefly describe why this support session is needed."
            />
            <button
              type="submit"
              disabled={!snapshot.accountOwnerUserId}
              className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Start read-only session
            </button>
          </form>

          <form action={endSupportSessionFromForm}>
            <input type="hidden" name="return_to" value="/ops/admin/users/support" />
            <input type="hidden" name="account_owner_user_id" value={snapshot.accountOwnerUserId ?? ""} />
            <input type="hidden" name="support_access_session_id" value={session?.id ?? ""} />
            <button
              type="submit"
              disabled={!snapshot.accountOwnerUserId || !session?.id}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              End session
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Recent support audit events</h2>
        {snapshot.recentAuditEvents.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No support audit events found for this scope yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Outcome</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4">Session</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.recentAuditEvents.map((event) => (
                  <tr key={event.id} className="border-t border-slate-200 text-slate-700">
                    <td className="py-2 pr-4">{isoOrDash(event.created_at)}</td>
                    <td className="py-2 pr-4">{event.event_type}</td>
                    <td className="py-2 pr-4">{event.outcome}</td>
                    <td className="py-2 pr-4">{event.reason_code ?? "-"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{event.support_access_session_id ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
