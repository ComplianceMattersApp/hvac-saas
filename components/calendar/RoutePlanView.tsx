import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getDispatchCalendarBoardData,
  getDispatchCalendarQueueData,
  type DispatchJob,
} from "@/lib/actions/calendar";
import { updateJobScheduleFromForm } from "@/lib/actions";
import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { getCachedInternalBusinessProfile } from "@/lib/business/tenant-reference-cache";
import { normalizeCoordinatePair, type CoordinatePair } from "@/lib/routing/coordinates";
import { scoreDayFitsForJob, type DayFit } from "@/lib/routing/day-fit";
import { kmToMiles } from "@/lib/routing/geometry";
import { buildRouteStaticMapUrl, type RouteMapStop } from "@/lib/routing/route-links";
import {
  clusterJobsByArea,
  hasCoordinates,
  planJobOnDay,
  suggestTargetDates,
  type LocatedPlanJob,
  type PlanAnchor,
  type PlanJob,
} from "@/lib/routing/route-plan";

/**
 * Call Worksheet (/calendar?view=plan): the route-first scheduling companion.
 * Nothing is pre-committed — the queue is shown as geographic groupings with a
 * target day in mind, each customer carries a two-week day-fit strip for
 * mid-call negotiation ("how about Tuesday?" answered at a glance), and every
 * booked window becomes an anchor that re-scores everything else on the next
 * render. Failure is a first-class outcome: log the attempt and move on.
 */

const HORIZON_DAYS = 14;

function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayLabel(ymd: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

function shortDayLabel(ymd: string): { weekday: string; dayOfMonth: string } {
  const target = new Date(`${ymd}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "UTC" }).format(target),
    dayOfMonth: String(target.getUTCDate()),
  };
}

function formatMiles(km: number): string {
  const miles = kmToMiles(km);
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

function ageDaysFrom(createdAt: string | null): number | null {
  if (!createdAt) return null;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return null;
  return Math.max(0, Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000)));
}

function toPlanJob(job: DispatchJob): PlanJob {
  const customerName = [job.customer_first_name, job.customer_last_name]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return {
    id: job.id,
    title: job.title || job.work_context_label || "Job",
    address: job.job_address,
    city: job.city,
    customerName: customerName || null,
    phone: job.customer_phone,
    coordinates: normalizeCoordinatePair(job.location_latitude, job.location_longitude),
    durationMinutes: job.estimated_duration_minutes,
  };
}

function toPlanAnchor(job: DispatchJob): PlanAnchor | null {
  if (!job.scheduled_date) return null;
  return {
    ...toPlanJob(job),
    scheduledDate: job.scheduled_date,
    windowStart: job.window_start,
    windowEnd: job.window_end,
    assignmentNames: job.assignment_names,
  };
}

function worksheetHref(date: string, params: { focus?: string | null; day?: string | null } = {}): string {
  const query = new URLSearchParams();
  query.set("view", "plan");
  query.set("date", date);
  if (params.focus) query.set("focus", params.focus);
  if (params.day) query.set("day", params.day);
  return `/calendar?${query.toString()}`;
}

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function RoutePlanView({
  date,
  focus,
  day,
}: {
  date: string;
  focus?: string;
  day?: string;
}) {
  let accountOwnerUserId: string;
  try {
    const { internalUser } = await requireInternalUser();
    accountOwnerUserId = internalUser.account_owner_user_id;
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  const horizonEnd = addDaysYmd(date, HORIZON_DAYS - 1);
  const [boardData, queueData, profile] = await Promise.all([
    getDispatchCalendarBoardData({
      mode: "week",
      anchorDate: date,
      rangeStartDate: date,
      rangeEndDate: horizonEnd,
      view: "plan",
    }),
    getDispatchCalendarQueueData({ mode: "day", anchorDate: date, view: "plan" }),
    getCachedInternalBusinessProfile(accountOwnerUserId),
  ]);

  const homeBase = normalizeCoordinatePair(profile?.dispatch_latitude, profile?.dispatch_longitude);
  const horizonDates = Array.from({ length: HORIZON_DAYS }, (_, index) => addDaysYmd(date, index));

  const anchorsByDate: Record<string, PlanAnchor[]> = {};
  for (const boardDay of boardData.range.days) {
    anchorsByDate[boardDay.date] = boardDay.jobs
      .map(toPlanAnchor)
      .filter((anchor): anchor is PlanAnchor => anchor !== null);
  }

  const queueRows = queueData.unassignedScheduledJobs;
  const ageByJobId = new Map(queueRows.map((row) => [row.id, ageDaysFrom(row.created_at)]));
  const queuedJobs = queueRows.map(toPlanJob);
  const located = queuedJobs.filter(hasCoordinates);
  const missingCoordinates = queuedJobs.filter((job) => !hasCoordinates(job));

  const clusters = clusterJobsByArea(located, { homeBase }).sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const oldest = (cluster: LocatedPlanJob[]) =>
      Math.max(...cluster.map((job) => ageByJobId.get(job.id) ?? 0));
    return oldest(b) - oldest(a);
  });
  const groupings = clusters.filter((cluster) => cluster.length > 1);
  const soloStops = clusters.filter((cluster) => cluster.length === 1).flat();

  const focusedJob = focus ? located.find((job) => job.id === focus) ?? null : null;
  const selectedDay = day && YMD_PATTERN.test(day) && horizonDates.includes(day) ? day : null;

  const staticMapKey = String(process.env.GOOGLE_MAPS_API_KEY ?? "").trim() || null;
  const buildingDays = horizonDates
    .map((horizonDate) => ({ date: horizonDate, anchors: anchorsByDate[horizonDate] ?? [] }))
    .filter((entry) => entry.anchors.length > 0);

  const dayFitsFor = (job: LocatedPlanJob): DayFit[] =>
    scoreDayFitsForJob({
      coordinates: job.coordinates,
      anchorsByDate,
      horizonDates,
      homeBase,
    });

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 shadow-[0_24px_52px_-30px_rgba(15,31,53,0.34)]">
      <div className="bg-gradient-to-br from-[#0f1f35] to-[#162640] px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300/80">
              Dispatch Workspace
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Call Worksheet</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-white/55">
              Work the queue grouping by grouping. Call with the target day in mind; when the
              customer counters, their day strip answers &ldquo;how about Tuesday?&rdquo; at a
              glance. Every booking re-scores the rest.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1 rounded-xl border border-white/10 bg-white/5 p-1 sm:self-start">
            <Link
              href={`/calendar?view=day&date=${encodeURIComponent(date)}`}
              className="inline-flex min-h-9 items-center justify-center rounded-lg px-4 py-1.5 text-sm font-semibold text-white/65 transition hover:bg-white/10 hover:text-white"
            >
              Back to calendar
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[12px] font-semibold">
          <span className="rounded-full bg-white/10 px-3 py-1 text-white/85">
            {queuedJobs.length} to call
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-white/70">
            {groupings.length} grouping{groupings.length === 1 ? "" : "s"} · {soloStops.length} solo
          </span>
          {buildingDays.length > 0 ? (
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-200">
              {buildingDays.reduce((sum, entry) => sum + entry.anchors.length, 0)} booked across{" "}
              {buildingDays.length} day{buildingDays.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-5 bg-white px-4 py-5 sm:px-5">
        {!homeBase ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-900">
            No dispatch home base is set — solo-trip costs can&apos;t be estimated.{" "}
            <Link href="/ops/admin/company-profile" className="font-semibold underline underline-offset-2">
              Set your shop address
            </Link>{" "}
            to sharpen day suggestions.
          </div>
        ) : null}

        {focusedJob ? (
          <FocusPanel
            job={focusedJob}
            ageDays={ageByJobId.get(focusedJob.id) ?? null}
            date={date}
            selectedDay={selectedDay}
            dayFits={dayFitsFor(focusedJob)}
            anchorsByDate={anchorsByDate}
            homeBase={homeBase}
            staticMapKey={staticMapKey}
          />
        ) : null}

        {buildingDays.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Building
            </span>
            {buildingDays.map((entry) => {
              const cities = Array.from(
                new Set(entry.anchors.map((anchor) => String(anchor.city ?? "").trim()).filter(Boolean)),
              ).slice(0, 2);
              return (
                <Link
                  key={entry.date}
                  href={`/calendar?view=day&date=${encodeURIComponent(entry.date)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900 transition hover:bg-blue-100"
                >
                  {dayLabel(entry.date)} · {entry.anchors.length} stop{entry.anchors.length === 1 ? "" : "s"}
                  {cities.length > 0 ? (
                    <span className="font-normal text-blue-700">({cities.join(", ")})</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ) : null}

        {queuedJobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-600">The unscheduled queue is empty.</p>
            <p className="mt-1 text-xs text-slate-400">New intake will appear here, grouped by area.</p>
          </div>
        ) : null}

        {groupings.map((cluster) => (
          <GroupingCard
            key={cluster.map((job) => job.id).join("-")}
            cluster={cluster}
            date={date}
            ageByJobId={ageByJobId}
            anchorsByDate={anchorsByDate}
            horizonDates={horizonDates}
            homeBase={homeBase}
            dayFitsFor={dayFitsFor}
          />
        ))}

        {soloStops.length > 0 ? (
          <section className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
              <h3 className="text-sm font-bold text-[#0f1f35]">On their own</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                No queued work nearby yet — pair them with a green day, or wait for neighbors.
              </p>
            </div>
            <ol className="divide-y divide-slate-100">
              {soloStops.map((job) => (
                <WorksheetJobRow
                  key={job.id}
                  job={job}
                  ageDays={ageByJobId.get(job.id) ?? null}
                  date={date}
                  dayFits={dayFitsFor(job)}
                />
              ))}
            </ol>
          </section>
        ) : null}

        {missingCoordinates.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-sm font-semibold text-amber-950">
              Needs an address check ({missingCoordinates.length})
            </p>
            <p className="mt-0.5 text-xs leading-5 text-amber-800">
              No map position yet, so they can&apos;t join a grouping. Open the job and re-pick the
              address with the autocomplete, or run the geocode backfill.
            </p>
            <ul className="mt-2 space-y-1.5">
              {missingCoordinates.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-2 text-sm text-amber-950">
                  <Link href={`/jobs/${job.id}`} className="font-semibold underline underline-offset-2">
                    {job.title}
                  </Link>
                  <span className="text-xs text-amber-800">
                    {[job.address, job.city].filter(Boolean).join(", ") || "No address on file"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day-fit strip
// ---------------------------------------------------------------------------

function stripCellClasses(kind: DayFit["kind"]): string {
  if (kind === "near_work") {
    return "border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-200";
  }
  if (kind === "open") {
    return "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
  }
  return "border-slate-200 bg-slate-100 text-slate-300";
}

function stripCellTitle(fit: DayFit): string {
  const label = dayLabel(fit.date);
  if (fit.kind === "near_work") {
    return `${label} — near ${fit.nearestAnchorLabel ?? "booked work"} (~${fit.detourMinutes ?? "?"} min away)`;
  }
  if (fit.kind === "open") {
    return fit.roundTripMinutes
      ? `${label} — open day, ~${fit.roundTripMinutes} min round trip`
      : `${label} — open day`;
  }
  return `${label} — full`;
}

function DayFitStrip({
  jobId,
  date,
  dayFits,
  selectedDay,
  size,
}: {
  jobId: string;
  date: string;
  dayFits: DayFit[];
  selectedDay?: string | null;
  size: "compact" | "large";
}) {
  const cellBase =
    size === "large"
      ? "flex h-11 w-9 flex-col items-center justify-center rounded-md border text-[11px] font-semibold"
      : "flex h-8 w-7 flex-col items-center justify-center rounded border text-[10px] font-semibold";

  return (
    <div className="flex flex-wrap gap-1" aria-label="Day fit for the next two weeks">
      {dayFits.map((fit) => {
        const { weekday, dayOfMonth } = shortDayLabel(fit.date);
        const isSelected = selectedDay === fit.date;
        const className = `${cellBase} ${stripCellClasses(fit.kind)} ${
          isSelected ? "ring-2 ring-blue-500 ring-offset-1" : ""
        }`;
        const content = (
          <>
            <span className={size === "large" ? "text-[9px] font-medium opacity-70" : "sr-only"}>
              {weekday}
            </span>
            <span>{dayOfMonth}</span>
          </>
        );
        if (fit.kind === "full") {
          return (
            <span key={fit.date} title={stripCellTitle(fit)} className={className}>
              {content}
            </span>
          );
        }
        return (
          <Link
            key={fit.date}
            href={worksheetHref(date, { focus: jobId, day: fit.date })}
            title={stripCellTitle(fit)}
            className={className}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouping card and job rows
// ---------------------------------------------------------------------------

function GroupingCard({
  cluster,
  date,
  ageByJobId,
  anchorsByDate,
  horizonDates,
  homeBase,
  dayFitsFor,
}: {
  cluster: LocatedPlanJob[];
  date: string;
  ageByJobId: Map<string, number | null>;
  anchorsByDate: Record<string, PlanAnchor[]>;
  horizonDates: string[];
  homeBase: CoordinatePair | null;
  dayFitsFor: (job: LocatedPlanJob) => DayFit[];
}) {
  const cities = Array.from(
    new Set(cluster.map((job) => String(job.city ?? "").trim()).filter(Boolean)),
  );
  const label = cities.length > 0 ? cities.slice(0, 3).join(" / ") : "Grouping";
  const targets = suggestTargetDates({ cluster, anchorsByDate, horizonDates, homeBase });
  const target = targets[0] ?? null;
  const backup = targets[1] ?? null;
  const targetAnchors = target ? anchorsByDate[target.date] ?? [] : [];

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-[#0f1f35]">
            {label} · {cluster.length} jobs together
          </h3>
          {target ? (
            <p className="mt-0.5 text-xs text-slate-600">
              Call these with <span className="font-semibold text-slate-900">{dayLabel(target.date)}</span> in
              mind
              {targetAnchors.length > 0 ? ` (already ${targetAnchors.length} booked that day)` : " (day is open)"}
              {backup ? ` — backup: ${dayLabel(backup.date)}` : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-600">No day with room in the next two weeks.</p>
          )}
        </div>
      </div>
      <ol className="divide-y divide-slate-100">
        {cluster.map((job) => (
          <WorksheetJobRow
            key={job.id}
            job={job}
            ageDays={ageByJobId.get(job.id) ?? null}
            date={date}
            dayFits={dayFitsFor(job)}
          />
        ))}
      </ol>
    </section>
  );
}

function WorksheetJobRow({
  job,
  ageDays,
  date,
  dayFits,
}: {
  job: LocatedPlanJob;
  ageDays: number | null;
  date: string;
  dayFits: DayFit[];
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={worksheetHref(date, { focus: job.id })}
              className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
            >
              {job.customerName ?? job.title}
            </Link>
            {ageDays !== null && ageDays > 0 ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  ageDays >= 30 ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"
                }`}
              >
                {ageDays}d
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-600">
            {[job.title, job.address, job.city].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DayFitStrip jobId={job.id} date={date} dayFits={dayFits} size="compact" />
          <Link
            href={worksheetHref(date, { focus: job.id })}
            className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            Prep call
          </Link>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Focus panel — the live call surface
// ---------------------------------------------------------------------------

function FocusPanel({
  job,
  ageDays,
  date,
  selectedDay,
  dayFits,
  anchorsByDate,
  homeBase,
  staticMapKey,
}: {
  job: LocatedPlanJob;
  ageDays: number | null;
  date: string;
  selectedDay: string | null;
  dayFits: DayFit[];
  anchorsByDate: Record<string, PlanAnchor[]>;
  homeBase: CoordinatePair | null;
  staticMapKey: string | null;
}) {
  const returnTo = worksheetHref(date);
  const selectedFit = selectedDay ? dayFits.find((fit) => fit.date === selectedDay) ?? null : null;
  const selectedAnchors = selectedDay ? anchorsByDate[selectedDay] ?? [] : [];
  const placement = selectedDay
    ? planJobOnDay({ job, date: selectedDay, anchors: selectedAnchors, homeBase })
    : null;

  const mapStops: RouteMapStop[] = selectedAnchors
    .filter((anchor) => anchor.coordinates !== null)
    .map((anchor, index) => ({ ...anchor.coordinates!, order: index + 1 }));
  const mapUrl = selectedDay
    ? buildRouteStaticMapUrl({
        apiKey: staticMapKey,
        homeBase,
        stops: mapStops,
        highlight: job.coordinates,
        width: 640,
        height: 240,
      })
    : null;

  return (
    <section className="overflow-hidden rounded-xl border-2 border-blue-200 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-blue-100 bg-blue-50/60 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[#0f1f35]">{job.customerName ?? job.title}</h3>
            {ageDays !== null && ageDays > 0 ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  ageDays >= 30 ? "bg-rose-100 text-rose-800" : "bg-slate-200 text-slate-700"
                }`}
              >
                waiting {ageDays}d
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-600">
            {[job.title, job.address, job.city].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {job.phone ? (
            <a
              href={`tel:${job.phone}`}
              className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              Call {job.customerName ? job.customerName.split(" ")[0] : ""} · {job.phone}
            </a>
          ) : null}
          <form action={logCustomerContactAttemptFromForm}>
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="method" value="call" />
            <input type="hidden" name="result" value="no_answer" />
            <input type="hidden" name="return_to" value={returnTo} />
            <button
              type="submit"
              className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              No answer — log it
            </button>
          </form>
          <Link
            href={`/jobs/${job.id}`}
            className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Open job
          </Link>
          <Link
            href={returnTo}
            aria-label="Close call prep"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            ✕
          </Link>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Which day works? <span className="font-normal normal-case">green = near booked work · white = open (solo trip) · gray = full</span>
          </p>
          <DayFitStrip jobId={job.id} date={date} dayFits={dayFits} selectedDay={selectedDay} size="large" />
        </div>

        {selectedDay && selectedFit ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-sm font-semibold text-slate-900">
              {dayLabel(selectedDay)}
              <span className="ml-2 font-normal text-slate-600">
                {selectedFit.kind === "near_work"
                  ? `near ${selectedFit.nearestAnchorLabel ?? "booked work"} — ${
                      selectedFit.nearestAnchorKm !== null ? formatMiles(selectedFit.nearestAnchorKm) : "?"
                    } / ~${selectedFit.detourMinutes ?? "?"} min away`
                  : selectedFit.kind === "open"
                    ? selectedFit.roundTripMinutes
                      ? `open day — ~${selectedFit.roundTripMinutes} min round trip`
                      : "open day"
                    : "full"}
              </span>
            </p>

            {placement?.status === "ok" ? (
              <>
                {placement.overflowsDay ? (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                    Fits only after the day end — booking here would run past 6 PM.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-600">
                    Slotting into this day&apos;s route puts arrival around{" "}
                    <span className="font-semibold">{placement.projectedArrivalLabel}</span>. Offer:
                  </p>
                )}
                {!placement.overflowsDay ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {placement.proposedWindows.map((window) => (
                      <form key={window.startHHMM} action={updateJobScheduleFromForm}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="hidden" name="scheduled_date" value={selectedDay} />
                        <input type="hidden" name="window_start" value={window.startHHMM} />
                        <input type="hidden" name="window_end" value={window.endHHMM} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <button
                          type="submit"
                          className="inline-flex min-h-9 items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                        >
                          Book {window.label}
                        </button>
                      </form>
                    ))}
                  </div>
                ) : null}
              </>
            ) : placement?.status === "full" ? (
              <p className="mt-1 text-xs text-slate-600">This day has no room left.</p>
            ) : null}

            {mapUrl ? (
              <div className="mt-3 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mapUrl}
                  alt={`${dayLabel(selectedDay)} stops and this customer`}
                  className="h-auto w-full max-w-xl rounded-lg border border-slate-200 shadow-sm"
                />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Pick a day on the strip to see projected arrival, offerable windows, and that day&apos;s
            map before you dial.
          </p>
        )}
      </div>
    </section>
  );
}
