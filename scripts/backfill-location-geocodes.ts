/**
 * Backfills coordinates onto `locations` rows that predate autocomplete
 * coordinate capture (or were entered manually).
 *
 * Dry-run by default; nothing is written without --apply.
 *
 *   npx tsx scripts/backfill-location-geocodes.ts                       # dry run, all accounts
 *   npx tsx scripts/backfill-location-geocodes.ts --account <owner-id>  # dry run, one account
 *   npx tsx scripts/backfill-location-geocodes.ts --apply --limit 500   # write coordinates
 *
 * Requires GOOGLE_MAPS_API_KEY (Geocoding API enabled) plus the Supabase
 * admin env vars. Point the env at the target project before running —
 * the app database is the kvpesj project (see ENVIRONMENT_RULES.md).
 */

import { geocodeAddress, type GeocodeAddressResult } from "../lib/routing/geocode-address";
import { getRoutingAvailability } from "../lib/routing/routing-env";
import { createAdminClient } from "../lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedGeocodeBackfillArgs = {
  apply: boolean;
  accountOwnerUserId: string | null;
  limit: number;
  jsonOutput: boolean;
};

type LocationRow = {
  id: string;
  owner_user_id: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type GeocodeBackfillRowResult = {
  locationId: string;
  address: string;
  outcome: "geocoded" | "zero_results" | "unavailable" | "update_failed";
  detail?: string;
};

export type GeocodeBackfillResult = {
  mode: "dry_run" | "apply";
  scanned: number;
  geocoded: number;
  applied: number;
  zeroResults: number;
  unavailable: number;
  updateFailures: number;
  rows: GeocodeBackfillRowResult[];
  errors: string[];
};

type BackfillQueryResponse = { data: unknown; error: { message: string } | null };

type LocationSelectBuilder = {
  is(column: string, value: unknown): LocationSelectBuilder;
  not(column: string, operator: string, value: unknown): LocationSelectBuilder;
  eq(column: string, value: unknown): LocationSelectBuilder;
  order(column: string, options?: { ascending?: boolean }): LocationSelectBuilder;
  limit(count: number): PromiseLike<BackfillQueryResponse>;
};

export type GeocodeBackfillClient = {
  from(table: "locations"): {
    select(columns: string): LocationSelectBuilder;
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: unknown,
      ): { is(column: string, value: unknown): PromiseLike<{ error: { message: string } | null }> };
    };
  };
};

export type GeocodeBackfillDeps = {
  createClient: () => GeocodeBackfillClient;
  geocode: (input: {
    addressLine1: string;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  }) => Promise<GeocodeAddressResult>;
  routingAvailability: () => { available: boolean; missingKeys: string[] };
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

export function parseGeocodeBackfillArgs(argv: string[]): ParsedGeocodeBackfillArgs | { error: string } {
  const args: ParsedGeocodeBackfillArgs = {
    apply: false,
    accountOwnerUserId: null,
    limit: 200,
    jsonOutput: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] ?? "").trim();
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--json") {
      args.jsonOutput = true;
    } else if (arg === "--account") {
      const value = String(argv[i + 1] ?? "").trim();
      if (!value) return { error: "--account requires an account owner user id" };
      args.accountOwnerUserId = value;
      i += 1;
    } else if (arg === "--limit") {
      const value = Number(String(argv[i + 1] ?? "").trim());
      if (!Number.isInteger(value) || value < 1 || value > 5000) {
        return { error: "--limit must be an integer between 1 and 5000" };
      }
      args.limit = value;
      i += 1;
    } else if (arg) {
      return { error: `Unknown argument: ${arg}` };
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

function composeAddressLabel(row: LocationRow): string {
  return [row.address_line1, row.city, row.state, row.zip]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runLocationGeocodeBackfill(
  args: ParsedGeocodeBackfillArgs,
  deps: GeocodeBackfillDeps,
): Promise<GeocodeBackfillResult> {
  const result: GeocodeBackfillResult = {
    mode: args.apply ? "apply" : "dry_run",
    scanned: 0,
    geocoded: 0,
    applied: 0,
    zeroResults: 0,
    unavailable: 0,
    updateFailures: 0,
    rows: [],
    errors: [],
  };

  const availability = deps.routingAvailability();
  if (!availability.available) {
    result.errors.push(`Geocoding unavailable — missing env: ${availability.missingKeys.join(", ")}`);
    return result;
  }

  const supabase = deps.createClient();
  let query = supabase
    .from("locations")
    .select("id, owner_user_id, address_line1, address_line2, city, state, zip")
    .is("latitude", null)
    .not("address_line1", "is", null);

  if (args.accountOwnerUserId) {
    query = query.eq("owner_user_id", args.accountOwnerUserId);
  }

  const { data, error } = await query.order("created_at", { ascending: true }).limit(args.limit);
  if (error) {
    result.errors.push(`Failed to load locations: ${error.message}`);
    return result;
  }

  const rows = (data ?? []) as LocationRow[];
  const sleep = deps.sleep ?? defaultSleep;
  const delayMs = deps.delayMs ?? 120;

  for (const row of rows) {
    result.scanned += 1;
    const addressLabel = composeAddressLabel(row);
    const geocoded = await deps.geocode({
      addressLine1: String(row.address_line1 ?? "").trim(),
      addressLine2: row.address_line2,
      city: row.city,
      state: row.state,
      zip: row.zip,
    });

    if (geocoded.status === "zero_results") {
      result.zeroResults += 1;
      result.rows.push({ locationId: row.id, address: addressLabel, outcome: "zero_results" });
    } else if (geocoded.status === "unavailable") {
      result.unavailable += 1;
      result.rows.push({
        locationId: row.id,
        address: addressLabel,
        outcome: "unavailable",
        detail: `${geocoded.reason}${geocoded.detail ? `: ${geocoded.detail}` : ""}`,
      });
      // A missing key or repeated transport failure will fail every remaining
      // row the same way — stop early instead of burning the whole batch.
      if (geocoded.reason === "missing_key" || result.unavailable >= 5) {
        result.errors.push("Stopping early after repeated geocoder failures.");
        break;
      }
    } else {
      result.geocoded += 1;
      if (args.apply) {
        const { error: updateError } = await supabase
          .from("locations")
          .update({
            latitude: geocoded.coordinates.latitude,
            longitude: geocoded.coordinates.longitude,
            geocode_source: "geocoding_backfill",
            geocoded_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .is("latitude", null);

        if (updateError) {
          result.updateFailures += 1;
          result.rows.push({
            locationId: row.id,
            address: addressLabel,
            outcome: "update_failed",
            detail: updateError.message,
          });
          continue;
        }
        result.applied += 1;
      }
      result.rows.push({ locationId: row.id, address: addressLabel, outcome: "geocoded" });
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return result;
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

async function main() {
  const parsed = parseGeocodeBackfillArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(JSON.stringify({ mode: "error", errors: [parsed.error] }, null, 2));
    process.exitCode = 1;
    return;
  }

  const result = await runLocationGeocodeBackfill(parsed, {
    createClient: () => createAdminClient() as unknown as GeocodeBackfillClient,
    geocode: geocodeAddress,
    routingAvailability: getRoutingAvailability,
  });

  if (parsed.jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const summary = {
      mode: result.mode,
      scanned: result.scanned,
      geocoded: result.geocoded,
      applied: result.applied,
      zero_results: result.zeroResults,
      unavailable: result.unavailable,
      update_failures: result.updateFailures,
      errors: result.errors,
    };
    console.log(JSON.stringify(summary, null, 2));
    for (const row of result.rows) {
      if (row.outcome !== "geocoded") {
        console.log(`${row.outcome}: ${row.locationId} — ${row.address}${row.detail ? ` (${row.detail})` : ""}`);
      }
    }
  }

  if (result.errors.length > 0 || result.updateFailures > 0) {
    process.exitCode = 1;
  }
}

if (!process.env.VITEST) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unexpected script failure";
    console.error(JSON.stringify({ mode: "error", errors: [message] }, null, 2));
    process.exitCode = 1;
  });
}
