/**
 * Heal a job whose ops_status is stuck on invoice_required / paperwork_required
 * even though closeout truth is fully satisfied (field + certs + an issued,
 * membership-aware primary invoice or resolved billing disposition).
 *
 * Root cause this repairs: the certs-closeout billing lookup used to be blind
 * to consolidated invoices linked via internal_invoice_jobs, so it wrote
 * invoice_required over an already-billed job (e.g. prod job #1393).
 *
 * DRY RUN by default — prints what it would do. Pass --apply to write.
 * Run:
 *   node --env-file=.env.prod scripts/heal-job-closeout-status.ts --job <jobId> [--apply]
 */

import { createClient } from "@supabase/supabase-js";

const HEALABLE_STATUSES = new Set(["invoice_required", "paperwork_required"]);

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Use --env-file=.env.prod");
    process.exit(1);
  }
  const jobId = arg("job");
  if (!jobId) {
    console.error("Pass --job <jobId>");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, title, job_type, status, ops_status, field_complete, certs_complete, invoice_complete, billing_disposition, permit_number")
    .eq("id", jobId)
    .single();
  if (jobErr) throw new Error(jobErr.message);

  console.log(`Job ${job.id} (${job.title ?? "untitled"})`);
  console.log(`  ops_status=${job.ops_status}  field=${job.field_complete}  certs=${job.certs_complete}  invoice_complete=${job.invoice_complete}  disposition=${job.billing_disposition ?? "—"}`);

  if (!HEALABLE_STATUSES.has(String(job.ops_status ?? "").trim().toLowerCase())) {
    console.log(`\nNothing to heal: ops_status is not one of ${[...HEALABLE_STATUSES].join(", ")}.`);
    return;
  }
  if (!job.field_complete || !job.certs_complete) {
    console.log("\nRefusing: field or certs are genuinely incomplete — this is not the stale-status case.");
    return;
  }

  // Billing truth, membership-aware — mirrors lib/business/job-billing-state.ts.
  const disposition = String(job.billing_disposition ?? "").trim().toLowerCase();
  const hasResolvedDisposition = disposition === "no_charge" || disposition === "externally_billed";

  const { data: direct, error: directErr } = await supabase
    .from("internal_invoices")
    .select("id, invoice_display_number, status")
    .eq("job_id", jobId)
    .eq("invoice_kind", "primary")
    .neq("status", "void");
  if (directErr) throw new Error(directErr.message);

  let issuedInvoice = (direct ?? []).find((row) => String(row.status).toLowerCase() === "issued") ?? null;
  let linkage = issuedInvoice ? "job_id" : null;

  if (!issuedInvoice) {
    const { data: memberships, error: memberErr } = await supabase
      .from("internal_invoice_jobs")
      .select("internal_invoice_id, internal_invoices!inner(id, invoice_display_number, status, invoice_kind)")
      .eq("job_id", jobId)
      .eq("internal_invoices.invoice_kind", "primary")
      .neq("internal_invoices.status", "void");
    if (memberErr) throw new Error(memberErr.message);
    for (const m of memberships ?? []) {
      const inv = Array.isArray((m as any).internal_invoices)
        ? (m as any).internal_invoices[0]
        : (m as any).internal_invoices;
      if (inv && String(inv.status).toLowerCase() === "issued") {
        issuedInvoice = inv;
        linkage = "membership";
        break;
      }
    }
  }

  if (!issuedInvoice && !hasResolvedDisposition) {
    console.log("\nRefusing: no issued primary invoice (direct or membership) and no resolved billing disposition — billing truth is genuinely unsatisfied.");
    return;
  }

  console.log(`\nBilling truth satisfied: ${issuedInvoice ? `issued invoice #${issuedInvoice.invoice_display_number ?? issuedInvoice.id} (linked via ${linkage})` : `billing disposition ${disposition}`}`);
  console.log(`Heal: ops_status ${job.ops_status} -> closed${job.invoice_complete ? "" : ", invoice_complete -> true"}`);

  if (!apply) {
    console.log("\nDRY RUN — re-run with --apply to write.");
    return;
  }

  const updatePayload: Record<string, unknown> = { ops_status: "closed" };
  if (!job.invoice_complete) updatePayload.invoice_complete = true;

  const { error: updErr } = await supabase.from("jobs").update(updatePayload).eq("id", jobId);
  if (updErr) throw new Error(updErr.message);

  const { error: evErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "ops_update",
    message: "Ops status healed to closed",
    meta: {
      timeline_v: 2,
      event_family: "ops_heal",
      source_action: "heal-job-closeout-status-script",
      reason: "consolidated_invoice_blind_closeout_lookup",
      changes: [
        { field: "ops_status", from: job.ops_status, to: "closed" },
        ...(job.invoice_complete ? [] : [{ field: "invoice_complete", from: false, to: true }]),
      ],
    },
  });
  if (evErr) throw new Error(evErr.message);

  console.log("\nHealed. Job is now closed with an audit event on its timeline.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
