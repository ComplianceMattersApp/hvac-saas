/**
 * Read-only diagnostic for a QBO payment-allocation / void drift finding.
 * For each given invoice display number: the EveryStep invoice row (status +
 * QBO linkage), every payment recorded against it, and every SIBLING invoice
 * on the same job and same customer — so a "paid against the wrong invoice /
 * voided the wrong one" tangle can be untangled from real data.
 *
 * READ ONLY. No writes, no QBO calls. Run:
 *   node --env-file=.env.prod scripts/qbo-invoice-family-debug.ts --numbers 2099,2104
 */

import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function money(cents: unknown): string {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

const INVOICE_COLS =
  "id, invoice_display_number, invoice_number, status, invoice_kind, total_cents, issued_at, voided_at, void_reason, job_id, customer_id, billing_name, qbo_invoice_id, qbo_sync_status, qbo_void_status, created_at";

async function printInvoice(supabase: any, inv: any, label: string) {
  console.log(`\n${label} #${inv.invoice_display_number ?? "?"} (${inv.invoice_number ?? inv.id})`);
  console.log(`  id=${inv.id}`);
  console.log(`  status=${inv.status}  kind=${inv.invoice_kind}  total=${money(inv.total_cents)}  billing_name=${inv.billing_name ?? "—"}`);
  console.log(`  issued_at=${inv.issued_at ?? "—"}  voided_at=${inv.voided_at ?? "—"}  void_reason=${inv.void_reason ?? "—"}`);
  console.log(`  qbo_invoice_id=${inv.qbo_invoice_id ?? "—"}  qbo_sync_status=${inv.qbo_sync_status ?? "—"}  qbo_void_status=${inv.qbo_void_status ?? "—"}`);

  const { data: payments, error: payErr } = await supabase
    .from("internal_invoice_payments")
    .select("id, payment_status, payment_method, amount_cents, paid_at, received_reference, qbo_payment_id, created_at")
    .eq("invoice_id", inv.id)
    .order("created_at", { ascending: true });
  if (payErr) throw new Error(payErr.message);

  if (!payments || payments.length === 0) {
    console.log("  payments: (none)");
    return;
  }
  for (const p of payments) {
    console.log(
      `  payment ${p.id}: ${money(p.amount_cents)}  status=${p.payment_status}  method=${p.payment_method ?? "—"}  paid_at=${p.paid_at ?? "—"}  qbo_payment_id=${p.qbo_payment_id ?? "—"}  ref=${p.received_reference ?? "—"}`,
    );
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Use --env-file=.env.prod");
    process.exit(1);
  }
  const numbersRaw = arg("numbers");
  if (!numbersRaw) {
    console.error("Pass --numbers <displayNumber,displayNumber,...>");
    process.exit(1);
  }
  const numbers = numbersRaw
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n));

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  for (const num of numbers) {
    console.log(`\n${"=".repeat(70)}\nINVOICE DISPLAY NUMBER ${num}`);

    const { data: invoices, error } = await supabase
      .from("internal_invoices")
      .select(INVOICE_COLS)
      .eq("invoice_display_number", num);
    if (error) throw new Error(error.message);
    if (!invoices || invoices.length === 0) {
      console.log("  Not found in EveryStep.");
      continue;
    }

    for (const inv of invoices) {
      await printInvoice(supabase, inv, "TARGET");

      const seen = new Set([inv.id]);
      if (inv.job_id) {
        const { data: jobSiblings, error: jsErr } = await supabase
          .from("internal_invoices")
          .select(INVOICE_COLS)
          .eq("job_id", inv.job_id)
          .neq("id", inv.id);
        if (jsErr) throw new Error(jsErr.message);
        for (const sib of jobSiblings ?? []) {
          if (seen.has(sib.id)) continue;
          seen.add(sib.id);
          await printInvoice(supabase, sib, "SAME-JOB SIBLING");
        }
      }
      if (inv.customer_id) {
        const { data: custSiblings, error: csErr } = await supabase
          .from("internal_invoices")
          .select(INVOICE_COLS)
          .eq("customer_id", inv.customer_id)
          .order("created_at", { ascending: true });
        if (csErr) throw new Error(csErr.message);
        for (const sib of custSiblings ?? []) {
          if (seen.has(sib.id)) continue;
          seen.add(sib.id);
          await printInvoice(supabase, sib, "SAME-CUSTOMER SIBLING");
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
