import { describe, expect, it } from "vitest";
import { buildRoutePlan, clusterJobs, type PlanAnchor, type PlanJob } from "../route-plan";

/**
 * Grid intuition for the fixtures: near Stockton, 0.01° latitude ≈ 1.11 km.
 * HOME sits at the origin; "north N" means N * 0.01° above it.
 */
const HOME = { latitude: 38.0, longitude: -121.3 };
const north = (steps: number) => ({ latitude: 38.0 + steps * 0.01, longitude: -121.3 });

function queuedJob(id: string, overrides: Partial<PlanJob> = {}): PlanJob {
  return {
    id,
    title: `Job ${id}`,
    address: `${id} Test St`,
    city: "Stockton",
    customerName: "Test Customer",
    phone: null,
    coordinates: north(1),
    durationMinutes: null,
    ...overrides,
  };
}

function anchorJob(
  id: string,
  date: string,
  overrides: Partial<PlanAnchor> = {},
): PlanAnchor {
  return {
    ...queuedJob(id),
    scheduledDate: date,
    windowStart: "09:00:00",
    windowEnd: "11:00:00",
    assignmentNames: ["Marcus"],
    ...overrides,
  };
}

describe("clusterJobs", () => {
  it("groups jobs within the threshold and separates distant ones", () => {
    const jobs = [
      queuedJob("a", { coordinates: north(0) }),
      queuedJob("b", { coordinates: north(2) }), // ~2.2 km from a
      queuedJob("c", { coordinates: north(20) }), // ~22 km away
    ].filter((j): j is typeof j & { coordinates: NonNullable<PlanJob["coordinates"]> } => true);

    const clusters = clusterJobs(jobs as never, 8);
    expect(clusters.map((c) => c.map((j) => j.id))).toEqual([["a", "b"], ["c"]]);
  });

  it("chains via single-link membership", () => {
    // a—b within 8 km, b—c within 8 km, a—c beyond it: still one cluster.
    const jobs = [
      queuedJob("a", { coordinates: north(0) }),
      queuedJob("b", { coordinates: north(6) }),
      queuedJob("c", { coordinates: north(12) }),
    ];
    const clusters = clusterJobs(jobs as never, 8);
    expect(clusters).toHaveLength(1);
  });
});

describe("buildRoutePlan", () => {
  it("routes jobs without coordinates to the unplanned list", () => {
    const plan = buildRoutePlan({
      homeBase: HOME,
      queuedJobs: [queuedJob("has-coords"), queuedJob("no-coords", { coordinates: null })],
      anchorsByDate: {},
      horizonDates: ["2026-08-10"],
    });

    expect(plan.unplanned).toEqual([
      expect.objectContaining({ reason: "missing_coordinates", job: expect.objectContaining({ id: "no-coords" }) }),
    ]);
    expect(plan.days[0].stops.map((s) => s.job.id)).toEqual(["has-coords"]);
  });

  it("pulls a cluster toward the day whose anchors sit nearby", () => {
    // Cluster ~22 km north of home; day 2 already has an anchor there.
    const cluster = [
      queuedJob("q1", { coordinates: north(20) }),
      queuedJob("q2", { coordinates: north(21) }),
    ];
    const plan = buildRoutePlan({
      homeBase: HOME,
      queuedJobs: cluster,
      anchorsByDate: { "2026-08-11": [anchorJob("anchor", "2026-08-11", { coordinates: north(19) })] },
      horizonDates: ["2026-08-10", "2026-08-11"],
    });

    const day2Ids = plan.days[1].stops.map((s) => s.job.id);
    expect(day2Ids).toContain("q1");
    expect(day2Ids).toContain("q2");
    expect(plan.days[0].stops).toHaveLength(0);
  });

  it("prefers earlier days when geography does not disagree", () => {
    const plan = buildRoutePlan({
      homeBase: HOME,
      queuedJobs: [queuedJob("q1")],
      anchorsByDate: {},
      horizonDates: ["2026-08-10", "2026-08-11"],
    });
    expect(plan.days[0].stops.map((s) => s.job.id)).toEqual(["q1"]);
  });

  it("respects per-day capacity and overflows to later days, then unplanned", () => {
    const jobs = [
      queuedJob("q1", { coordinates: north(1) }),
      queuedJob("q2", { coordinates: north(2) }),
      queuedJob("q3", { coordinates: north(3) }),
    ];
    const plan = buildRoutePlan(
      {
        homeBase: HOME,
        queuedJobs: jobs,
        anchorsByDate: {},
        horizonDates: ["2026-08-10", "2026-08-11"],
      },
      { maxStopsPerDay: 1 },
    );

    expect(plan.days[0].stops).toHaveLength(1);
    expect(plan.days[1].stops).toHaveLength(1);
    expect(plan.unplanned).toEqual([
      expect.objectContaining({ reason: "no_capacity" }),
    ]);
  });

  it("keeps anchors in window order and waits for a not-yet-open window", () => {
    const plan = buildRoutePlan({
      homeBase: HOME,
      queuedJobs: [],
      anchorsByDate: {
        "2026-08-10": [
          anchorJob("late", "2026-08-10", { windowStart: "14:00:00", coordinates: north(2) }),
          anchorJob("early", "2026-08-10", { windowStart: "09:00:00", coordinates: north(1) }),
        ],
      },
      horizonDates: ["2026-08-10"],
    });

    const day = plan.days[0];
    expect(day.stops.map((s) => s.job.id)).toEqual(["early", "late"]);
    // Early anchor: drive from home is minutes, but the window opens at 9:00.
    expect(day.stops[0].projectedArrivalMinutes).toBe(9 * 60);
    // Late anchor: departure from early (9:00 + 120) + short drive < 14:00, so it waits.
    expect(day.stops[1].projectedArrivalMinutes).toBe(14 * 60);
  });

  it("orders proposed stops by cheapest insertion from the home base outward", () => {
    const plan = buildRoutePlan({
      homeBase: HOME,
      queuedJobs: [
        queuedJob("far", { coordinates: north(6) }),
        queuedJob("near", { coordinates: north(2) }),
      ],
      anchorsByDate: {},
      horizonDates: ["2026-08-10"],
    });

    expect(plan.days[0].stops.map((s) => s.job.id)).toEqual(["near", "far"]);
  });

  it("proposes schedule-ready arrival windows for queued stops only", () => {
    const plan = buildRoutePlan({
      homeBase: HOME,
      queuedJobs: [queuedJob("q1", { coordinates: north(2) })],
      anchorsByDate: { "2026-08-10": [anchorJob("anchor", "2026-08-10", { coordinates: north(1) })] },
      horizonDates: ["2026-08-10"],
    });

    const day = plan.days[0];
    const anchorStop = day.stops.find((s) => s.kind === "anchor");
    const proposedStop = day.stops.find((s) => s.kind === "proposed");
    expect(anchorStop?.proposedWindows).toEqual([]);
    expect(anchorStop?.committedWindow).toEqual({ start: "09:00:00", end: "11:00:00" });

    expect(proposedStop).toBeDefined();
    expect(proposedStop!.proposedWindows.length).toBeGreaterThanOrEqual(1);
    for (const window of proposedStop!.proposedWindows) {
      expect(window.startHHMM).toMatch(/^\d{2}:\d{2}$/);
      expect(window.endHHMM).toMatch(/^\d{2}:\d{2}$/);
      expect(window.startHHMM < window.endHHMM).toBe(true);
    }
    // The primary window brackets the projected arrival.
    const primary = proposedStop!.proposedWindows[0];
    const arrival = proposedStop!.projectedArrivalMinutes;
    const [h, m] = primary.startHHMM.split(":").map(Number);
    expect(h * 60 + m).toBeLessThanOrEqual(arrival);
  });

  it("pushes stops that would run past day end into the next day", () => {
    const plan = buildRoutePlan(
      {
        homeBase: HOME,
        queuedJobs: [
          queuedJob("q1", { durationMinutes: 300, coordinates: north(1) }),
          queuedJob("q2", { durationMinutes: 300, coordinates: north(2) }),
        ],
        anchorsByDate: {},
        horizonDates: ["2026-08-10", "2026-08-11"],
      },
      { dayStartMinutes: 8 * 60, dayEndMinutes: 13 * 60 + 30, maxStopsPerDay: 8 },
    );

    // Both same-line insertions cost the same; the engine deterministically
    // keeps one stop and cascades the other — assert the shape, not the winner.
    expect(plan.days[0].stops).toHaveLength(1);
    expect(plan.days[0].stops[0].overflowsDay).toBe(false);
    expect(plan.days[1].stops).toHaveLength(1);
    expect([plan.days[0].stops[0].job.id, plan.days[1].stops[0].job.id].sort()).toEqual(["q1", "q2"]);
    expect(plan.unplanned).toEqual([]);
  });

  it("drops overflow to unplanned when the horizon has no room left", () => {
    const plan = buildRoutePlan(
      {
        homeBase: HOME,
        queuedJobs: [
          queuedJob("q1", { durationMinutes: 300, coordinates: north(1) }),
          queuedJob("q2", { durationMinutes: 300, coordinates: north(2) }),
        ],
        anchorsByDate: {},
        horizonDates: ["2026-08-10"],
      },
      { dayStartMinutes: 8 * 60, dayEndMinutes: 13 * 60 + 30, maxStopsPerDay: 8 },
    );

    expect(plan.days[0].stops).toHaveLength(1);
    expect(plan.days[0].stops[0].overflowsDay).toBe(false);
    expect(plan.unplanned).toHaveLength(1);
    expect(plan.unplanned[0].reason).toBe("no_capacity");
    expect([plan.days[0].stops[0].job.id, plan.unplanned[0].job.id].sort()).toEqual(["q1", "q2"]);
  });

  it("re-plans a dismissed job onto its next-best allowed day", () => {
    const plan = buildRoutePlan({
      homeBase: HOME,
      queuedJobs: [queuedJob("q1"), queuedJob("q2", { coordinates: north(2) })],
      anchorsByDate: {},
      horizonDates: ["2026-08-10", "2026-08-11"],
      excludedDatesByJobId: { q1: ["2026-08-10"] },
    });

    expect(plan.days[0].stops.map((s) => s.job.id)).toEqual(["q2"]);
    expect(plan.days[1].stops.map((s) => s.job.id)).toEqual(["q1"]);
    expect(plan.unplanned).toEqual([]);
  });

  it("surfaces a job dismissed from every day as unplanned/dismissed", () => {
    const plan = buildRoutePlan({
      homeBase: HOME,
      queuedJobs: [queuedJob("q1")],
      anchorsByDate: {},
      horizonDates: ["2026-08-10", "2026-08-11"],
      excludedDatesByJobId: { q1: ["2026-08-10", "2026-08-11"] },
    });

    expect(plan.days.every((day) => day.stops.length === 0)).toBe(true);
    expect(plan.unplanned).toEqual([
      expect.objectContaining({ reason: "dismissed", job: expect.objectContaining({ id: "q1" }) }),
    ]);
    expect(plan.plannedJobCount).toBe(0);
  });

  it("never cascades overflow onto a dismissed day", () => {
    // Both long jobs start on day 1; the overflowing one may not land on
    // day 2 (dismissed), so it skips to day 3.
    const plan = buildRoutePlan(
      {
        homeBase: HOME,
        queuedJobs: [
          queuedJob("q1", { durationMinutes: 300, coordinates: north(1) }),
          queuedJob("q2", { durationMinutes: 300, coordinates: north(2) }),
        ],
        anchorsByDate: {},
        horizonDates: ["2026-08-10", "2026-08-11", "2026-08-12"],
        excludedDatesByJobId: {
          q1: ["2026-08-11"],
          q2: ["2026-08-11"],
        },
      },
      { dayStartMinutes: 8 * 60, dayEndMinutes: 13 * 60 + 30, maxStopsPerDay: 8 },
    );

    expect(plan.days[0].stops).toHaveLength(1);
    expect(plan.days[1].stops).toHaveLength(0);
    expect(plan.days[2].stops).toHaveLength(1);
    expect(plan.unplanned).toEqual([]);
  });

  it("reports cluster labels from member cities", () => {
    const plan = buildRoutePlan({
      homeBase: HOME,
      queuedJobs: [
        queuedJob("q1", { city: "Stockton" }),
        queuedJob("q2", { city: "Lodi", coordinates: north(2) }),
      ],
      anchorsByDate: {},
      horizonDates: ["2026-08-10"],
    });
    expect(plan.clusters).toHaveLength(1);
    expect(plan.clusters[0].label).toBe("Stockton / Lodi");
  });
});
