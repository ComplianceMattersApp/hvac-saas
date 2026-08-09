import type { CoordinatePair } from "./coordinates";
import {
  estimateDriveMinutes,
  haversineKm,
  minutesToHHMM,
  minutesToLabel,
  parseTimeToMinutes,
  snapDownToHalfHour,
} from "./geometry";

/**
 * Route-first planning engine. Pure and deterministic: takes the unscheduled
 * queue, the already-scheduled anchors for a horizon of days, and the dispatch
 * home base; proposes which day each queued job belongs to, the drive order,
 * a projected timeline, and customer-facing arrival windows to offer on the
 * phone. Proposals are ephemeral — recomputed from live data on every render,
 * never persisted — so schedule changes simply re-flow the plan.
 *
 * Straight-line drive estimates only (see geometry.ts); the Routes API
 * fast-follow can swap in live drive times without changing this shape.
 */

export type PlanJob = {
  id: string;
  title: string;
  address: string | null;
  city: string | null;
  customerName: string | null;
  phone: string | null;
  coordinates: CoordinatePair | null;
  durationMinutes: number | null;
};

export type PlanAnchor = PlanJob & {
  scheduledDate: string;
  windowStart: string | null;
  windowEnd: string | null;
  assignmentNames: string[];
};

export type RoutePlanInput = {
  homeBase: CoordinatePair | null;
  queuedJobs: PlanJob[];
  anchorsByDate: Record<string, PlanAnchor[]>;
  /** Ordered YMD dates the planner may propose (earliest first). */
  horizonDates: string[];
};

export type RoutePlanOptions = {
  dayStartMinutes: number;
  dayEndMinutes: number;
  defaultDurationMinutes: number;
  maxStopsPerDay: number;
  clusterThresholdKm: number;
};

const DEFAULT_OPTIONS: RoutePlanOptions = {
  dayStartMinutes: 8 * 60,
  dayEndMinutes: 18 * 60,
  defaultDurationMinutes: 120,
  maxStopsPerDay: 8,
  clusterThresholdKm: 8,
};

/** Soft preference for scheduling sooner: each day later costs this many km. */
const LATER_DAY_PENALTY_KM = 2;

export type PlannedStop = {
  kind: "anchor" | "proposed";
  job: PlanJob;
  order: number;
  driveKmFromPrevious: number;
  driveMinutesFromPrevious: number;
  projectedArrivalMinutes: number;
  projectedArrivalLabel: string;
  /** Anchor stops carry their committed window; proposed stops carry offers. */
  committedWindow: { start: string | null; end: string | null } | null;
  proposedWindows: Array<{
    startHHMM: string;
    endHHMM: string;
    label: string;
  }>;
  assignmentNames: string[];
  overflowsDay: boolean;
};

export type PlannedDay = {
  date: string;
  stops: PlannedStop[];
  anchorCount: number;
  proposedCount: number;
  totalDriveKm: number;
  totalDriveMinutes: number;
  projectedEndMinutes: number;
  projectedEndLabel: string;
};

export type UnplannedJob = {
  job: PlanJob;
  reason: "missing_coordinates" | "no_capacity";
};

export type PlanCluster = {
  label: string;
  jobIds: string[];
};

export type RoutePlan = {
  days: PlannedDay[];
  unplanned: UnplannedJob[];
  clusters: PlanCluster[];
  queuedJobCount: number;
  plannedJobCount: number;
};

type Located = PlanJob & { coordinates: CoordinatePair };

function hasCoordinates(job: PlanJob): job is Located {
  return job.coordinates !== null;
}

// ---------------------------------------------------------------------------
// Clustering — greedy single-link: jobs join a cluster when they are within
// the threshold of ANY member. Deterministic given input order (callers pass
// queue order, which is stable).
// ---------------------------------------------------------------------------

export function clusterJobs(jobs: Located[], thresholdKm: number): Located[][] {
  const clusters: Located[][] = [];
  for (const job of jobs) {
    const joined = clusters.find((cluster) =>
      cluster.some((member) => haversineKm(member.coordinates, job.coordinates) <= thresholdKm),
    );
    if (joined) {
      joined.push(job);
    } else {
      clusters.push([job]);
    }
  }
  return clusters;
}

function clusterLabel(cluster: Located[]): string {
  const cities = Array.from(
    new Set(cluster.map((job) => String(job.city ?? "").trim()).filter(Boolean)),
  );
  if (cities.length === 0) return `${cluster.length} stop${cluster.length === 1 ? "" : "s"}`;
  const shown = cities.slice(0, 2).join(" / ");
  return cities.length > 2 ? `${shown} +${cities.length - 2}` : shown;
}

// ---------------------------------------------------------------------------
// Day affinity — how close a cluster sits to a day's committed geography.
// ---------------------------------------------------------------------------

function dayReferencePoints(
  anchors: PlanAnchor[],
  homeBase: CoordinatePair | null,
): CoordinatePair[] {
  const anchorPoints = anchors
    .map((anchor) => anchor.coordinates)
    .filter((point): point is CoordinatePair => point !== null);
  if (anchorPoints.length > 0) return anchorPoints;
  return homeBase ? [homeBase] : [];
}

function clusterAffinityKm(cluster: Located[], referencePoints: CoordinatePair[]): number {
  if (referencePoints.length === 0) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (const job of cluster) {
    for (const point of referencePoints) {
      best = Math.min(best, haversineKm(job.coordinates, point));
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Routing — cheapest insertion into a window-ordered anchor skeleton.
// Anchors keep their committed order (by window start); queued stops are
// inserted wherever they add the least driving.
// ---------------------------------------------------------------------------

function orderDayRoute(
  anchors: PlanAnchor[],
  queued: Located[],
  homeBase: CoordinatePair | null,
): Array<PlanAnchor | Located> {
  const skeleton: Array<PlanAnchor | Located> = [...anchors].sort((a, b) => {
    const aStart = parseTimeToMinutes(a.windowStart) ?? Number.MAX_SAFE_INTEGER;
    const bStart = parseTimeToMinutes(b.windowStart) ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  });

  const legKm = (from: CoordinatePair | null, to: CoordinatePair | null): number => {
    if (!from || !to) return 0;
    return haversineKm(from, to);
  };

  for (const stop of queued) {
    let bestIndex = skeleton.length;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let index = 0; index <= skeleton.length; index += 1) {
      const previous = index === 0 ? homeBase : skeleton[index - 1].coordinates;
      const next = index === skeleton.length ? homeBase : skeleton[index].coordinates;
      const added =
        legKm(previous, stop.coordinates) + legKm(stop.coordinates, next) - legKm(previous, next);
      if (added < bestCost) {
        bestCost = added;
        bestIndex = index;
      }
    }
    skeleton.splice(bestIndex, 0, stop);
  }

  return skeleton;
}

// ---------------------------------------------------------------------------
// Plan assembly
// ---------------------------------------------------------------------------

function isAnchor(stop: PlanAnchor | Located): stop is PlanAnchor {
  return "scheduledDate" in stop;
}

function buildDayTimeline(
  date: string,
  route: Array<PlanAnchor | Located>,
  homeBase: CoordinatePair | null,
  options: RoutePlanOptions,
): PlannedDay {
  const stops: PlannedStop[] = [];
  let cursorMinutes = options.dayStartMinutes;
  let cursorPoint = homeBase;
  let totalDriveKm = 0;
  let totalDriveMinutes = 0;

  route.forEach((stop, index) => {
    const point = stop.coordinates;
    const driveKm = cursorPoint && point ? haversineKm(cursorPoint, point) : 0;
    const driveMinutes = cursorPoint && point ? estimateDriveMinutes(cursorPoint, point) : 0;
    totalDriveKm += driveKm;
    totalDriveMinutes += driveMinutes;

    let arrival = cursorMinutes + driveMinutes;
    const anchor = isAnchor(stop);
    if (anchor) {
      const windowStart = parseTimeToMinutes((stop as PlanAnchor).windowStart);
      if (windowStart !== null && arrival < windowStart) arrival = windowStart;
    }

    const duration = stop.durationMinutes ?? options.defaultDurationMinutes;
    const departure = arrival + duration;
    const overflowsDay = departure > options.dayEndMinutes;

    const proposedWindows: PlannedStop["proposedWindows"] = [];
    if (!anchor) {
      const primaryStart = Math.max(options.dayStartMinutes, snapDownToHalfHour(arrival - 15));
      const primaryEnd = primaryStart + 120;
      proposedWindows.push({
        startHHMM: minutesToHHMM(primaryStart),
        endHHMM: minutesToHHMM(primaryEnd),
        label: `${minutesToLabel(primaryStart)} – ${minutesToLabel(primaryEnd)}`,
      });
      const alternateStart = primaryStart + 120;
      if (alternateStart + 120 <= options.dayEndMinutes + 60) {
        proposedWindows.push({
          startHHMM: minutesToHHMM(alternateStart),
          endHHMM: minutesToHHMM(alternateStart + 120),
          label: `${minutesToLabel(alternateStart)} – ${minutesToLabel(alternateStart + 120)}`,
        });
      }
    }

    stops.push({
      kind: anchor ? "anchor" : "proposed",
      job: {
        id: stop.id,
        title: stop.title,
        address: stop.address,
        city: stop.city,
        customerName: stop.customerName,
        phone: stop.phone,
        coordinates: stop.coordinates,
        durationMinutes: stop.durationMinutes,
      },
      order: index + 1,
      driveKmFromPrevious: Math.round(driveKm * 10) / 10,
      driveMinutesFromPrevious: driveMinutes,
      projectedArrivalMinutes: arrival,
      projectedArrivalLabel: minutesToLabel(arrival),
      committedWindow: anchor
        ? {
            start: (stop as PlanAnchor).windowStart,
            end: (stop as PlanAnchor).windowEnd,
          }
        : null,
      proposedWindows,
      assignmentNames: anchor ? (stop as PlanAnchor).assignmentNames : [],
      overflowsDay,
    });

    cursorMinutes = departure;
    if (point) cursorPoint = point;
  });

  return {
    date,
    stops,
    anchorCount: stops.filter((stop) => stop.kind === "anchor").length,
    proposedCount: stops.filter((stop) => stop.kind === "proposed").length,
    totalDriveKm: Math.round(totalDriveKm * 10) / 10,
    totalDriveMinutes,
    projectedEndMinutes: cursorMinutes,
    projectedEndLabel: minutesToLabel(cursorMinutes),
  };
}

export function buildRoutePlan(
  input: RoutePlanInput,
  optionOverrides: Partial<RoutePlanOptions> = {},
): RoutePlan {
  const options: RoutePlanOptions = { ...DEFAULT_OPTIONS, ...optionOverrides };
  const unplanned: UnplannedJob[] = [];

  const plannable: Located[] = [];
  for (const job of input.queuedJobs) {
    if (hasCoordinates(job)) {
      plannable.push(job);
    } else {
      unplanned.push({ job, reason: "missing_coordinates" });
    }
  }

  const clusters = clusterJobs(plannable, options.clusterThresholdKm);

  // Capacity per horizon day (anchors already spend capacity).
  const capacityByDate = new Map<string, number>();
  for (const date of input.horizonDates) {
    const anchors = input.anchorsByDate[date] ?? [];
    capacityByDate.set(date, Math.max(0, options.maxStopsPerDay - anchors.length));
  }

  // Assign clusters to days — largest clusters first so cohesive groups get
  // first pick of the days with room; ties broken by queue order (stable sort).
  const assignedByDate = new Map<string, Located[]>();
  const orderedClusters = [...clusters].sort((a, b) => b.length - a.length);

  for (const cluster of orderedClusters) {
    const rankedDates = input.horizonDates
      .map((date, index) => {
        const anchors = input.anchorsByDate[date] ?? [];
        const references = dayReferencePoints(anchors, input.homeBase);
        return {
          date,
          score: clusterAffinityKm(cluster, references) + index * LATER_DAY_PENALTY_KM,
        };
      })
      .sort((a, b) => a.score - b.score);

    let remaining = [...cluster];
    for (const candidate of rankedDates) {
      if (remaining.length === 0) break;
      const capacity = capacityByDate.get(candidate.date) ?? 0;
      if (capacity <= 0) continue;
      const taking = remaining.slice(0, capacity);
      remaining = remaining.slice(capacity);
      capacityByDate.set(candidate.date, capacity - taking.length);
      assignedByDate.set(candidate.date, [...(assignedByDate.get(candidate.date) ?? []), ...taking]);
    }
    for (const job of remaining) {
      unplanned.push({ job, reason: "no_capacity" });
    }
  }

  // Timeline pass with overflow cascade: a proposed stop whose projected work
  // would run past the day end is pushed into the next day's pool instead of
  // being offered at night. Whatever the last horizon day can't absorb becomes
  // unplanned (no_capacity). Removing stops only shortens a day's timeline, so
  // one rebuild per day is sufficient.
  const days: PlannedDay[] = [];
  let carryover: Located[] = [];
  for (const date of input.horizonDates) {
    const anchors = input.anchorsByDate[date] ?? [];
    let queued = [...(assignedByDate.get(date) ?? []), ...carryover];
    carryover = [];

    let day = buildDayTimeline(date, orderDayRoute(anchors, queued, input.homeBase), input.homeBase, options);
    const overflowIds = new Set(
      day.stops.filter((stop) => stop.kind === "proposed" && stop.overflowsDay).map((stop) => stop.job.id),
    );
    if (overflowIds.size > 0) {
      carryover = queued.filter((job) => overflowIds.has(job.id));
      queued = queued.filter((job) => !overflowIds.has(job.id));
      day = buildDayTimeline(date, orderDayRoute(anchors, queued, input.homeBase), input.homeBase, options);
    }
    days.push(day);
  }
  for (const job of carryover) {
    unplanned.push({ job, reason: "no_capacity" });
  }

  return {
    days,
    unplanned,
    clusters: clusters.map((cluster) => ({
      label: clusterLabel(cluster),
      jobIds: cluster.map((job) => job.id),
    })),
    queuedJobCount: input.queuedJobs.length,
    plannedJobCount: plannable.length - unplanned.filter((u) => u.reason === "no_capacity").length,
  };
}
