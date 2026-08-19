/**
 * Read-only diagnostic for a QuickBooks payment allocation finding.
 *
 * Reads the EveryStep invoice/payment link, then reads the exact Payment and
 * Invoice from QBO. It never refreshes OAuth tokens and never writes anywhere.
 * The stored access token must still be fresh (the reconciliation cron usually
 * refreshes it shortly before this diagnostic is needed).
 *
 * Run:
 *   node --env-file=.env.prod scripts/qbo-payment-allocation-debug.ts --invoice-number 2104
 */

import { createDecipheriv } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

function requiredEnv(name: string): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function qboEntityId(value: unknown, label: string): string {
  const id = String(value ?? "").trim();
  if (!/^\d+$/.test(id)) throw new Error(`${label} is not a valid QuickBooks entity id`);
  return id;
}

function decryptToken(encrypted: string): string {
  const key = Buffer.from(requiredEnv("QBO_ENCRYPTION_KEY"), "hex");
  if (key.length !== 32) throw new Error("QBO_ENCRYPTION_KEY must be 32 bytes");
  const [ivHex, tagHex, ciphertextHex] = encrypted.split(":");
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error("Invalid encrypted token format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(ciphertextHex, "hex")).toString("utf8") + decipher.final("utf8");
}

async function qboQuery(params: {
  accessToken: string;
  realmId: string;
  environment: string;
  query: string;
}): Promise<any> {
  const baseUrl = params.environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
  const url = new URL(`${baseUrl}/v3/company/${params.realmId}/query`);
  url.searchParams.set("minorversion", "65");
  url.searchParams.set("query", params.query);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`QBO read failed (${response.status}): ${JSON.stringify(body?.Fault ?? body)}`);
  }
  return body;
}

function summarizePayment(payment: any) {
  return {
    id: String(payment?.Id ?? ""),
    syncToken: String(payment?.SyncToken ?? ""),
    txnDate: payment?.TxnDate ?? null,
    totalAmount: Number(payment?.TotalAmt ?? 0),
    unappliedAmount: Number(payment?.UnappliedAmt ?? 0),
    paymentRefNum: payment?.PaymentRefNum ?? null,
    customerRef: payment?.CustomerRef ?? null,
    privateNote: payment?.PrivateNote ?? null,
    metadata: payment?.MetaData ?? null,
    lines: (payment?.Line ?? []).map((line: any) => ({
      amount: Number(line?.Amount ?? 0),
      linkedTransactions: (line?.LinkedTxn ?? []).map((txn: any) => ({
        id: String(txn?.TxnId ?? ""),
        type: String(txn?.TxnType ?? ""),
      })),
    })),
  };
}

function summarizeInvoice(invoice: any) {
  return {
    id: String(invoice?.Id ?? ""),
    syncToken: String(invoice?.SyncToken ?? ""),
    docNumber: invoice?.DocNumber ?? null,
    txnDate: invoice?.TxnDate ?? null,
    totalAmount: Number(invoice?.TotalAmt ?? 0),
    balance: Number(invoice?.Balance ?? 0),
    customerRef: invoice?.CustomerRef ?? null,
    metadata: invoice?.MetaData ?? null,
  };
}

async function main() {
  const invoiceNumber = Number(arg("invoice-number"));
  if (!Number.isFinite(invoiceNumber)) throw new Error("Pass --invoice-number <display number>");

  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const { data: invoice, error: invoiceError } = await supabase
    .from("internal_invoices")
    .select("id, account_owner_user_id, invoice_display_number, invoice_number, total_cents, status, qbo_invoice_id, qbo_customer_id")
    .eq("invoice_display_number", invoiceNumber)
    .single();
  if (invoiceError) throw new Error(invoiceError.message);

  const { data: payments, error: paymentError } = await supabase
    .from("internal_invoice_payments")
    .select("id, payment_status, amount_cents, paid_at, received_reference, processor_name, processor_charge_id, stripe_payment_intent_id, qbo_payment_id, qbo_sync_status, qbo_last_synced_at")
    .eq("invoice_id", invoice.id)
    .not("qbo_payment_id", "is", null);
  if (paymentError) throw new Error(paymentError.message);

  const { data: connection, error: connectionError } = await supabase
    .from("qbo_connections")
    .select("realm_id, access_token_encrypted, token_expires_at, environment, status")
    .eq("account_owner_user_id", invoice.account_owner_user_id)
    .eq("status", "active")
    .single();
  if (connectionError) throw new Error(connectionError.message);
  if (new Date(connection.token_expires_at).getTime() <= Date.now()) {
    throw new Error(`Stored QBO token expired at ${connection.token_expires_at}; run reconciliation first`);
  }

  const accessToken = decryptToken(connection.access_token_encrypted);
  const qboParams = {
    accessToken,
    realmId: String(connection.realm_id),
    environment: String(connection.environment),
  };
  const qboInvoiceId = qboEntityId(invoice.qbo_invoice_id, "Invoice qbo_invoice_id");
  const paymentIds = [...new Set(
    (payments ?? []).map((row: any) => qboEntityId(row.qbo_payment_id, "Payment qbo_payment_id")),
  )];
  const [qboInvoiceResult, ...qboPaymentResults] = await Promise.all([
    qboQuery({ ...qboParams, query: `select * from Invoice where Id = '${qboInvoiceId}'` }),
    ...paymentIds.map((id) => qboQuery({ ...qboParams, query: `select * from Payment where Id = '${id}'` })),
  ]);

  console.log(JSON.stringify({
    everyStep: {
      invoice: {
        id: invoice.id,
        displayNumber: invoice.invoice_display_number,
        invoiceNumber: invoice.invoice_number,
        status: invoice.status,
        totalCents: invoice.total_cents,
        qboInvoiceId: invoice.qbo_invoice_id,
        qboCustomerId: invoice.qbo_customer_id,
      },
      payments: (payments ?? []).map((payment: any) => ({
        ...payment,
        received_reference: payment.received_reference ? "(present)" : null,
      })),
    },
    quickBooks: {
      invoice: summarizeInvoice(qboInvoiceResult?.QueryResponse?.Invoice?.[0]),
      payments: qboPaymentResults.map((result) => summarizePayment(result?.QueryResponse?.Payment?.[0])),
    },
  }, null, 2));
}

await main();
