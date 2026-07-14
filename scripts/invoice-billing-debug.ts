/**
 * Read-only diagnostic for invoice billing-recipient defaulting.
 * Prints a job's billing_recipient, its contractor's bill-to, its customer's
 * bill-to, and the latest invoice's billing snapshot — so we can see exactly
 * why an invoice defaulted to the customer vs the contractor.
 *
 * READ ONLY. No writes, no QBO. Run:
 *   node --env-file=.env.prod scripts/invoice-billing-debug.ts --job <jobId>
 */

import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function show(label: string, row: any, fields: string[]) {
  console.log(`\n${label}:`);
  if (!row) {
    console.log("  (none)");
    return;
  }
  for (const f of fields) {
    const v = row[f];
    console.log(`  ${f.padEnd(24)} ${v === null || v === undefined || v === "" ? "—" : v}`);
  }
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
      "id, billing_recipient, contractor_id, customer_id, billing_name, billing_email, billing_phone, billing_address_line1, billing_city, billing_state, billing_zip",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) throw new Error(jobErr.message);
  if (!job) {
    console.log(`No job ${jobId}`);
    return;
  }

  const [contractorRes, customerRes, invoiceRes] = await Promise.all([
    job.contractor_id
      ? supabase
          .from("contractors")
          .select(
            "id, name, billing_name, billing_email, billing_phone, billing_address_line1, billing_city, billing_state, billing_zip",
          )
          .eq("id", job.contractor_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    job.customer_id
      ? supabase
          .from("customers")
          .select(
            "id, full_name, first_name, last_name, billing_name, email, phone, billing_address_line1, billing_city, billing_state, billing_zip",
          )
          .eq("id", job.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("internal_invoices")
      .select(
        "invoice_display_number, status, billing_name, billing_email, billing_phone, billing_address_line1, billing_city, billing_state, billing_zip",
      )
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  console.log(`\n=== Billing debug for job ${jobId} ===`);
  console.log(`\njobs.billing_recipient = ${job.billing_recipient ?? "(null)"}`);
  console.log("  → this is what drives the invoice bill-to (contractor | customer | other | null)");

  show("CONTRACTOR (contractors row — the contractor bill-to source)", contractorRes.data, [
    "name", "billing_name", "billing_email", "billing_phone", "billing_address_line1", "billing_city", "billing_state", "billing_zip",
  ]);
  show("CUSTOMER (customers row)", customerRes.data, [
    "full_name", "billing_name", "email", "phone", "billing_address_line1", "billing_city", "billing_state", "billing_zip",
  ]);
  show("JOB-LEVEL override (used only when billing_recipient='other')", job, [
    "billing_name", "billing_email", "billing_phone", "billing_address_line1", "billing_city", "billing_state", "billing_zip",
  ]);
  show("LATEST INVOICE snapshot (what the invoice currently shows)", invoiceRes.data, [
    "invoice_display_number", "status", "billing_name", "billing_email", "billing_phone", "billing_address_line1", "billing_city", "billing_state", "billing_zip",
  ]);
  console.log("");
}

main().catch((e) => {
  console.error("debug failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
