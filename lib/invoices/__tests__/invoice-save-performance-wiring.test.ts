import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const editor = read("app/jobs/[id]/_components/InternalInvoiceLineItemsTable.tsx");
const page = read("app/jobs/[id]/invoice/page.tsx");
const actions = read("lib/actions/internal-invoice-actions.ts");
const totals = read("lib/invoices/invoice-totals.ts");
const migration = read("supabase/migrations/20260819160000_internal_invoice_totals_rpc.sql");
const vercel = JSON.parse(read("vercel.json")) as { regions?: string[] };

describe("invoice save performance wiring", () => {
  it("runs application functions in the same west-coast region as the database", () => {
    expect(vercel.regions).toEqual(["sfo1"]);
  });

  it("ends the mutation pending state before refreshing the authoritative page", () => {
    expect(editor).toContain("import { startTransition,");
    expect(editor).toContain("startTransition(() => router.refresh())");
    expect(editor.match(/router\.refresh\(\)/g)).toHaveLength(1);
    expect(actions).toContain("if (!noRedirect) {\n    revalidatePath(`/jobs/${context.jobId}`);");
  });

  it("does not load issued-invoice services while editing a draft", () => {
    expect(page).toContain('const emailDeliveriesPromise = invoice?.status === "issued"');
    expect(page).toContain('const paymentLedgerPromise = invoice && invoice.status !== "draft"');
    expect(page).toContain('const tenantStripeReadinessPromise = invoice?.status === "issued"');
  });

  it("recalculates totals atomically with an invoker-rights RPC", () => {
    expect(totals).toContain('const RECALCULATE_TOTALS_RPC = "recalculate_internal_invoice_totals_v1"');
    expect(totals).toContain("params.supabase.rpc(RECALCULATE_TOTALS_RPC");
    expect(migration.toLowerCase()).toContain("security invoker");
    expect(migration).toContain("update public.internal_invoices as invoice");
    expect(migration).toContain("grant execute on function public.recalculate_internal_invoice_totals_v1");
  });
});
