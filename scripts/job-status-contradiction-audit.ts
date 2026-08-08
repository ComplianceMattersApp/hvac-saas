/**
 * Read-only: counts jobs whose field status and ops status contradict each other.
 *
 * Policy says a tech would not be en route on a job that has an open exception, but
 * nothing enforces it: setting on_hold/pending_info leaves `status` untouched, and the
 * on_the_way transition never checks `ops_status`. This reports whether that gap has
 * actually produced bad rows, and how stale they are.
 *
 * READ ONLY. No writes. Run:
 *   node --env-file=.env.prod scripts/job-status-contradiction-audit.ts
 */

import { createClient } from "@supabase/supabase-js";

const EXCEPTION_OPS_STATUSES = [
  "pending_info",
  "on_hold",
  "waiting",
  "failed",
  "retest_needed",
  "pending_office_review",
  "invoice_required",
  "paperwork_required",
];

const ACTIVE_FIELD_STATUSES = ["on_the_way", "in_process"];

function daysSince(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const then = Date.parse(raw);
  if (!Number.isFinite(then)) return "—";
  return `${Math.floor((Date.now() - then) / 86_400_000)}d`;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, title, status, ops_status, scheduled_date, on_the_way_at, field_complete, pending_info_reason, on_hold_reason, updated_at",
    )
    .in("status", ACTIVE_FIELD_STATUSES)
    .in("ops_status", EXCEPTION_OPS_STATUSES)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const rows = data ?? [];
  console.log(`Jobs where an active field status coexists with an open exception: ${rows.length}\n`);

  for (const row of rows) {
    const reason = String(row.pending_info_reason ?? row.on_hold_reason ?? "").trim();
    console.log(`  ${row.id}`);
    console.log(`    ${String(row.title ?? "").slice(0, 60)}`);
    console.log(`    status=${row.status}  ops_status=${row.ops_status}  field_complete=${row.field_complete}`);
    console.log(`    on_the_way_at=${row.on_the_way_at ?? "—"} (${daysSince(row.on_the_way_at)} ago)`);
    console.log(`    last updated ${daysSince(row.updated_at)} ago`);
    if (reason) console.log(`    reason: ${reason.slice(0, 80)}`);
    console.log("");
  }

  // A closed job that still carries an active field status is the same class of bug.
  const { data: closedActive, error: closedError } = await supabase
    .from("jobs")
    .select("id, status, ops_status")
    .in("status", ACTIVE_FIELD_STATUSES)
    .eq("ops_status", "closed")
    .is("deleted_at", null);

  if (closedError) throw closedError;
  console.log(`Closed jobs still carrying an active field status: ${(closedActive ?? []).length}`);
  for (const row of closedActive ?? []) {
    console.log(`  ${row.id}  status=${row.status}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
