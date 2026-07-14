/**
 * QBO Invoice-Sync Eligibility DRY RUN — READ ONLY.
 *
 * Zero-write, zero-QBO-call eligibility evaluation for one account. It performs
 * only Supabase `select` reads via `evaluateQboInvoiceEligibility`, reads the
 * (existing) qbo_connections row for environment identification, and prints a
 * redacted report. It NEVER writes to Supabase, NEVER calls QBO, NEVER performs
 * OAuth or token refresh, and NEVER prints secrets or token/credential values.
 *
 * Run (Node 24+, native TS type-stripping):
 *   node --env-file=.env.local scripts/qbo-invoice-eligibility-dry-run.ts
 *
 * Optional flags:
 *   --account <uuid>         account_owner_user_id to evaluate (auto-resolved if a single account exists)
 *   --from <YYYY-MM-DD>      inclusive invoice_date lower bound
 *   --to <YYYY-MM-DD>        inclusive invoice_date upper bound
 *   --numbers <a,b,c>        comma-separated invoice_number / display-number scope
 *   --issued-from <date>     sync-start cutoff: exclude invoices issued before this
 *                            (defaults to the connection's connected_at when connected)
 */

import { createClient } from "@supabase/supabase-js";

import {
  evaluateQboInvoiceEligibility,
  type QboInvoiceEligibilityReport,
} from "../lib/qbo/qbo-eligibility.ts";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

/** Mask an identifier so it is never printed in the clear (keeps last 2 chars for correlation). */
function redactId(value: string | null | undefined): string {
  const s = String(value ?? "").trim();
  if (!s) return "(none)";
  if (s.length <= 2) return "•".repeat(s.length);
  return `${"•".repeat(Math.min(8, s.length - 2))}${s.slice(-2)}`;
}

function formatReport(
  report: QboInvoiceEligibilityReport,
  meta: {
    environment: string;
    account: string;
    connectionStatus: string;
    companyRedacted: string;
    scope: string;
    lastSyncError: string | null;
    syncStart: string;
  },
): string {
  const x = report.excludedByReason;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (meta.connectionStatus === "(no connection row)") {
    warnings.push("No qbo_connections row for this account — a real sync could not run until connected.");
  }
  if (meta.lastSyncError) warnings.push(`qbo_connections.last_sync_error present: ${meta.lastSyncError}`);

  const verdict =
    report.eligible === 0
      ? "PASS — 0 eligible invoices. A real sync would attempt 0 QBO writes."
      : `REVIEW — ${report.eligible} invoice(s) would be eligible to sync. Inspect before any real run.`;

  return [
    `Environment:                 ${meta.environment}`,
    `Account:                     ${redactId(meta.account)}`,
    `Execution mode:              DRY RUN / READ ONLY`,
    `QBO connection status:       ${meta.connectionStatus}`,
    `QBO company ID:              ${meta.companyRedacted} (redacted)`,
    `Scope:                       ${meta.scope}`,
    `Sync start (cutoff):         ${meta.syncStart}`,
    ``,
    `Internal invoices evaluated: ${report.evaluated}`,
    `Eligible invoice candidates: ${report.eligible}`,
    ``,
    `Excluded:`,
    `  - External billing:        ${x.external_billing_or_no_charge}`,
    `  - No internal invoice:     0 (n/a — invoice-scoped evaluation)`,
    `  - Zero-dollar/no-charge:   ${x.zero_or_invalid_total}`,
    `  - Draft:                   ${x.draft}`,
    `  - Voided:                  ${x.voided}`,
    `  - Replaced/superseded:     (modeled as void — counted under Voided)`,
    `  - Already synced:          ${x.already_synced}`,
    `  - Previously skipped:      ${x.previously_skipped}`,
    `  - Before sync start:       ${x.before_sync_start}`,
    `  - Missing customer mapping:${x.unresolvable_customer}`,
    `  - Missing line/account map:${x.no_line_items}`,
    `  - Other unsupported state: ${x.unsupported_state}`,
    ``,
    `Payments evaluated:          0 (n/a — no QBO payment export exists)`,
    `Eligible payment candidates: 0`,
    ``,
    `QBO reads performed:         0`,
    `QBO writes attempted:        0`,
    `Compliance Matters writes attempted: 0`,
    `Warnings:                    ${warnings.length ? warnings.join(" | ") : "none"}`,
    `Blockers:                    ${blockers.length ? blockers.join(" | ") : "none"}`,
    `Final verdict:               ${verdict}`,
  ].join("\n");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local scripts/qbo-invoice-eligibility-dry-run.ts",
    );
    process.exit(1);
  }

  // Read-only service client. No session, no writes issued anywhere below.
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Discovery mode: list every account that has invoices, with counts, so the
  // operator can identify their true prod account_owner_user_id to pass to --account.
  // Full IDs are shown here (operator's own terminal) purely as a selection aid.
  if (process.argv.includes("--list-accounts")) {
    const { data, error } = await supabase
      .from("internal_invoices")
      .select("account_owner_user_id, status, invoice_date, invoice_display_number, invoice_number, billing_name, total_cents");
    if (error) throw new Error(`account listing read failed: ${error.message}`);
    const counts = new Map<string, { total: number; issued: number; latest: string }>();
    const samplesByAccount = new Map<string, any[]>();
    for (const row of data ?? []) {
      const id = String(row.account_owner_user_id);
      const c = counts.get(id) ?? { total: 0, issued: 0, latest: "" };
      c.total += 1;
      if (row.status === "issued") c.issued += 1;
      const d = String(row.invoice_date ?? "");
      if (d > c.latest) c.latest = d;
      counts.set(id, c);
      const list = samplesByAccount.get(id) ?? [];
      list.push(row);
      samplesByAccount.set(id, list);
    }
    const ids = Array.from(counts.keys());

    // Human identifiers per account: business profile, QBO connection, auth email.
    const profileById = new Map<string, any>();
    const connById = new Map<string, any>();
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("internal_business_profiles")
        .select("account_owner_user_id, display_name, support_email")
        .in("account_owner_user_id", ids);
      for (const p of profiles ?? []) profileById.set(String(p.account_owner_user_id), p);
      const { data: conns } = await supabase
        .from("qbo_connections")
        .select("account_owner_user_id, environment, status, realm_id")
        .in("account_owner_user_id", ids);
      for (const c of conns ?? []) connById.set(String(c.account_owner_user_id), c);
    }

    console.log(`\nAccounts with internal invoices (env: ${process.env.NODE_ENV ?? "unset"}):\n`);
    if (ids.length === 0) console.log("  (none)");
    for (const id of ids) {
      const c = counts.get(id)!;
      const p = profileById.get(id);
      const conn = connById.get(id);
      const email = await supabase.auth.admin
        .getUserById(id)
        .then((r) => r.data?.user?.email ?? "(no auth email)")
        .catch(() => "(auth lookup failed)");
      console.log(`  account_owner_user_id: ${id}`);
      console.log(`    business:   ${p?.display_name ?? "(no profile)"}`);
      console.log(`    email:      ${email}${p?.support_email ? ` / support: ${p.support_email}` : ""}`);
      console.log(`    invoices:   ${c.total} total, ${c.issued} issued, latest ${c.latest || "n/a"}`);
      console.log(
        `    QBO conn:   ${conn ? `YES — env=${conn.environment}, status=${conn.status}, realm=${redactId(conn.realm_id)}` : "none"}`,
      );
      const samples = (samplesByAccount.get(id) ?? [])
        .slice()
        .sort((a, b) => String(b.invoice_date ?? "").localeCompare(String(a.invoice_date ?? "")))
        .slice(0, 5);
      console.log(`    recent invoices (match these to what you see in the web app):`);
      for (const s of samples) {
        const ref = s.invoice_display_number ?? s.invoice_number ?? "?";
        const amt = `$${(Number(s.total_cents ?? 0) / 100).toFixed(2)}`;
        console.log(`      #${ref}  ${s.invoice_date ?? "n/a"}  ${amt}  ${s.status}  ${s.billing_name ?? "(no billing name)"}`);
      }
      console.log("");
    }
    console.log(
      `The account with the QBO connection (env=production, status=active) is your connected prod account.\n` +
        `Re-run for it:\n  node --env-file=.env.local scripts/qbo-invoice-eligibility-dry-run.ts --account <uuid>\n`,
    );
    return;
  }

  // Resolve the account (explicit flag, else the sole account present in internal_invoices).
  let account = arg("account");
  if (!account) {
    const { data, error } = await supabase.from("internal_invoices").select("account_owner_user_id");
    if (error) throw new Error(`account resolution read failed: ${error.message}`);
    const distinct = Array.from(new Set((data ?? []).map((r: any) => String(r.account_owner_user_id))));
    if (distinct.length === 1) account = distinct[0];
    else if (distinct.length === 0) {
      console.log("No internal_invoices rows exist in this database — nothing to evaluate. Eligible invoices: 0.");
      return;
    } else {
      console.error(
        `Multiple accounts present (${distinct.length}). Re-run with --account <uuid>. Candidates: ${distinct
          .map(redactId)
          .join(", ")}`,
      );
      process.exit(1);
    }
  }

  // Read-only connection metadata for environment identification + sync-start cutoff.
  const { data: conn } = await supabase
    .from("qbo_connections")
    .select("environment, status, realm_id, last_sync_error, connected_at")
    .eq("account_owner_user_id", account)
    .maybeSingle();

  // Sync-start cutoff: invoices issued before this instant are excluded as
  // before_sync_start (already handled outside QBO). Precedence: explicit
  // --issued-from, else the connection's connected_at. This mirrors the real
  // sync engine, which uses connected_at, so the dry run predicts go-live.
  const issuedFromArg = arg("issued-from");
  const syncStartCutoff = issuedFromArg || (conn?.connected_at ? String(conn.connected_at) : null);
  const syncStartLabel = issuedFromArg
    ? `${issuedFromArg} (from --issued-from)`
    : conn?.connected_at
      ? `${String(conn.connected_at)} (from connection connected_at)`
      : "none — pass --issued-from <YYYY-MM-DD> to preview a connect-now baseline";

  const numbers = arg("numbers");
  const scope = {
    invoiceDateFrom: arg("from"),
    invoiceDateTo: arg("to"),
    invoiceNumbers: numbers ? numbers.split(",").map((s) => s.trim()).filter(Boolean) : null,
    issuedOnOrAfter: syncStartCutoff,
  };
  const scopeLabel =
    [
      scope.invoiceDateFrom ? `from ${scope.invoiceDateFrom}` : null,
      scope.invoiceDateTo ? `to ${scope.invoiceDateTo}` : null,
      scope.invoiceNumbers?.length ? `numbers=[${scope.invoiceNumbers.join(",")}]` : null,
    ]
      .filter(Boolean)
      .join(" ") || "all invoices for account";

  const report = await evaluateQboInvoiceEligibility({ supabase, accountOwnerUserId: account!, scope });

  const out = formatReport(report, {
    environment: `${conn?.environment ?? "unknown"} (NODE_ENV=${process.env.NODE_ENV ?? "unset"})`,
    account: account!,
    connectionStatus: conn ? String(conn.status ?? "unknown") : "(no connection row)",
    companyRedacted: redactId(conn?.realm_id),
    scope: scopeLabel,
    lastSyncError: conn?.last_sync_error ? String(conn.last_sync_error) : null,
    syncStart: syncStartLabel,
  });

  console.log("\n" + out + "\n");

  // --details: per-invoice listing so the operator can inspect the eligible set
  // (and see which refs were excluded and why). Still read-only.
  if (process.argv.includes("--details")) {
    const eligible = report.results.filter((r) => r.eligible);
    const eligibleIds = eligible.map((r) => r.invoiceId);

    const rowById = new Map<string, any>();
    const custById = new Map<string, any>();
    if (eligibleIds.length > 0) {
      const { data: rows } = await supabase
        .from("internal_invoices")
        .select("id, invoice_display_number, invoice_number, invoice_date, total_cents, customer_id, billing_name")
        .in("id", eligibleIds);
      for (const r of rows ?? []) rowById.set(String(r.id), r);
      const custIds = Array.from(
        new Set((rows ?? []).map((r: any) => r.customer_id).filter(Boolean).map(String)),
      );
      if (custIds.length > 0) {
        const { data: custs } = await supabase
          .from("customers")
          .select("id, full_name, billing_name, first_name, last_name")
          .in("id", custIds);
        for (const c of custs ?? []) custById.set(String(c.id), c);
      }
    }

    const custName = (row: any): string => {
      const c = row?.customer_id ? custById.get(String(row.customer_id)) : null;
      const name =
        (c?.billing_name && String(c.billing_name).trim()) ||
        (c?.full_name && String(c.full_name).trim()) ||
        [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() ||
        (row?.billing_name && String(row.billing_name).trim());
      return name || "(no customer name)";
    };

    console.log("Eligible invoices — review before connecting/syncing:");
    if (eligible.length === 0) console.log("  (none)");
    for (const r of eligible) {
      const row = rowById.get(r.invoiceId);
      const ref = r.invoiceRef ?? r.invoiceId;
      const date = row?.invoice_date ?? "n/a";
      const amt = row ? `$${(Number(row.total_cents ?? 0) / 100).toFixed(2)}` : "n/a";
      console.log(`  #${ref}   ${date}   ${amt}   ${custName(row)}`);
    }

    // Compact excluded listing, grouped by primary reason (refs only — no extra reads).
    const excluded = report.results.filter((r) => !r.eligible);
    if (excluded.length > 0) {
      const byReason = new Map<string, string[]>();
      for (const r of excluded) {
        const key = r.primaryReason ?? "unknown";
        const list = byReason.get(key) ?? [];
        list.push(r.invoiceRef ?? r.invoiceId);
        byReason.set(key, list);
      }
      console.log("\nExcluded (primary reason → refs):");
      for (const [reason, refs] of byReason) {
        const shown = refs.slice(0, 12).map((x) => `#${x}`).join(", ");
        const more = refs.length > 12 ? ` … +${refs.length - 12} more` : "";
        console.log(`  ${reason} (${refs.length}): ${shown}${more}`);
      }
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("Dry run failed (no writes were performed):", err instanceof Error ? err.message : err);
  process.exit(1);
});
