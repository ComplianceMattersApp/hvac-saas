import Link from "next/link";
import { Clock3, Coffee, Play, Square } from "lucide-react";
import { redirect } from "next/navigation";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import {
  clockInFromForm,
  clockOutFromForm,
  endLunchFromForm,
  startLunchFromForm,
} from "@/lib/actions/time-clock-actions";
import { getCurrentInternalUserClockState } from "@/lib/time-clock/read-model";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ notice?: string }>;

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  clocked_in: { tone: "success", message: "Clock in recorded." },
  clocked_out: { tone: "success", message: "Clock out recorded." },
  lunch_started: { tone: "success", message: "Lunch start recorded." },
  lunch_ended: { tone: "success", message: "Lunch end recorded." },
  account_disabled: { tone: "warn", message: "Time Clock is currently disabled for this account." },
  user_not_tracked: { tone: "warn", message: "Time tracking is not enabled for your user." },
  already_clocked_in: { tone: "warn", message: "You already have an active time entry." },
  no_active_entry: { tone: "warn", message: "No active time entry was found." },
  invalid_state: { tone: "warn", message: "That action is not available for your current state." },
};

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

async function requireInternalUserOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/time-clock");

  try {
    const authz = await requireInternalUser({ supabase, userId: user.id });
    return { supabase, userId: user.id, internalUser: authz.internalUser };
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect(
        await resolveInternalAccessErrorRedirectPath({
          supabase,
          user,
          fallbackPath: "/ops",
        }),
      );
    }

    throw error;
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(totalMs: number | null) {
  if (!totalMs || totalMs <= 0) return "0m";

  const totalMinutes = Math.floor(totalMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function deriveLastActionTime(params: {
  activeEntry: {
    status: string;
    clock_in_at: string;
    lunch_start_at: string | null;
    lunch_end_at: string | null;
  } | null;
  latestClosedClockOutAt: string | null;
}) {
  if (params.activeEntry?.status === "on_lunch") {
    return params.activeEntry.lunch_start_at ?? params.activeEntry.clock_in_at;
  }

  if (params.activeEntry?.status === "open") {
    return params.activeEntry.lunch_end_at ?? params.activeEntry.clock_in_at;
  }

  return params.latestClosedClockOutAt;
}

export default async function TimeClockPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const notice = NOTICE_TEXT[String(sp.notice ?? "").trim().toLowerCase()];

  const { supabase, internalUser } = await requireInternalUserOrRedirect();

  const [{ data: accountSettings, error: accountErr }, { data: internalUserSettings, error: userSettingsErr }] =
    await Promise.all([
      supabase
        .from("account_settings")
        .select("time_clock_enabled")
        .eq("account_owner_user_id", internalUser.account_owner_user_id)
        .maybeSingle(),
      supabase
        .from("internal_users")
        .select("time_tracking_enabled")
        .eq("user_id", internalUser.user_id)
        .eq("account_owner_user_id", internalUser.account_owner_user_id)
        .maybeSingle(),
    ]);

  if (accountErr) throw accountErr;
  if (userSettingsErr) throw userSettingsErr;

  const accountEnabled = Boolean((accountSettings as any)?.time_clock_enabled);
  const userTrackingEnabled = Boolean((internalUserSettings as any)?.time_tracking_enabled);

  const currentState = await getCurrentInternalUserClockState({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    internalUserId: internalUser.user_id,
  });

  const { data: latestClosedEntry, error: latestEntryErr } = await supabase
    .from("internal_user_time_entries")
    .select("clock_out_at")
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .eq("internal_user_id", internalUser.user_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestEntryErr) throw latestEntryErr;

  const nowMs = Date.now();
  const clockInMs = currentState.activeEntry?.clock_in_at
    ? new Date(currentState.activeEntry.clock_in_at).getTime()
    : NaN;
  const runningMs = Number.isFinite(clockInMs)
    ? Math.max(0, nowMs - clockInMs)
    : null;

  const lastActionTime = deriveLastActionTime({
    activeEntry: currentState.activeEntry,
    latestClosedClockOutAt: (latestClosedEntry as any)?.clock_out_at
      ? String((latestClosedEntry as any).clock_out_at)
      : null,
  });

  const canUseClock = accountEnabled && userTrackingEnabled;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 text-slate-900 sm:space-y-6 sm:p-6">
      <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.28)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Personal</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Time Clock</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Track your shift status with simple actions.</p>
          </div>
          <Clock3 className="h-5 w-5 text-slate-500" aria-hidden="true" />
        </div>
      </section>

      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.28)] sm:p-6">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-900">Current status</div>
          {canUseClock ? (
            <p className="text-sm text-slate-700">
              {currentState.displayState === "clocked_out"
                ? "You are clocked out."
                : currentState.displayState === "on_lunch"
                  ? `On lunch since ${formatDateTime(currentState.activeEntry?.lunch_start_at)}.`
                  : `Clocked in since ${formatDateTime(currentState.activeEntry?.clock_in_at)}.`}
            </p>
          ) : !accountEnabled ? (
            <p className="text-sm text-slate-700">Time Clock is currently unavailable for this account.</p>
          ) : (
            <p className="text-sm text-slate-700">Time tracking is not enabled for your user.</p>
          )}

          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600">
            <div>
              <div className="font-medium uppercase tracking-wide text-slate-500">Last action</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(lastActionTime)}</div>
            </div>
            <div>
              <div className="font-medium uppercase tracking-wide text-slate-500">Today running</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{formatDuration(runningMs)}</div>
            </div>
          </div>
        </div>
      </section>

      {canUseClock ? (
        <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.28)] sm:p-6">
          <div className="text-sm font-semibold text-slate-900">Actions</div>
          <div className="mt-4 grid gap-3">
            {currentState.displayState === "clocked_out" ? (
              <form action={clockInFromForm}>
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Clock In
                </button>
              </form>
            ) : null}

            {currentState.displayState === "clocked_in" ? (
              <>
                <form action={startLunchFromForm}>
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_20px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
                  >
                    <Coffee className="h-4 w-4" aria-hidden="true" />
                    Start Lunch
                  </button>
                </form>
                <form action={clockOutFromForm}>
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700 transition-[background-color,box-shadow,transform] hover:bg-red-50 hover:shadow-[0_10px_20px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
                  >
                    <Square className="h-4 w-4" aria-hidden="true" />
                    Clock Out
                  </button>
                </form>
              </>
            ) : null}

            {currentState.displayState === "on_lunch" ? (
              <form action={endLunchFromForm}>
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
                >
                  End Lunch
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 text-sm text-slate-700 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.2)] sm:p-6">
          <p>
            {accountEnabled
              ? "Time tracking is not enabled for your user. Contact your administrator if this should be enabled."
              : "Time Clock is disabled for this account right now. Contact your administrator if you need access."}
          </p>
        </section>
      )}

      <div className="flex justify-end">
        <Link
          href="/ops"
          className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
        >
          Back to Operations
        </Link>
      </div>
    </div>
  );
}
