# Route Planning V1 — Current State

Status: SHIPPED — describes what is in the code, not a plan
Date: 2026-08-09 (documenting work shipped 2026-08-08)
Authority: `lib/routing/` and its tests are the authority. This document describes them; where the two disagree, the code wins.

This lane shipped with no documentation and was, until 2026-08-09, still listed in `CURRENT_ROADMAP.md` under deferrals as an unbuilt nice-to-have. This document closes that gap.

## What it is

Route-first dispatch planning. Given the unscheduled queue, the jobs already committed for each day, and a home base, it proposes **which day each queued job belongs to, in what drive order, with a projected timeline and a customer-facing arrival window** — the answer a dispatcher needs while the customer is still on the phone.

Surfaced at `/calendar?view=plan`.

## Core design decision: proposals are ephemeral

`buildRoutePlan` is **pure and deterministic**, and its output is **never persisted**. The plan is recomputed from live data on every render.

This is the load-bearing decision in the lane. Because nothing is stored, a schedule change simply re-flows the plan; there is no stored proposal to invalidate, reconcile, or drift out of sync with reality. It also means there is no migration surface for the planner itself — the only persisted routing data is coordinates on `locations`.

## The surface: Call Worksheet (`/calendar?view=plan`)

The engine below is only half the lane, and the half this document originally described. The operator-facing surface is `components/calendar/RoutePlanView.tsx` — a **route-first scheduling companion built for the phone call**, not a map.

Its design commitments:

- **Nothing is pre-committed.** The unscheduled queue is presented as geographic groupings with a target day in mind, never as an auto-assigned schedule.
- **Every customer carries a two-week day-fit strip**, so "how about Tuesday?" is answered at a glance mid-call rather than by re-planning.
- **Each booked window becomes an anchor** that re-scores everything else on the next render — a direct consequence of proposals being ephemeral.
- **Impact is stated in the operator's terms**: selecting a worse day says how much extra driving it costs against the best day, and shows projected arrival and offerable windows.
- **Failure is a first-class outcome.** A call that does not book is logged and moved past, rather than leaving the job in an ambiguous state.
- Day strips wrap on narrow screens rather than running off-canvas.

## Modules

| File | Role |
|---|---|
| `route-plan.ts` | The engine. Day assignment, drive order, projected timeline, arrival windows, clustering. |
| `day-fit.ts` | Scores every day in the horizon for **one** job — the "how about Tuesday?" question. |
| `geometry.ts` | Haversine distance, drive-time estimation, bearings, time formatting. |
| `cluster` rules | Inside `route-plan.ts`; see below. |
| `coordinates.ts` | Pure coordinate validation/normalization. Client-safe (no env, no Supabase). |
| `geocode-address.ts` | Server-side geocoding. |
| `route-links.ts` | Static map and multi-stop Google Maps deep links. |
| `routing-env.ts` | Key selection and availability. |

## Planning inputs and tuning

`RoutePlanInput`: `homeBase`, `queuedJobs`, `anchorsByDate` (already-committed stops per day), `horizonDates` (ordered, earliest first), and `excludedDatesByJobId`.

That last one is the dispatcher's "✕ not this day" dismissal. A dismissed job re-plans onto its next-best allowed day; a job dismissed from every feasible day surfaces as unplanned with reason `dismissed`, rather than silently disappearing.

`RoutePlanOptions` defaults:

| Option | Default | Meaning |
|---|---|---|
| `dayStartMinutes` | `8 * 60` | 08:00 |
| `dayEndMinutes` | `18 * 60` | 18:00 |
| `defaultDurationMinutes` | `120` | Assumed job length when none is known |
| `maxStopsPerDay` | `8` | Capacity ceiling |
| `clusterThresholdKm` | `8` | Proximity grouping distance |

`defaultDurationMinutes` is the weakest assumption in the engine: every job without a known duration is planned as two hours. Per-job duration entry is the natural next slice.

## Clustering: three layered rules

Documented here because the rationale is dispatcher-domain reasoning that is not obvious from the function signature:

1. **Group by city, merge neighbors.** Cities within roughly 30 minutes of reach merge into one working territory — "Stockton / Lodi", "Sacramento / Elk Grove / Galt".
2. **Cap the territory span.** Prevents two metro areas chaining into a single blob through a city that borders both.
3. **Stay in the lane.** Outlying cities only share a territory when they sit in roughly the same *direction* from the home base. Stockton→Lodi points a day north; Manteca is close but the other way, so it belongs to a different day.

Rule 3 is why `bearingDegrees` and `angularDifferenceDegrees` exist in `geometry.ts`.

## Day fit

`scoreDayFitsForJob` classifies each day for a single job:

- **`near_work`** — committed stops already sit near this job that day. Best days.
- **`open`** — room exists, but nothing nearby; priced at its round-trip cost as a solo trip.
- **`full`** — no stop capacity left.

`DEFAULT_NEAR_THRESHOLD_KM = 25`.

## Known limitation: straight-line estimates

`estimateDriveMinutes` uses **haversine distance with conservative city-driving assumptions**. There are no live drive times and no traffic. Estimates are deliberately pessimistic rather than optimistic.

This is a known, bounded limitation, not an oversight. `geometry.ts` is the single seam: the Google Routes API fast-follow can replace these estimates **without changing any call site**, because every consumer takes minutes from these helpers rather than computing distance itself.

Treat arrival windows as planning guidance, not commitments, until that lands.

## Maps and deep links

- `buildRouteStaticMapUrl` — static map, home base marked `H` in dark, stops numbered in route order. Returns `null` without a key or stops, so callers render nothing rather than a broken image.
- `buildMultiStopDirectionsUrl` — home base → stops in order → home base. **The Google Maps URL API caps waypoints at 9**; overflow stops are dropped from the middle. The link is a navigation convenience, not the source of truth.

## Environment: the key selection gotcha

`requireGoogleMapsServerKey()` prefers **`GOOGLE_MAPS_GEOCODING_API_KEY`** — a dedicated server-to-server key with **no referrer restriction**. It falls back to `GOOGLE_MAPS_API_KEY`, which works only if that key is unrestricted.

The house `GOOGLE_MAPS_API_KEY` **is** referrer-restricted, because it ships inside Static Maps `<img>` URLs. Google rejects referrer-restricted keys for Geocoding and Routes with `REQUEST_DENIED`. Production therefore needs the dedicated key set, and a routing failure that reports `REQUEST_DENIED` almost certainly means the fallback key was used.

`getRoutingAvailability()` mirrors the QBO/Stripe availability idiom so callers can degrade rather than throw.

## Data

Coordinates live on `locations` (latitude/longitude), captured by the address autocomplete path and by server-side geocode backfill. `normalizeCoordinatePair` rejects out-of-range values and the `0,0` "null island" placeholder, so a failed geocode cannot enter the planner as a valid point off the coast of Africa.

Migrations were applied and both databases backfilled on 2026-08-08.

## Not done

- Live drive times (Google Routes API) — the intended next slice.
- Per-job duration entry; everything unknown is 120 minutes.
- Traffic, time-of-day variation, and technician-specific skills or territories.
- Multi-technician assignment. The planner reasons about a day, not about who works it.
- Persisted or shareable plans; by design, see above.
