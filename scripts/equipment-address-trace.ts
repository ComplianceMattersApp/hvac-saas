/**
 * Equipment-vs-Address trace — READ ONLY.
 *
 * Given a job id, shows the job's location, every job at that location, the
 * per-job equipment snapshots (job_systems / job_equipment), and what the
 * canonical location-owned inventory (customer_location_systems / equipment)
 * has for that address. Used to diagnose "new job at a known address asked to
 * recapture all equipment".
 *
 * Run:
 *   node --env-file=.env.prod scripts/equipment-address-trace.ts --job <job-id>
 */

import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

async function main() {
  const jobId = arg("job");
  if (!jobId) throw new Error("Pass --job <job-id>");

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.prod)");
  }
  console.log(`Supabase project: ${url.replace(/^https?:\/\//, "").split(".")[0]}`);

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: job, error: jobErr } = await db
    .from("jobs")
    .select("id, title, job_type, status, ops_status, created_at, customer_id, location_id, parent_job_id, job_address, city")
    .eq("id", jobId)
    .single();
  if (jobErr) throw jobErr;

  console.log(`\nJob ${job.id}`);
  console.log(`  title=${job.title} type=${job.job_type} status=${job.status}/${job.ops_status} created=${String(job.created_at).slice(0, 10)}`);
  console.log(`  address=${job.job_address ?? "(none)"} location_id=${job.location_id ?? "(none)"} customer_id=${job.customer_id ?? "(none)"} parent_job_id=${job.parent_job_id ?? "(none)"}`);

  if (!job.location_id) {
    console.log("\nJob has NO location_id — nothing address-scoped can attach to it.");
  }

  // All jobs at the same location
  const { data: siblingJobs, error: sibErr } = job.location_id
    ? await db
        .from("jobs")
        .select("id, title, job_type, status, ops_status, created_at, parent_job_id, deleted_at")
        .eq("location_id", job.location_id)
        .order("created_at", { ascending: true })
    : { data: [job], error: null };
  if (sibErr) throw sibErr;

  const jobs = siblingJobs ?? [];
  console.log(`\nJobs at this location: ${jobs.length}`);

  const jobIds = jobs.map((j: any) => j.id);
  const { data: sys } = await db
    .from("job_systems")
    .select("id, job_id, name, created_at")
    .in("job_id", jobIds);
  const { data: eq } = await db
    .from("job_equipment")
    .select("id, job_id, system_id, equipment_role, manufacturer, model, serial, tonnage, refrigerant_type, created_at")
    .in("job_id", jobIds);

  for (const j of jobs as any[]) {
    const jSys = (sys ?? []).filter((s: any) => s.job_id === j.id);
    const jEq = (eq ?? []).filter((e: any) => e.job_id === j.id);
    const marker = j.id === job.id ? " <== the job you linked" : "";
    console.log(`\n  ${String(j.created_at).slice(0, 10)}  ${j.title}  [${j.status}/${j.ops_status}]${j.deleted_at ? " DELETED" : ""}${marker}`);
    console.log(`    id=${j.id} parent=${j.parent_job_id ?? "-"}`);
    console.log(`    job_systems: ${jSys.map((s: any) => s.name).join(", ") || "(none)"}`);
    for (const e of jEq) {
      console.log(`    job_equipment: ${e.equipment_role} ${e.manufacturer ?? ""} ${e.model ?? ""} serial=${e.serial ?? "-"} tonnage=${e.tonnage ?? "-"}`);
    }
    if (!jEq.length) console.log(`    job_equipment: (none)`);
  }

  // Canonical location-owned inventory
  if (job.location_id) {
    const { data: cls } = await db
      .from("customer_location_systems")
      .select("id, name, system_type, archived_at, created_at")
      .eq("location_id", job.location_id);
    const { data: canonEq } = await db
      .from("equipment")
      .select("id, system_id, equipment_type, manufacturer, model, serial, status, retired_at, install_source, source_job_id, created_at")
      .eq("location_id", job.location_id);

    console.log(`\nCanonical inventory for location ${job.location_id}:`);
    console.log(`  customer_location_systems: ${(cls ?? []).length}`);
    for (const s of (cls ?? []) as any[]) {
      console.log(`    ${s.name} (${s.system_type ?? "?"})${s.archived_at ? " ARCHIVED" : ""}`);
    }
    console.log(`  equipment (canonical): ${(canonEq ?? []).length}`);
    for (const e of (canonEq ?? []) as any[]) {
      console.log(`    ${e.equipment_type ?? "?"} ${e.manufacturer ?? ""} ${e.model ?? ""} serial=${e.serial ?? "-"} status=${e.status} source=${e.install_source}/${e.source_job_id ?? "-"}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
