/**
 * Read-only diagnostic for the "paid invoice + invoice_required ops status" gap.
 * Prints a job's closeout flags, every internal invoice attached to it (direct
 * job_id link AND consolidated membership), and the ops_update event history —
 * so we can see which action last wrote ops_status and what it believed about
 * billing at the time.
 *
 * READ ONLY. No writes. Run:
 *   node --env-file=.env.prod scripts/job-status-invoice-gap-debug.ts --job <jobId>
 */

import { createClient } from "@supabase/supabase-js";

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
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      "id, title, job_type, status, ops_status, field_complete, certs_complete, invoice_complete, billing_disposition, permit_number, pending_info_reason, invoice_number, created_at",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) throw new Error(jobErr.message);
  if (!job) {
    console.log(`No job ${jobId}`);
    return;
  }

  console.log("JOB CLOSEOUT FLAGS:");
  for (const [k, v] of Object.entries(job)) {
    console.log(`  ${k.padEnd(22)} ${v === null || v === undefined || v === "" ? "—" : v}`);
  }

  const { data: directInvoices, error: directErr } = await supabase
    .from("internal_invoices")
    .select("id, invoice_display_number, invoice_kind, status, issued_at, voided_at, job_id, total_cents, created_at")
    .eq("job_id", jobId);
  if (directErr) throw new Error(directErr.message);

  const { data: memberships, error: memberErr } = await supabase
    .from("internal_invoice_jobs")
    .select("internal_invoice_id, internal_invoices!inner(id, invoice_display_number, invoice_kind, status, issued_at, voided_at, job_id, total_cents, created_at)")
    .eq("job_id", jobId);
  if (memberErr) throw new Error(memberErr.message);

  const seen = new Set<string>();
  const allInvoices: any[] = [];
  for (const inv of directInvoices ?? []) {
    if (!seen.has(inv.id)) {
      seen.add(inv.id);
      allInvoices.push({ ...inv, linkage: "job_id" });
    }
  }
  for (const m of memberships ?? []) {
    const inv = Array.isArray((m as any).internal_invoices)
      ? (m as any).internal_invoices[0]
      : (m as any).internal_invoices;
    if (inv && !seen.has(inv.id)) {
      seen.add(inv.id);
      allInvoices.push({ ...inv, linkage: "membership_only" });
    }
  }

  console.log(`\nINTERNAL INVOICES (${allInvoices.length}):`);
  for (const inv of allInvoices) {
    console.log(
      `  #${inv.invoice_display_number ?? inv.id}  kind=${inv.invoice_kind}  status=${inv.status}  linkage=${inv.linkage}  job_id=${inv.job_id === jobId ? "(this job)" : inv.job_id}`,
    );
    console.log(
      `    issued_at=${inv.issued_at ?? "—"}  voided_at=${inv.voided_at ?? "—"}  total_cents=${inv.total_cents ?? "—"}  created_at=${inv.created_at}`,
    );
  }

  const { data: events, error: evErr } = await supabase
    .from("job_events")
    .select("created_at, event_type, message, meta")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  if (evErr) throw new Error(evErr.message);

  console.log(`\nJOB EVENTS (${(events ?? []).length}):`);
  for (const e of events ?? []) {
    console.log(`  ${e.created_at}  ${e.event_type}  ${e.message ?? ""}`);
    if (e.meta) {
      const meta = JSON.stringify(e.meta);
      console.log(`      ${meta.length > 500 ? meta.slice(0, 500) + "…" : meta}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
