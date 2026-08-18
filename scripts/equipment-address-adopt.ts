/**
 * Equipment address adoption — the assisted one-time link from historical
 * per-job equipment snapshots into the canonical location-owned inventory
 * (VISUAL-ALIGNMENT-SPEC.md §8.3: assisted, never automatic fuzzy migration).
 *
 * For each job that captured equipment (oldest first, so the earliest capture
 * establishes the unit and later jobs link by serial/spec match), runs
 * adoptJobEquipmentIntoLocationInventory. Snapshot rows are never rewritten;
 * the canonical tables gain the units with install_source='job' provenance.
 *
 * Dry-run by default; nothing is written without --apply.
 *
 *   npx tsx --env-file=.env.prod scripts/equipment-address-adopt.ts                       # dry run, all accounts
 *   npx tsx --env-file=.env.prod scripts/equipment-address-adopt.ts --location <id>       # one address
 *   npx tsx --env-file=.env.prod scripts/equipment-address-adopt.ts --apply --location <id>
 *   npx tsx --env-file=.env.prod scripts/equipment-address-adopt.ts --apply --seed-job <job-id>
 *
 * --seed-job additionally copies the location's (post-adoption) active units
 * into that job's own snapshot, for a job that was opened empty at a known
 * address. Requires --apply.
 */

import { createClient } from "@supabase/supabase-js";
import {
  adoptJobEquipmentIntoLocationInventory,
  seedJobEquipmentFromLocationInventory,
} from "../lib/customers/location-equipment-adoption";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const locationFilter = arg("location");
  const accountFilter = arg("account");
  const seedJobId = arg("seed-job");

  if (seedJobId && !apply) throw new Error("--seed-job requires --apply");

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.prod)");
  }
  console.log(`Supabase project: ${url.replace(/^https?:\/\//, "").split(".")[0]}`);
  console.log(`Mode: ${apply ? "APPLY" : "dry run"}`);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Candidate jobs: have equipment snapshots and a location.
  const { data: equipmentJobRows, error: eqJobsErr } = await admin
    .from("job_equipment")
    .select("job_id")
    .limit(10000);
  if (eqJobsErr) throw eqJobsErr;

  const jobIdsWithEquipment = [...new Set((equipmentJobRows ?? []).map((r: any) => String(r.job_id)))];
  if (!jobIdsWithEquipment.length) {
    console.log("No job_equipment rows anywhere — nothing to adopt.");
    return;
  }

  let jobsQuery = admin
    .from("jobs")
    .select("id, title, created_at, location_id, customer_id, deleted_at")
    .in("id", jobIdsWithEquipment)
    .not("location_id", "is", null)
    .order("created_at", { ascending: true });
  if (locationFilter) jobsQuery = jobsQuery.eq("location_id", locationFilter);
  const { data: jobRows, error: jobsErr } = await jobsQuery;
  if (jobsErr) throw jobsErr;

  let jobs = (jobRows ?? []).filter((j: any) => !j.deleted_at);

  if (accountFilter) {
    const locationIds = [...new Set(jobs.map((j: any) => String(j.location_id)))];
    const { data: locRows, error: locErr } = await admin
      .from("locations")
      .select("id, owner_user_id")
      .in("id", locationIds);
    if (locErr) throw locErr;
    const allowed = new Set(
      (locRows ?? []).filter((l: any) => String(l.owner_user_id) === accountFilter).map((l: any) => String(l.id)),
    );
    jobs = jobs.filter((j: any) => allowed.has(String(j.location_id)));
  }

  console.log(`Jobs with equipment snapshots + a location: ${jobs.length}`);

  if (!apply) {
    const byLocation = new Map<string, any[]>();
    for (const j of jobs) {
      const key = String(j.location_id);
      byLocation.set(key, [...(byLocation.get(key) ?? []), j]);
    }
    for (const [locationId, locJobs] of byLocation) {
      const { count: canonicalCount } = await admin
        .from("equipment")
        .select("id", { count: "exact", head: true })
        .eq("location_id", locationId);
      const { count: snapshotCount } = await admin
        .from("job_equipment")
        .select("id", { count: "exact", head: true })
        .in("job_id", locJobs.map((j: any) => j.id));
      console.log(
        `\n  location ${locationId}: ${locJobs.length} job(s), ${snapshotCount ?? 0} snapshot row(s), ${canonicalCount ?? 0} canonical unit(s) already on file`,
      );
      for (const j of locJobs) {
        console.log(`    ${String(j.created_at).slice(0, 10)}  ${j.title}  (${j.id})`);
      }
    }
    console.log("\nDry run only — re-run with --apply to adopt.");
    return;
  }

  let adopted = 0;
  let createdUnits = 0;
  let createdSystems = 0;
  let linked = 0;
  for (const j of jobs) {
    const result = await adoptJobEquipmentIntoLocationInventory({ admin, jobId: String(j.id) });
    if (result.status === "adopted") {
      adopted += 1;
      createdUnits += result.createdUnits;
      createdSystems += result.createdSystems;
      linked += result.linked;
      console.log(
        `  adopted job ${j.id} (${String(j.created_at).slice(0, 10)} ${j.title}): +${result.createdUnits} unit(s), +${result.createdSystems} system(s), ${result.linked} snapshot link(s)`,
      );
    } else {
      console.log(`  skipped job ${j.id}: ${result.reason}`);
    }
  }
  console.log(
    `\nAdoption complete: ${adopted} job(s) processed, ${createdUnits} canonical unit(s) created, ${createdSystems} system(s) created, ${linked} snapshot(s) linked.`,
  );

  if (seedJobId) {
    const seedResult = await seedJobEquipmentFromLocationInventory({ admin, jobId: seedJobId });
    if (seedResult.status === "seeded") {
      console.log(
        `Seeded job ${seedJobId} from its address inventory: ${seedResult.seededUnits} unit(s), ${seedResult.createdSystems} system(s).`,
      );
    } else {
      console.log(`Seed skipped for job ${seedJobId}: ${seedResult.reason}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
