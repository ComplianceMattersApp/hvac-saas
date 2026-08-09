import type { CoordinatePair } from "./coordinates";

/**
 * URL builders for route visualization. Pure functions — the Static Maps key
 * is passed in by the (server-component) caller. Follows the deep-link idiom
 * used across field surfaces rather than embedding an interactive map.
 */

export type RouteMapStop = CoordinatePair & {
  /** 1-based route order; rendered as the marker label (digits/letters only). */
  order: number;
};

function point(coordinates: CoordinatePair): string {
  return `${coordinates.latitude},${coordinates.longitude}`;
}

/** Static Maps marker labels only support a single character A-Z or 0-9. */
function markerLabel(order: number): string | null {
  if (order >= 1 && order <= 9) return String(order);
  const letterIndex = order - 10;
  if (letterIndex >= 0 && letterIndex < 26) return String.fromCharCode(65 + letterIndex);
  return null;
}

/**
 * Static map with the home base (H, dark) and numbered route stops. Returns
 * null without a key or stops — callers render nothing rather than a broken
 * image.
 */
export function buildRouteStaticMapUrl(params: {
  apiKey: string | null | undefined;
  homeBase: CoordinatePair | null;
  stops: RouteMapStop[];
  /** Optional emphasized pin (e.g. the customer being called), drawn green. */
  highlight?: CoordinatePair | null;
  /** Already-booked stops drawn as small slate context dots. */
  contextStops?: CoordinatePair[];
  width?: number;
  height?: number;
}): string | null {
  const apiKey = String(params.apiKey ?? "").trim();
  if (!apiKey || (params.stops.length === 0 && !params.highlight)) return null;

  const query = new URLSearchParams({
    size: `${params.width ?? 640}x${params.height ?? 320}`,
    scale: "2",
    key: apiKey,
  });

  if (params.homeBase) {
    query.append("markers", `color:0x0f1f35|label:H|${point(params.homeBase)}`);
  }
  for (const stop of params.stops) {
    const label = markerLabel(stop.order);
    query.append(
      "markers",
      label ? `color:0x2563eb|label:${label}|${point(stop)}` : `color:0x2563eb|${point(stop)}`,
    );
  }
  for (const context of params.contextStops ?? []) {
    query.append("markers", `size:small|color:0x64748b|${point(context)}`);
  }
  if (params.highlight) {
    query.append("markers", `color:0x059669|label:C|${point(params.highlight)}`);
  }

  return `https://maps.googleapis.com/maps/api/staticmap?${query.toString()}`;
}

/**
 * Multi-stop Google Maps directions deep link: home base → each stop in
 * order → back to home base. The Maps URL API caps waypoints at 9; overflow
 * stops are dropped from the middle (the link is a navigation convenience,
 * not the source of truth).
 */
export function buildMultiStopDirectionsUrl(params: {
  homeBase: CoordinatePair | null;
  stops: CoordinatePair[];
}): string | null {
  if (params.stops.length === 0) return null;

  const origin = params.homeBase ?? params.stops[0];
  const destination = params.homeBase ?? params.stops[params.stops.length - 1];
  const between = params.homeBase ? params.stops : params.stops.slice(1, -1);
  const waypoints = between.slice(0, 9);

  const query = new URLSearchParams({
    api: "1",
    origin: point(origin),
    destination: point(destination),
    travelmode: "driving",
  });
  if (waypoints.length > 0) {
    query.set("waypoints", waypoints.map(point).join("|"));
  }

  return `https://www.google.com/maps/dir/?${query.toString()}`;
}
