import Link from "next/link";
import { Clock3 } from "lucide-react";
import { redirect } from "next/navigation";
import { saveTimeClockAccountSettingFromForm } from "@/lib/actions/internal-business-profile-actions";
import { correctTimeEntryFromForm } from "@/lib/actions/time-clock-actions";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import {
  listNeedsReviewTimeEntriesForAccount,
  listRecentTimeEntriesForAccount,
  listTeamClockStatusPreview,
  type AdminTimeEntryReviewRow,
} from "@/lib/time-clock/read-model";
import { resolveUserDisplayMap } from "@/lib/staffing/human-layer";

type SearchParams = Promise<{ notice?: string }>;

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  entry_corrected: { tone: "success", message: "Time entry updated." },
  time_clock_settings_saved: { tone: "success", message: "Time Clock account setting was saved." },
  time_clock_settings_save_failed: {
    tone: "error",
    message: "We couldn't save the Time Clock account setting. Please try again.",
  },
  reason_required: { tone: "warn", message: "Adjustment reason is required." },
  invalid_datetime: { tone: "warn", message: "Enter a valid date and time." },
  entry_not_found: { tone: "warn", message: "That time entry was not found in your account." },
  missing_entry: { tone: "warn", message: "Select a time entry before saving a correction." },
};

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

function toLocalDateTimeInputValue(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDurationFromClockIn(clockInAt: string, clockOutAt?: string | null) {
  const start = new Date(clockInAt).getTime();
  const end = clockOutAt ? new Date(clockOutAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "0m";

  const totalMinutes = Math.floor((end - start) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function toDateGroupKey(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  return toDateGroupKeyFromDate(date);
}

function toDateGroupKeyFromDate(date: Date) {
  if (!Number.isFinite(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateGroupLabel(value: string, now = new Date()) {
  const key = toDateGroupKey(value);
  if (!key) return "Unknown date";

  const todayKey = toDateGroupKeyFromDate(now);
  const yesterdayAnchor = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = toDateGroupKeyFromDate(yesterdayAnchor);

  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";

  const [year, month, day] = key.split("-").map(Number);
  const middayUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(middayUtc);
}

function toStatusLabel(value: string) {
  if (value === "on_lunch") return "On lunch";
  if (value === "needs_review") return "Needs review";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusTone(status: string) {
  if (status === "open") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "on_lunch") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "closed") return "border-slate-200 bg-slate-100 text-slate-700";
  if (status === "needs_review") return "border-orange-200 bg-orange-50 text-orange-800";
  return "border-gray-300 bg-gray-50 text-gray-700";
}

async function requireAdminOrRedirect() {
  const supabase = await createClient();
  const user = await getRequestUser();

  if (!user) redirect("/login?next=/ops/admin/time-clock");

  try {
    const authz = await requireInternalRole("admin", { supabase, userId: user.id });
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

function renderEntryRow(params: {
  row: AdminTimeEntryReviewRow;
  displayName: string;
  showCorrection: boolean;
}) {
  const { row, displayName, showCorrection } = params;

  return (
    <div key={row.entryId} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.2)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-950">{displayName}</span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(row.status)}`}>
          {toStatusLabel(row.status)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600 sm:grid-cols-4">
        <div>
          <div className="font-medium uppercase tracking-wide text-slate-500">Clock in</div>
          <div className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(row.clockInAt)}</div>
        </div>
        <div>
          <div className="font-medium uppercase tracking-wide text-slate-500">Lunch start</div>
          <div className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(row.lunchStartAt)}</div>
        </div>
        <div>
          <div className="font-medium uppercase tracking-wide text-slate-500">Lunch end</div>
          <div className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(row.lunchEndAt)}</div>
        </div>
        <div>
          <div className="font-medium uppercase tracking-wide text-slate-500">Clock out</div>
          <div className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(row.clockOutAt)}</div>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-600">
        <span className="font-medium text-slate-700">Duration:</span>{" "}
        {row.status === "closed" ? formatDurationFromClockIn(row.clockInAt, row.clockOutAt) : "-"}
      </div>

      {showCorrection ? (
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <summary className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-[background-color,transform] hover:bg-slate-50 active:translate-y-[0.5px]">
            Edit Entry
          </summary>

          <form action={correctTimeEntryFromForm} className="mt-3 space-y-3">
            <input type="hidden" name="entry_id" value={row.entryId} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Clock in (LA)</span>
                <input
                  type="datetime-local"
                  name="clock_in_at_local"
                  defaultValue={toLocalDateTimeInputValue(row.clockInAt)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="space-y-1 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Lunch start (LA)</span>
                <input
                  type="datetime-local"
                  name="lunch_start_at_local"
                  defaultValue={toLocalDateTimeInputValue(row.lunchStartAt)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="space-y-1 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Lunch end (LA)</span>
                <input
                  type="datetime-local"
                  name="lunch_end_at_local"
                  defaultValue={toLocalDateTimeInputValue(row.lunchEndAt)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="space-y-1 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Clock out (LA)</span>
                <input
                  type="datetime-local"
                  name="clock_out_at_local"
                  defaultValue={toLocalDateTimeInputValue(row.clockOutAt)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Status</span>
                <select
                  name="status"
                  defaultValue={row.status === "needs_review" || row.status === "voided" ? row.status : "closed"}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                >
                  <option value="closed">Closed</option>
                  <option value="needs_review">Needs review</option>
                  <option value="voided">Voided</option>
                </select>
              </label>
            </div>

            <label className="space-y-1 text-xs text-slate-600">
              <span className="font-medium text-slate-700">Reason for correction</span>
              <textarea
                name="adjustment_reason"
                required
                minLength={3}
                maxLength={500}
                rows={2}
                placeholder="Correct time entry with a clear reason."
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
              />
            </label>

            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_12px_22px_-14px_rgba(15,23,42,0.45)] transition-[background-color,transform] hover:bg-slate-800 active:translate-y-[0.5px]"
            >
              Correct time entry
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

export default async function AdminTimeClockPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const notice = NOTICE_TEXT[String(sp.notice ?? "").trim().toLowerCase()];

  const { supabase, internalUser } = await requireAdminOrRedirect();

  const [accountSettingsResult, activeNowRows, recentRows, needsReviewRows] = await Promise.all([
    supabase
      .from("account_settings")
      .select("time_clock_enabled")
      .eq("account_owner_user_id", internalUser.account_owner_user_id)
      .maybeSingle(),
    listTeamClockStatusPreview({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      limit: 100,
    }),
    listRecentTimeEntriesForAccount({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      days: 7,
      limit: 500,
    }),
    listNeedsReviewTimeEntriesForAccount({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      limit: 400,
    }),
  ]);

  if (accountSettingsResult.error) throw accountSettingsResult.error;
  const timeClockEnabled = Boolean((accountSettingsResult.data as any)?.time_clock_enabled);

  const allUserIds = Array.from(
    new Set([
      ...activeNowRows.map((row) => row.internalUserId),
      ...recentRows.map((row) => row.internalUserId),
      ...needsReviewRows.map((row) => row.internalUserId),
    ]),
  );

  const displayMap = await resolveUserDisplayMap({
    supabase,
    userIds: allUserIds,
  });

  const recentGroups = Array.from(
    recentRows.reduce((map, row) => {
      const key = toDateGroupKey(row.clockInAt) || "unknown";
      const existing = map.get(key) ?? [];
      existing.push(row);
      map.set(key, existing);
      return map;
    }, new Map<string, AdminTimeEntryReviewRow[]>()),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-slate-900 sm:space-y-8 sm:p-6">
      <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Center</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Time Clock</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Review team time entries and missed clock-outs.
            </p>
          </div>
          <Clock3 className="mt-1 h-5 w-5 text-slate-500" aria-hidden="true" />
        </div>
        <div className="mt-4">
          <Link
            href="/ops/admin"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 transition-[background-color,transform] hover:bg-slate-50 active:translate-y-[0.5px]"
          >
            Back to Admin Center
          </Link>
        </div>
      </section>

      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Account Time Clock Access</h2>
          <p className="text-sm leading-6 text-slate-600">
            Enable or disable Time Clock for this account. Existing time entries remain preserved if disabled.
          </p>
        </div>

        <form action={saveTimeClockAccountSettingFromForm} className="mt-4 space-y-4">
          <input type="hidden" name="time_clock_enabled" value="0" />
          <input type="hidden" name="redirect_to" value="/ops/admin/time-clock" />
          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-800">
            <input
              type="checkbox"
              name="time_clock_enabled"
              value="1"
              defaultChecked={timeClockEnabled}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            <span>
              <span className="block font-semibold text-slate-900">Enable Time Clock for this account</span>
              <span className="mt-0.5 block text-xs text-slate-600">
                Current status: {timeClockEnabled ? "Enabled" : "Disabled"}
              </span>
            </span>
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
            >
              Save Time Clock setting
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Active Now</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Currently clocked in or on lunch.</p>

        <div className="mt-4 grid gap-3">
          {activeNowRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
              No active time entries right now.
            </div>
          ) : (
            activeNowRows.map((row) => {
              const displayName = String(displayMap[row.internalUserId] ?? "").trim() || "Unknown User";

              return (
                <div key={row.entryId} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.2)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-950">{displayName}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(row.status)}`}>
                      {toStatusLabel(row.status)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-700">
                    Since {formatDateTime(row.status === "on_lunch" ? row.lunchStartAt ?? row.clockInAt : row.clockInAt)}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">Elapsed session: {formatDurationFromClockIn(row.clockInAt)}</div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">7-Day Time Review</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Review recent time entries. Older entries remain available for future reports.
        </p>

        <div className="mt-4 space-y-5">
          {recentGroups.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
              No entries found in the last 7 days.
            </div>
          ) : (
            recentGroups.map(([groupKey, rows]) => (
              <div key={groupKey} className="space-y-3">
                <div className="border-b border-slate-200 pb-2 text-sm font-semibold text-slate-900">
                  {groupKey === "unknown" ? "Unknown date" : formatDateGroupLabel(rows[0]?.clockInAt ?? "")}
                </div>
                <div className="grid gap-3">
                  {rows.map((row) =>
                    renderEntryRow({
                      row,
                      displayName: String(displayMap[row.internalUserId] ?? "").trim() || "Unknown User",
                      showCorrection: true,
                    }),
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Needs Review</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Open entries from prior days, lunch entries that need attention, and incomplete time entries.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Choose corrections carefully. Adjustment reason is required for every update.
        </p>

        <div className="mt-4 grid gap-3">
          {needsReviewRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
              No entries currently need review.
            </div>
          ) : (
            needsReviewRows.map((row) =>
              renderEntryRow({
                row,
                displayName: String(displayMap[row.internalUserId] ?? "").trim() || "Unknown User",
                showCorrection: true,
              }),
            )
          )}
        </div>
      </section>
    </div>
  );
}
