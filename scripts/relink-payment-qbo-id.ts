/**
 * Repoint an EveryStep payment row at a different QuickBooks payment txn id.
 *
 * For when the QBO-side payment was deleted and manually re-entered (e.g. a
 * void/restore shuffle left the app holding the old txn id), so reconciliation
 * keeps flagging a ghost. The QBO books are correct; only the stored link is
 * stale. This updates internal_invoice_payments.qbo_payment_id — nothing else.
 *
 * DRY RUN by default — prints the row and intended change. Pass --apply to write.
 * Run:
 *   node --env-file=.env.prod scripts/relink-payment-qbo-id.ts --payment <paymentRowId> --qbo-payment-id <newTxnId> [--apply]
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
  const paymentRowId = String(arg("payment") ?? "").trim();
  const newQboPaymentId = String(arg("qbo-payment-id") ?? "").trim();
  if (!paymentRowId || !newQboPaymentId) {
    console.error("Pass --payment <paymentRowId> --qbo-payment-id <newTxnId>");
    process.exit(1);
  }
  if (!/^\d+$/.test(newQboPaymentId)) {
    console.error(`--qbo-payment-id must be a numeric QBO txn id, got "${newQboPaymentId}"`);
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: payment, error } = await supabase
    .from("internal_invoice_payments")
    .select("id, invoice_id, payment_status, payment_method, amount_cents, paid_at, received_reference, qbo_payment_id")
    .eq("id", paymentRowId)
    .single();
  if (error) throw new Error(error.message);

  console.log("PAYMENT ROW:");
  for (const [k, v] of Object.entries(payment)) {
    console.log(`  ${k.padEnd(20)} ${v === null || v === undefined || v === "" ? "—" : v}`);
  }

  const currentQboId = String(payment.qbo_payment_id ?? "").trim();
  if (currentQboId === newQboPaymentId) {
    console.log(`\nNothing to do: qbo_payment_id is already ${newQboPaymentId}.`);
    return;
  }
  if (String(payment.payment_status ?? "") !== "recorded") {
    console.log(`\nRefusing: payment_status is '${payment.payment_status}', expected 'recorded'.`);
    return;
  }

  console.log(`\nRelink: qbo_payment_id ${currentQboId || "(empty)"} -> ${newQboPaymentId}`);

  if (!apply) {
    console.log("\nDRY RUN — re-run with --apply to write.");
    return;
  }

  const { error: updErr } = await supabase
    .from("internal_invoice_payments")
    .update({ qbo_payment_id: newQboPaymentId })
    .eq("id", paymentRowId);
  if (updErr) throw new Error(updErr.message);

  console.log("\nRelinked. Run \"Check for discrepancies\" to confirm the finding clears.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
