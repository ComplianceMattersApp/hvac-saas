/**
 * Read-only: shows how a job's Work Items line up against its invoice charges,
 * so we can tell whether a charge was imported from a Work Item (source_kind
 * 'visit_scope', carries source_visit_scope_item_id) or typed by hand.
 *
 * READ ONLY. No writes. Run:
 *   node --env-file=.env.prod <this file> --job <jobId>
 */

import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

async function main() {
  const jobId = arg("job");
  if (!jobId) throw new Error("Missing --job <jobId>");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);

  const jobSelect =
    "id, title, status, ops_status, field_complete, billing_disposition, visit_scope_summary, visit_scope_items";

  let job: any = null;
  if (isFullUuid) {
    const { data, error } = await supabase.from("jobs").select(jobSelect).eq("id", jobId).maybeSingle();
    if (error) throw error;
    job = data;
  } else {
    // The browser URL truncates the id, so resolve a prefix against recent jobs.
    const { data, error } = await supabase
      .from("jobs")
      .select(jobSelect)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;
    const matches = (data ?? []).filter((row: any) => String(row.id).startsWith(jobId.toLowerCase()));
    if (matches.length > 1) throw new Error(`Prefix matched ${matches.length} jobs: ${matches.map((m: any) => m.id).join(", ")}`);
    job = matches[0] ?? null;
  }

  if (!job) throw new Error("Job not found");
  console.log(`resolved job id: ${job.id}\n`);

  console.log("JOB");
  console.log(`  title              ${job.title}`);
  console.log(`  status             ${job.status}`);
  console.log(`  ops_status         ${job.ops_status}`);
  console.log(`  field_complete     ${job.field_complete}`);
  console.log(`  billing_disposition ${job.billing_disposition ?? "—"}`);
  console.log(`  visit_scope_summary ${JSON.stringify(job.visit_scope_summary)}`);

  const items = (job.visit_scope_items ?? []) as any[];
  console.log(`\nWORK ITEMS (${items.length})`);
  for (const item of items) {
    console.log(`  id            ${item.id ?? "(no id)"}`);
    console.log(`  title         ${JSON.stringify(item.title)}`);
    console.log(`  details       ${JSON.stringify(item.details)}`);
    console.log(`  unit_price    ${JSON.stringify(item.expected_unit_price)}  (typeof ${typeof item.expected_unit_price})`);
    console.log(`  quantity      ${JSON.stringify(item.expected_quantity)}`);
    console.log(`  kind          ${item.kind}`);
    console.log(`  pricebook_src ${item.source_pricebook_item_id ?? "—"}`);
    console.log("");
  }

  // member_job_ids is derived in code from internal_invoice_jobs, not a column on
  // internal_invoices — consolidated membership has to be looked up separately.
  const { data: memberships, error: membershipError } = await supabase
    .from("internal_invoice_jobs")
    .select("internal_invoice_id")
    .eq("job_id", job.id);
  if (membershipError) throw membershipError;

  const invoiceIds = Array.from(
    new Set((memberships ?? []).map((row: any) => String(row.internal_invoice_id))),
  );

  const { data: ownInvoices, error: ownInvoiceError } = await supabase
    .from("internal_invoices")
    .select("id, invoice_display_number, status, total_cents, issued_at, job_id")
    .eq("job_id", job.id);
  if (ownInvoiceError) throw ownInvoiceError;

  for (const row of ownInvoices ?? []) {
    if (!invoiceIds.includes(String(row.id))) invoiceIds.push(String(row.id));
  }

  const { data: invoices, error: invoiceError } = await supabase
    .from("internal_invoices")
    .select("id, invoice_display_number, status, invoice_kind, total_cents, issued_at, job_id")
    .in("id", invoiceIds.length > 0 ? invoiceIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });
  if (invoiceError) throw invoiceError;

  console.log(`INVOICES (${invoices?.length ?? 0})`);
  for (const invoice of invoices ?? []) {
    console.log(`\n  #${invoice.invoice_display_number ?? invoice.id}  kind=${invoice.invoice_kind}  status=${invoice.status}  total_cents=${invoice.total_cents}  issued_at=${invoice.issued_at ?? "—"}`);

    const { data: lines, error: lineError } = await supabase
      .from("internal_invoice_line_items")
      .select("id, source_kind, source_visit_scope_item_id, source_pricebook_item_id, item_name_snapshot, quantity, unit_price, line_subtotal, source_job_id")
      .eq("invoice_id", invoice.id)
      .order("sort_order", { ascending: true });
    if (lineError) throw lineError;

    for (const line of lines ?? []) {
      console.log(`    - ${line.item_name_snapshot}`);
      console.log(`        source_kind   ${line.source_kind}`);
      console.log(`        visit_scope_id ${line.source_visit_scope_item_id ?? "—"}`);
      console.log(`        qty x price   ${line.quantity} x ${line.unit_price} = ${line.line_subtotal}`);
    }
  }

  const { data: payments, error: paymentError } = await supabase
    .from("internal_invoice_payments")
    .select("invoice_id, amount_cents, payment_status, payment_method, paid_at, reversed_at")
    .in("invoice_id", (invoices ?? []).map((i) => i.id));
  if (paymentError) throw paymentError;

  console.log(`\nPAYMENTS (${payments?.length ?? 0})`);
  for (const payment of payments ?? []) {
    console.log(
      `  ${payment.payment_status}  ${payment.amount_cents}  ${payment.payment_method ?? "—"}  paid_at=${payment.paid_at ?? "—"}  reversed_at=${payment.reversed_at ?? "—"}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
