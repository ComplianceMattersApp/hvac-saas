import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getDispatchCalendarBoardData,
  getDispatchCalendarQueueData,
  type DispatchJob,
} from "@/lib/actions/calendar";
import { updateJobScheduleFromForm } from "@/lib/actions";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { getCachedInternalBusinessProfile } from "@/lib/business/tenant-reference-cache";
import { normalizeCoordinatePair } from "@/lib/routing/coordinates";
import { kmToMiles } from "@/lib/routing/geometry";
import {
  buildMultiStopDirectionsUrl,
  buildRouteStaticMapUrl,
  type RouteMapStop,
} from "@/lib/routing/route-links";
import {
  buildRoutePlan,
  type PlanAnchor,
  type PlanJob,
  type PlannedDay,
  type PlannedStop,
} from "@/lib/routing/route-plan";

/**
 * Route-first planning view (/calendar?view=plan). Reads the same scoped
 * loaders as the dispatch board, proposes per-day call plans from the
 * unscheduled queue, and schedules jobs through the existing
 * updateJobScheduleFromForm action. Proposals are recomputed on every render —
 * a decline, a drag on the grid, or a new intake simply re-flows the plan.
 */

const HORIZON_DAYS = 7;

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

function formatMiles(km: number): string {
  const miles = kmToMiles(km);
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
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

function planHref(date: string): string {
  return `/calendar?view=plan&date=${encodeURIComponent(date)}`;
}

export async function RoutePlanView({ date }: { date: string }) {
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

  const homeBase = normalizeCoordinatePair(
    profile?.dispatch_latitude,
    profile?.dispatch_longitude,
  );

  const horizonDates = Array.from({ length: HORIZON_DAYS }, (_, index) => addDaysYmd(date, index));
  const anchorsByDate: Record<string, PlanAnchor[]> = {};
  for (const day of boardData.range.days) {
    anchorsByDate[day.date] = day.jobs
      .map(toPlanAnchor)
      .filter((anchor): anchor is PlanAnchor => anchor !== null);
  }

  const queuedJobs = queueData.unassignedScheduledJobs.map(toPlanJob);
  const plan = buildRoutePlan({ homeBase, queuedJobs, anchorsByDate, horizonDates });

  const staticMapKey = String(process.env.GOOGLE_MAPS_API_KEY ?? "").trim() || null;
  const returnTo = planHref(date);
  const missingCoordinates = plan.unplanned.filter((u) => u.reason === "missing_coordinates");
  const noCapacity = plan.unplanned.filter((u) => u.reason === "no_capacity");
  const daysWithWork = plan.days.filter((day) => day.stops.length > 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 shadow-[0_24px_52px_-30px_rgba(15,31,53,0.34)]">
      {/* Identity band, matching the dispatch workspace */}
      <div className="bg-gradient-to-br from-[#0f1f35] to-[#162640] px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300/80">
              Dispatch Workspace
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Route Planning</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-white/55">
              Proposed call order for the unscheduled queue. Offer a window on the phone, click it
              to schedule, and the plan re-flows around the confirmed stop.
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
            {plan.queuedJobCount} in queue
          </span>
          <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-200">
            {plan.plannedJobCount} planned
          </span>
          {plan.unplanned.length > 0 ? (
            <span className="rounded-full bg-amber-400/15 px-3 py-1 text-amber-200">
              {plan.unplanned.length} need attention
            </span>
          ) : null}
          {plan.clusters.map((cluster) => (
            <span key={cluster.jobIds.join("-")} className="rounded-full bg-white/10 px-3 py-1 text-white/70">
              {cluster.label}: {cluster.jobIds.length}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-5 bg-white px-4 py-5 sm:px-5">
        {!homeBase ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-900">
            No dispatch home base is set, so routes have no start point and day proposals lean on
            each day&apos;s existing stops.{" "}
            <Link href="/ops/admin/company-profile" className="font-semibold underline underline-offset-2">
              Set your shop address
            </Link>{" "}
            to anchor route planning.
          </div>
        ) : null}

        {plan.queuedJobCount === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-600">The unscheduled queue is empty.</p>
            <p className="mt-1 text-xs text-slate-400">
              New intake will appear here with a proposed day and call window.
            </p>
          </div>
        ) : null}

        {daysWithWork.map((day) => (
          <PlanDayCard
            key={day.date}
            day={day}
            homeBase={homeBase}
            staticMapKey={staticMapKey}
            returnTo={returnTo}
          />
        ))}

        {missingCoordinates.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-sm font-semibold text-amber-950">
              Needs an address check ({missingCoordinates.length})
            </p>
            <p className="mt-0.5 text-xs leading-5 text-amber-800">
              These jobs have no map position yet, so they can&apos;t be routed. Open the job and
              re-pick the address with the autocomplete, or run the geocode backfill.
            </p>
            <ul className="mt-2 space-y-1.5">
              {missingCoordinates.map(({ job }) => (
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

        {noCapacity.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">
              Beyond this week&apos;s capacity ({noCapacity.length})
            </p>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">
              The next {HORIZON_DAYS} days are full. These stay in the queue —{" "}
              <Link href={planHref(addDaysYmd(date, HORIZON_DAYS))} className="font-semibold underline underline-offset-2">
                plan the following week
              </Link>{" "}
              to place them.
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {noCapacity.map(({ job }) => (
                <li key={job.id}>
                  <Link href={`/jobs/${job.id}`} className="font-medium underline underline-offset-2">
                    {job.title}
                  </Link>{" "}
                  <span className="text-xs text-slate-500">{job.city ?? ""}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlanDayCard({
  day,
  homeBase,
  staticMapKey,
  returnTo,
}: {
  day: PlannedDay;
  homeBase: { latitude: number; longitude: number } | null;
  staticMapKey: string | null;
  returnTo: string;
}) {
  const routedStops: RouteMapStop[] = day.stops
    .filter((stop) => stop.job.coordinates !== null)
    .map((stop) => ({ ...stop.job.coordinates!, order: stop.order }));
  const mapUrl = buildRouteStaticMapUrl({
    apiKey: staticMapKey,
    homeBase,
    stops: routedStops,
    width: 640,
    height: 280,
  });
  const directionsUrl = buildMultiStopDirectionsUrl({
    homeBase,
    stops: routedStops,
  });

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-bold text-[#0f1f35]">{dayLabel(day.date)}</h3>
          <span className="text-xs text-slate-500">
            {day.anchorCount} scheduled · {day.proposedCount} proposed
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
          <span>
            ~{formatMiles(day.totalDriveKm)} · {day.totalDriveMinutes} min driving
          </span>
          <span>wraps ~{day.projectedEndLabel}</span>
          {directionsUrl ? (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Preview route →
            </a>
          ) : null}
        </div>
      </div>

      {mapUrl ? (
        // Natural aspect ratio at a bounded width: nothing crops (every pin
        // stays visible) and the map reads as an overview card, not the hero.
        <div className="flex justify-center border-b border-slate-200 bg-slate-100/60 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mapUrl}
            alt={`Route map for ${dayLabel(day.date)}`}
            className="h-auto w-full max-w-2xl rounded-lg border border-slate-200 shadow-sm"
          />
        </div>
      ) : null}

      <ol className="divide-y divide-slate-100">
        {day.stops.map((stop) => (
          <PlanStopRow key={stop.job.id} stop={stop} date={day.date} returnTo={returnTo} />
        ))}
      </ol>
    </section>
  );
}

function PlanStopRow({
  stop,
  date,
  returnTo,
}: {
  stop: PlannedStop;
  date: string;
  returnTo: string;
}) {
  const isAnchor = stop.kind === "anchor";
  return (
    <li className={`px-4 py-3 ${isAnchor ? "bg-blue-50/40" : "bg-white"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            isAnchor ? "bg-[#0f1f35] text-white" : "bg-blue-600 text-white"
          }`}
        >
          {stop.order}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/jobs/${stop.job.id}`}
              className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
            >
              {stop.job.title}
            </Link>
            {isAnchor ? (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                Scheduled
                {stop.assignmentNames.length > 0 ? ` · ${stop.assignmentNames.join(", ")}` : ""}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                Call to book
              </span>
            )}
            {stop.overflowsDay ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                Runs past day end
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-600">
            {[stop.job.customerName, stop.job.address, stop.job.city].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {stop.driveMinutesFromPrevious > 0
              ? `${formatMiles(stop.driveKmFromPrevious)} · ${stop.driveMinutesFromPrevious} min from previous stop · `
              : ""}
            arrive ~{stop.projectedArrivalLabel}
            {isAnchor && stop.committedWindow?.start
              ? ` (window ${String(stop.committedWindow.start).slice(0, 5)}–${String(
                  stop.committedWindow.end ?? "",
                ).slice(0, 5)})`
              : ""}
          </p>
        </div>
        {!isAnchor ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {stop.job.phone ? (
              <a
                href={`tel:${stop.job.phone}`}
                className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Call{stop.job.customerName ? ` ${stop.job.customerName.split(" ")[0]}` : ""}
              </a>
            ) : null}
            {stop.proposedWindows.map((window) => (
              <form key={window.startHHMM} action={updateJobScheduleFromForm}>
                <input type="hidden" name="job_id" value={stop.job.id} />
                <input type="hidden" name="scheduled_date" value={date} />
                <input type="hidden" name="window_start" value={window.startHHMM} />
                <input type="hidden" name="window_end" value={window.endHHMM} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button
                  type="submit"
                  className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                >
                  Book {window.label}
                </button>
              </form>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}
