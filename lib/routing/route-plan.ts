import type { CoordinatePair } from "./coordinates";
import {
  angularDifferenceDegrees,
  bearingDegrees,
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
  /**
   * Dispatcher dismissals: jobId → YMD dates the job must NOT be proposed on
   * ("✕ not this day"). The job re-plans onto its next-best allowed day; a job
   * dismissed from every feasible day surfaces as unplanned ("dismissed").
   */
  excludedDatesByJobId?: Record<string, string[]>;
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
  reason: "missing_coordinates" | "no_capacity" | "dismissed";
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

export type LocatedPlanJob = PlanJob & { coordinates: CoordinatePair };
type Located = LocatedPlanJob;

export function hasCoordinates(job: PlanJob): job is LocatedPlanJob {
  return job.coordinates !== null;
}

// ---------------------------------------------------------------------------
// Clustering — greedy single-link: jobs join a cluster when they are within
// the threshold of ANY member. Deterministic given input order (callers pass
// queue order, which is stable).
// ---------------------------------------------------------------------------

/**
 * Area clustering the way dispatchers think — three rules layered:
 *
 *  1. Group by city, merge neighboring cities (~30-minute reach) into one
 *     working territory: "Stockton / Lodi", "Sacramento / Elk Grove / Galt".
 *  2. Cap the territory's span so two metro areas never chain into one blob
 *     through a city that borders both.
 *  3. Stay in the lane: outlying cities only share a territory when they sit
 *     in roughly the same direction from the home base. Stockton→Lodi points
 *     a day north; Manteca — close, but the other way — belongs to a
 *     southbound day. Home-city jobs are "on the way out" for any lane, so
 *     they attach to whichever lane carries the most work.
 *
 * Suggestions only — the dispatcher can always make the call to break a lane.
 */
export function clusterJobsByArea(
  jobs: Located[],
  options: {
    homeBase?: CoordinatePair | null;
    neighborKm?: number;
    maxSpanKm?: number;
    laneSectorDegrees?: number;
    homeRadiusKm?: number;
  } = {},
): Located[][] {
  const neighborKm = options.neighborKm ?? 25;
  const maxSpanKm = options.maxSpanKm ?? 45;
  const laneSectorDegrees = options.laneSectorDegrees ?? 75;
  const homeRadiusKm = options.homeRadiusKm ?? 10;
  const homeBase = options.homeBase ?? null;

  type CityGroup = {
    city: string;
    jobs: Located[];
    centroid: CoordinatePair;
    /** null when the city is within the home radius (lane-exempt) or no home base. */
    laneBearing: number | null;
  };

  const byCity = new Map<string, Located[]>();
  for (const job of jobs) {
    const city = String(job.city ?? "").trim().toLowerCase() || `@${job.id}`;
    byCity.set(city, [...(byCity.get(city) ?? []), job]);
  }

  const cityGroups: CityGroup[] = Array.from(byCity.entries()).map(([city, members]) => {
    const centroid = {
      latitude: members.reduce((sum, job) => sum + job.coordinates.latitude, 0) / members.length,
      longitude: members.reduce((sum, job) => sum + job.coordinates.longitude, 0) / members.length,
    };
    const laneBearing =
      homeBase && haversineKm(homeBase, centroid) > homeRadiusKm
        ? bearingDegrees(homeBase, centroid)
        : null;
    return { city, jobs: members, centroid, laneBearing };
  });

  // Biggest city-groups seed areas first; ties keep input order (stable sort).
  cityGroups.sort((a, b) => b.jobs.length - a.jobs.length);

  const areas: CityGroup[][] = [];
  for (const group of cityGroups) {
    const area = areas.find((candidate) => {
      const distances = candidate.map((member) => haversineKm(member.centroid, group.centroid));
      if (Math.min(...distances) > neighborKm) return false;
      if (Math.max(...distances) > maxSpanKm) return false;
      if (group.laneBearing !== null) {
        const laneCompatible = candidate.every(
          (member) =>
            member.laneBearing === null ||
            angularDifferenceDegrees(member.laneBearing, group.laneBearing!) <= laneSectorDegrees,
        );
        if (!laneCompatible) return false;
      }
      return true;
    });
    if (area) {
      area.push(group);
    } else {
      areas.push([group]);
    }
  }

  return areas.map((area) => area.flatMap((group) => group.jobs));
}

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

/**
 * What booking THIS job on THIS day would look like: cheapest insertion into
 * the day's committed stops, projected arrival, and offerable windows. Powers
 * the mid-call "how about Tuesday?" answer.
 */
export function planJobOnDay(
  params: {
    job: PlanJob;
    date: string;
    anchors: PlanAnchor[];
    homeBase: CoordinatePair | null;
  },
  optionOverrides: Partial<RoutePlanOptions> = {},
):
  | {
      status: "ok";
      projectedArrivalMinutes: number;
      projectedArrivalLabel: string;
      proposedWindows: PlannedStop["proposedWindows"];
      overflowsDay: boolean;
    }
  | { status: "full" }
  | { status: "missing_coordinates" } {
  const options: RoutePlanOptions = { ...DEFAULT_OPTIONS, ...optionOverrides };
  if (!hasCoordinates(params.job)) return { status: "missing_coordinates" };
  if (params.anchors.length >= options.maxStopsPerDay) return { status: "full" };

  const route = orderDayRoute(params.anchors, [params.job], params.homeBase);
  const day = buildDayTimeline(params.date, route, params.homeBase, options);
  const stop = day.stops.find((candidate) => candidate.job.id === params.job.id);
  if (!stop) return { status: "full" };

  return {
    status: "ok",
    projectedArrivalMinutes: stop.projectedArrivalMinutes,
    projectedArrivalLabel: stop.projectedArrivalLabel,
    proposedWindows: stop.proposedWindows,
    overflowsDay: stop.overflowsDay,
  };
}

/**
 * Ranks horizon days for a cluster (affinity to each day's committed stops
 * plus a mild sooner-is-better lean), skipping full days. The worksheet's
 * "call with this day in mind" suggestion.
 */
export function suggestTargetDates(params: {
  cluster: Located[];
  anchorsByDate: Record<string, PlanAnchor[]>;
  horizonDates: string[];
  homeBase: CoordinatePair | null;
  maxStopsPerDay?: number;
}): Array<{ date: string; score: number }> {
  const maxStopsPerDay = params.maxStopsPerDay ?? DEFAULT_OPTIONS.maxStopsPerDay;
  return params.horizonDates
    .map((date, index) => {
      const anchors = params.anchorsByDate[date] ?? [];
      if (anchors.length >= maxStopsPerDay) return null;
      const references = dayReferencePoints(anchors, params.homeBase);
      return {
        date,
        score: clusterAffinityKm(params.cluster, references) + index * LATER_DAY_PENALTY_KM,
      };
    })
    .filter((entry): entry is { date: string; score: number } => entry !== null)
    .sort((a, b) => a.score - b.score);
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

  const excludedDatesFor = (jobId: string): Set<string> =>
    new Set(input.excludedDatesByJobId?.[jobId] ?? []);

  // Assign clusters to days — largest clusters first so cohesive groups get
  // first pick of the days with room; ties broken by queue order (stable sort).
  // Jobs place individually along the cluster's ranked days so a dismissal
  // ("✕ not this day") reroutes one job without breaking up its cluster.
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

    for (const job of cluster) {
      const excluded = excludedDatesFor(job.id);
      const target = rankedDates.find(
        (candidate) => (capacityByDate.get(candidate.date) ?? 0) > 0 && !excluded.has(candidate.date),
      );
      if (!target) {
        unplanned.push({ job, reason: excluded.size > 0 ? "dismissed" : "no_capacity" });
        continue;
      }
      capacityByDate.set(target.date, (capacityByDate.get(target.date) ?? 0) - 1);
      assignedByDate.set(target.date, [...(assignedByDate.get(target.date) ?? []), job]);
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
    // Carryover honors dismissals too — an overflowed job never lands on a
    // day the dispatcher already said no to.
    const eligibleCarryover = carryover.filter((job) => !excludedDatesFor(job.id).has(date));
    carryover = carryover.filter((job) => excludedDatesFor(job.id).has(date));
    let queued = [...(assignedByDate.get(date) ?? []), ...eligibleCarryover];

    let day = buildDayTimeline(date, orderDayRoute(anchors, queued, input.homeBase), input.homeBase, options);
    const overflowIds = new Set(
      day.stops.filter((stop) => stop.kind === "proposed" && stop.overflowsDay).map((stop) => stop.job.id),
    );
    if (overflowIds.size > 0) {
      carryover = [...carryover, ...queued.filter((job) => overflowIds.has(job.id))];
      queued = queued.filter((job) => !overflowIds.has(job.id));
      day = buildDayTimeline(date, orderDayRoute(anchors, queued, input.homeBase), input.homeBase, options);
    }
    days.push(day);
  }
  for (const job of carryover) {
    unplanned.push({ job, reason: excludedDatesFor(job.id).size > 0 ? "dismissed" : "no_capacity" });
  }

  return {
    days,
    unplanned,
    clusters: clusters.map((cluster) => ({
      label: clusterLabel(cluster),
      jobIds: cluster.map((job) => job.id),
    })),
    queuedJobCount: input.queuedJobs.length,
    plannedJobCount: plannable.length - unplanned.filter((u) => u.reason !== "missing_coordinates").length,
  };
}
