import type { CoordinatePair } from "./coordinates";
import type { DriveTimeMatrix } from "./drive-time-matrix";
import { estimateDriveMinutes, haversineKm } from "./geometry";
import type { PlanAnchor } from "./route-plan";

/**
 * Day-fit scoring: for one job (the customer on the phone), score every day in
 * the horizon so the dispatcher can answer "how about Tuesday?" instantly.
 *
 *  - near_work: committed stops already sit near this job that day — best days.
 *  - open: room, but nothing nearby — a solo trip priced at its round-trip cost.
 *  - full: no stop capacity left.
 *
 * Pure and deterministic; straight-line estimates like the rest of lib/routing.
 */

export type DayFitKind = "near_work" | "open" | "full";

export type DayFit = {
  date: string;
  kind: DayFitKind;
  anchorCount: number;
  capacityLeft: number;
  /** near_work: distance to the closest committed stop that day. */
  nearestAnchorKm: number | null;
  /** near_work: label of that stop (city preferred) for "near Lodi work" copy. */
  nearestAnchorLabel: string | null;
  /** near_work: estimated extra minutes to detour from that stop. */
  detourMinutes: number | null;
  /** open: estimated round-trip minutes from the home base (null without one). */
  roundTripMinutes: number | null;
};

// "30 minutes away is not far at all" — neighboring-city range counts as near.
export const DEFAULT_NEAR_THRESHOLD_KM = 25;

export function scoreDayFitsForJob(params: {
  coordinates: CoordinatePair;
  anchorsByDate: Record<string, PlanAnchor[]>;
  horizonDates: string[];
  homeBase: CoordinatePair | null;
  maxStopsPerDay?: number;
  nearThresholdKm?: number;
  /** Pre-fetched live drive times; legs it does not cover use estimates. */
  driveTimes?: DriveTimeMatrix | null;
}): DayFit[] {
  const maxStopsPerDay = params.maxStopsPerDay ?? 8;
  const nearThresholdKm = params.nearThresholdKm ?? DEFAULT_NEAR_THRESHOLD_KM;

  return params.horizonDates.map((date) => {
    const anchors = params.anchorsByDate[date] ?? [];
    const capacityLeft = Math.max(0, maxStopsPerDay - anchors.length);

    if (capacityLeft === 0) {
      return {
        date,
        kind: "full" as const,
        anchorCount: anchors.length,
        capacityLeft,
        nearestAnchorKm: null,
        nearestAnchorLabel: null,
        detourMinutes: null,
        roundTripMinutes: null,
      };
    }

    let nearestKm = Number.POSITIVE_INFINITY;
    let nearestAnchor: PlanAnchor | null = null;
    for (const anchor of anchors) {
      if (!anchor.coordinates) continue;
      const km = haversineKm(anchor.coordinates, params.coordinates);
      if (km < nearestKm) {
        nearestKm = km;
        nearestAnchor = anchor;
      }
    }

    if (nearestAnchor && nearestKm <= nearThresholdKm) {
      return {
        date,
        kind: "near_work" as const,
        anchorCount: anchors.length,
        capacityLeft,
        nearestAnchorKm: Math.round(nearestKm * 10) / 10,
        nearestAnchorLabel:
          String(nearestAnchor.city ?? "").trim() || String(nearestAnchor.title ?? "").trim() || null,
        detourMinutes: nearestAnchor.coordinates
          ? estimateDriveMinutes(nearestAnchor.coordinates, params.coordinates, params.driveTimes)
          : null,
        roundTripMinutes: null,
      };
    }

    return {
      date,
      kind: "open" as const,
      anchorCount: anchors.length,
      capacityLeft,
      nearestAnchorKm: null,
      nearestAnchorLabel: null,
      detourMinutes: null,
      roundTripMinutes: params.homeBase
        // Each direction is looked up separately: real road networks are not
        // symmetric, so an out-and-back is not always twice the outbound leg.
        ? estimateDriveMinutes(params.homeBase, params.coordinates, params.driveTimes)
          + estimateDriveMinutes(params.coordinates, params.homeBase, params.driveTimes)
        : null,
    };
  });
}
