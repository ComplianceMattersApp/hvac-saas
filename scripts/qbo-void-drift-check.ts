/**
 * QBO Void-Drift Check — READ ONLY.
 *
 * Answers one question: does QuickBooks still show invoices that EveryStep
 * considers void? That drift overstates A/R and revenue in QBO, and before the
 * void-propagation lane existed there was nothing to detect it.
 *
 * It performs only Supabase `select` reads. It NEVER writes to Supabase, NEVER
 * calls QBO, NEVER performs OAuth or token refresh, and NEVER prints secrets.
 * Because it makes no QBO calls, it reports what EveryStep BELIEVES about
 * QuickBooks (the qbo_void_* bookkeeping), not a live QBO read — a row marked
 * `voided` was confirmed by QBO at the time it was written.
 *
 * Run (Node 24+, native TS type-stripping):
 *   node --env-file=.env.prod  scripts/qbo-void-drift-check.ts   # production
 *   node --env-file=.env.local scripts/qbo-void-drift-check.ts   # sandbox
 *
 * The Supabase project ref is printed first — always confirm it before acting on
 * the output, since .env files in this repo point at different projects.
 *
 * Optional flags:
 *   --account <uuid>   restrict to one account_owner_user_id (default: all)
 *   --all              list every voided invoice, not just the ones needing action
 */

import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const showAll = process.argv.includes("--all");

/** Mask an account id — it identifies a tenant and is never needed in full here. */
function redactId(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "(none)";
  return s.length <= 6 ? "•".repeat(s.length) : `…${s.slice(-6)}`;
}

function money(cents: unknown): string {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

function label(row: any): string {
  return String(row.invoice_display_number ?? row.invoice_number ?? row.id);
}

/**
 * What the next "Sync pending invoices" run will do with this row. Mirrors the
 * candidate query in voidAllPendingInvoiceVoidsInQbo — keep the two in step.
 */
type Disposition = "not_pushed" | "confirmed" | "will_retry" | "blocked";

function disposition(row: any, migrationApplied: boolean): Disposition {
  if (!row.qbo_invoice_id) return "not_pushed";
  if (!migrationApplied) return "will_retry";
  const status = String(row.qbo_void_status ?? "").trim();
  if (status === "voided") return "confirmed";
  if (status === "blocked") return "blocked";
  return "will_retry"; // null | pending | error
}

const DISPOSITION_NOTE: Record<Disposition, string> = {
  not_pushed: "never reached QBO — nothing there to void",
  confirmed: "voided in QuickBooks",
  will_retry: "DRIFT — next sync run will void it in QuickBooks",
  blocked: "BLOCKED — QBO shows a payment applied; needs a human",
};

async function main() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.prod scripts/qbo-void-drift-check.ts",
    );
    process.exit(1);
  }

  // Read-only service client. No session, no writes issued anywhere below.
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const projectRef = url.replace(/^https?:\/\//, "").split(".")[0];
  console.log(`\nSupabase project: ${projectRef}`);

  // Has the void-propagation migration landed here? Without it the app still
  // voids normally, it just cannot record or retry propagation.
  const probe = await supabase.from("internal_invoices").select("id, qbo_void_status").limit(1);
  const migrationApplied = !(probe.error && String(probe.error.code) === "42703");
  console.log(`qbo_void_* columns:  ${migrationApplied ? "present" : "NOT DEPLOYED — propagation cannot be recorded here"}`);

  const voidColumns = [
    "id", "job_id", "account_owner_user_id", "invoice_display_number", "invoice_number",
    "total_cents", "voided_at", "void_reason", "qbo_invoice_id", "qbo_sync_status",
    ...(migrationApplied ? ["qbo_void_status", "qbo_voided_at", "qbo_void_error"] : []),
  ].join(", ");

  let query = supabase.from("internal_invoices").select(voidColumns).eq("status", "void");
  const accountFilter = arg("account");
  if (accountFilter) query = query.eq("account_owner_user_id", accountFilter);
  const { data, error } = await query.order("voided_at", { ascending: false });
  if (error) {
    console.error(`\nVoided-invoice read failed: ${error.message}`);
    process.exit(1);
  }
  const rows: any[] = data ?? [];

  // QBO connection per account — drift only matters where a connection exists.
  const accountIds = [...new Set(rows.map((r) => String(r.account_owner_user_id)))];
  const connByAccount = new Map<string, any>();
  if (accountIds.length > 0) {
    const { data: conns } = await supabase
      .from("qbo_connections")
      .select("account_owner_user_id, status, environment, connected_at")
      .in("account_owner_user_id", accountIds);
    for (const c of conns ?? []) connByAccount.set(String(c.account_owner_user_id), c);
  }

  const buckets: Record<Disposition, any[]> = { not_pushed: [], confirmed: [], will_retry: [], blocked: [] };
  for (const row of rows) buckets[disposition(row, migrationApplied)].push(row);

  console.log(`\nVoided invoices${accountFilter ? ` for account ${redactId(accountFilter)}` : ""}: ${rows.length}`);
  console.log(`  never pushed to QBO:      ${buckets.not_pushed.length}`);
  console.log(`  voided in QuickBooks:     ${buckets.confirmed.length}`);
  console.log(`  DRIFT (sync will fix):    ${buckets.will_retry.length}`);
  console.log(`  BLOCKED (needs a human):  ${buckets.blocked.length}`);

  for (const account of accountIds) {
    const conn = connByAccount.get(account);
    console.log(
      `\n  account ${redactId(account)} · QBO ${conn ? `${conn.status} (${conn.environment}), connected ${String(conn.connected_at ?? "").slice(0, 10)}` : "not connected"}`,
    );
  }

  const detailOrder: Disposition[] = showAll
    ? ["will_retry", "blocked", "confirmed", "not_pushed"]
    : ["will_retry", "blocked"];
  for (const bucket of detailOrder) {
    const list = buckets[bucket].filter((r) => !accountFilter || String(r.account_owner_user_id) === accountFilter);
    if (list.length === 0) continue;
    console.log(`\n=== ${bucket} — ${DISPOSITION_NOTE[bucket]} (${list.length}) ===`);
    for (const row of list) {
      console.log(`\n  Invoice ${label(row)} · ${money(row.total_cents)} · account ${redactId(row.account_owner_user_id)}`);
      console.log(`    voided_at       ${row.voided_at ?? "(none)"}`);
      console.log(`    void_reason     ${row.void_reason ?? "(none)"}`);
      console.log(`    qbo_invoice_id  ${row.qbo_invoice_id ?? "(never pushed)"}`);
      if (migrationApplied) {
        console.log(`    qbo_void_status ${row.qbo_void_status ?? "(null — never attempted)"}`);
        if (row.qbo_voided_at) console.log(`    qbo_voided_at   ${row.qbo_voided_at}`);
        if (row.qbo_void_error) console.log(`    qbo_void_error  ${row.qbo_void_error}`);
      }
    }
  }

  const atRiskCents = [...buckets.will_retry, ...buckets.blocked]
    .reduce((sum, row) => sum + Number(row.total_cents ?? 0), 0);
  const connectedAccounts = accountIds.filter((id) => connByAccount.get(id)?.status === "active");

  console.log("\n=== Verdict ===");
  if (!migrationApplied) {
    console.log("  Migration 20260809140000 is not deployed to this project — apply it, then re-run.");
  } else if (buckets.will_retry.length === 0 && buckets.blocked.length === 0) {
    console.log("  No drift. Every voided invoice that reached QuickBooks is voided there.");
  } else {
    console.log(`  ${money(atRiskCents)} of voided invoices may still be open in QuickBooks.`);
    if (buckets.will_retry.length > 0) {
      console.log(`  ${buckets.will_retry.length} will clear on the next "Sync pending invoices" run (Company Profile → Integrations).`);
    }
    if (buckets.blocked.length > 0) {
      console.log(`  ${buckets.blocked.length} are BLOCKED: QBO shows a payment applied. Voiding would leave that payment`);
      console.log(`  unapplied, so reconcile it in QuickBooks first, then use the per-invoice retry on the invoice page.`);
    }
    if (connectedAccounts.length === 0) {
      console.log("  NOTE: no account here has an active QBO connection, so nothing can be pushed until one is connected.");
    }
  }
  console.log("");
}

await main();
