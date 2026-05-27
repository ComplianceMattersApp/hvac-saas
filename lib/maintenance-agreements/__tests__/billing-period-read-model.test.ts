import { describe, expect, it } from "vitest";
import {
  deriveMaintenanceAgreementBillingPeriodPaymentDisplayState,
  formatMaintenanceAgreementBillingPeriodAmountLabel,
  formatMaintenanceAgreementBillingPeriodCoverageLabel,
  formatMaintenanceAgreementBillingPeriodLifecycleLabel,
  formatMaintenanceAgreementBillingPeriodPostureLabel,
  listMaintenanceAgreementBillingPeriodsForAccount,
  listMaintenanceAgreementBillingPeriodsForAgreement,
  listMaintenanceAgreementBillingPeriodsForCustomer,
} from "@/lib/maintenance-agreements/billing-period-read-model";

const ACCOUNT_OWNER = "owner-1";

type MockRow = Record<string, any>;

function makeSupabaseMock(rowsByTable: Record<string, MockRow[]>) {
  const calls: Array<{ table: string; op: string; column?: string; value?: unknown }> = [];

  const supabase = {
    from(table: string) {
      calls.push({ table, op: "from" });
      if (table === "internal_invoice_payment_allocations") {
        throw new Error("billing-period read model must not query payment allocations");
      }

      const rows = rowsByTable[table] ?? [];
      const eqFilters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];

      const exec = () => {
        let data = [...rows];

        for (const [column, value] of eqFilters) {
          data = data.filter((row) => row[column] === value);
        }

        for (const [column, values] of inFilters) {
          data = data.filter((row) => values.includes(row[column]));
        }

        return { data, error: null };
      };

      const build = (): any => ({
        select: (value: string) => {
          calls.push({ table, op: "select", value });
          return build();
        },
        eq: (column: string, value: unknown) => {
          calls.push({ table, op: "eq", column, value });
          eqFilters.push([column, value]);
          return build();
        },
        in: (column: string, value: unknown[]) => {
          calls.push({ table, op: "in", column, value });
          inFilters.push([column, value]);
          return build();
        },
        order: (column: string, value: unknown) => {
          calls.push({ table, op: "order", column, value });
          return build();
        },
        maybeSingle: async () => {
          const result = exec();
          return { data: result.data[0] ?? null, error: result.error };
        },
        then: (resolve: any, reject?: any) => Promise.resolve(exec()).then(resolve, reject),
      });

      return build();
    },
  };

  return { supabase, calls };
}

function makeBillingPeriodRow(input: Partial<MockRow> & { id: string }): MockRow {
  return {
    account_owner_user_id: ACCOUNT_OWNER,
    maintenance_agreement_id: "agreement-1",
    customer_id: "customer-1",
    coverage_start_date: "2026-06-01",
    coverage_end_date: "2026-08-31",
    billing_due_date: "2026-06-15",
    billing_cadence: "quarterly",
    amount_due_cents: 20000,
    currency: "usd",
    billing_posture: "internal_invoice",
    billing_period_status: "invoice_linked",
    internal_invoice_id: null,
    external_reference: null,
    external_notes: null,
    status_reason: null,
    created_at: "2026-05-26T00:00:00Z",
    created_by_user_id: "user-1",
    updated_at: "2026-05-26T00:00:00Z",
    updated_by_user_id: "user-1",
    ...input,
  };
}

describe("billing-period read model helper", () => {
  it("lists periods by account, agreement, and customer", async () => {
    const { supabase } = makeSupabaseMock({
      maintenance_agreement_billing_periods: [
        makeBillingPeriodRow({ id: "period-1", maintenance_agreement_id: "agreement-1", customer_id: "customer-1", internal_invoice_id: null, billing_posture: "manual", billing_period_status: "draft" }),
        makeBillingPeriodRow({ id: "period-2", maintenance_agreement_id: "agreement-2", customer_id: "customer-2", internal_invoice_id: "inv-1", billing_posture: "internal_invoice", billing_period_status: "invoice_linked" }),
      ],
      internal_invoices: [
        { id: "inv-1", invoice_number: "INV-1", status: "issued", total_cents: 20000, account_owner_user_id: ACCOUNT_OWNER },
      ],
      internal_invoice_payments: [
        { account_owner_user_id: ACCOUNT_OWNER, invoice_id: "inv-1", amount_cents: 10000, payment_status: "recorded", paid_at: "2026-05-26T10:00:00Z" },
      ],
    });

    const accountRows = await listMaintenanceAgreementBillingPeriodsForAccount({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
    });
    const agreementRows = await listMaintenanceAgreementBillingPeriodsForAgreement({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      agreementId: "agreement-1",
    });
    const customerRows = await listMaintenanceAgreementBillingPeriodsForCustomer({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      customerId: "customer-1",
    });

    expect(accountRows).toHaveLength(2);
    expect(agreementRows).toHaveLength(1);
    expect(customerRows).toHaveLength(1);
    expect(agreementRows[0]).toMatchObject({
      id: "period-1",
      maintenance_agreement_id: "agreement-1",
      customer_id: "customer-1",
      payment_display_state: "not_invoice_backed",
    });
    expect(accountRows.find((row) => row.id === "period-2")).toMatchObject({
      payment_display_state: "partially_paid",
      amount_paid_cents: 10000,
      balance_due_cents: 10000,
      invoice_summary: {
        invoice_id: "inv-1",
        invoice_status: "issued",
        invoice_total_cents: 20000,
        amount_paid_cents: 10000,
        balance_due_cents: 10000,
        payment_status: "partial",
        payment_attention: false,
      },
    });
  });

  it("returns empty arrays for missing scope inputs", async () => {
    const { supabase } = makeSupabaseMock({
      maintenance_agreement_billing_periods: [makeBillingPeriodRow({ id: "period-1" })],
    });

    await expect(
      listMaintenanceAgreementBillingPeriodsForAccount({ supabase, accountOwnerUserId: "" }),
    ).resolves.toEqual([]);
    await expect(
      listMaintenanceAgreementBillingPeriodsForAgreement({
        supabase,
        accountOwnerUserId: ACCOUNT_OWNER,
        agreementId: null,
      }),
    ).resolves.toEqual([]);
    await expect(
      listMaintenanceAgreementBillingPeriodsForCustomer({
        supabase,
        accountOwnerUserId: ACCOUNT_OWNER,
        customerId: undefined,
      }),
    ).resolves.toEqual([]);
  });

  it("formats coverage, posture, lifecycle, and amount labels", () => {
    expect(
      formatMaintenanceAgreementBillingPeriodCoverageLabel("2026-06-01", "2026-08-31"),
    ).toBe("Coverage 06-01-2026 - 08-31-2026");
    expect(formatMaintenanceAgreementBillingPeriodPostureLabel("internal_invoice")).toBe(
      "Internal invoice",
    );
    expect(formatMaintenanceAgreementBillingPeriodLifecycleLabel("pending_billing")).toBe(
      "Pending billing",
    );
    expect(formatMaintenanceAgreementBillingPeriodAmountLabel(12345, "usd")).toBe("$123.45");
  });

  it("derives not_invoice_backed for non-linked periods", () => {
    expect(
      deriveMaintenanceAgreementBillingPeriodPaymentDisplayState({
        internalInvoiceId: null,
        invoiceSummary: null,
      }),
    ).toBe("not_invoice_backed");
  });

  it("derives invoice_draft and invoice_void", () => {
    expect(
      deriveMaintenanceAgreementBillingPeriodPaymentDisplayState({
        internalInvoiceId: "inv-1",
        invoiceSummary: {
          invoice_id: "inv-1",
          invoice_number: "INV-1",
          invoice_status: "draft",
          invoice_total_cents: 20000,
          amount_paid_cents: 0,
          balance_due_cents: 20000,
          payment_status: "unpaid",
          payment_attention: false,
        },
      }),
    ).toBe("invoice_draft");

    expect(
      deriveMaintenanceAgreementBillingPeriodPaymentDisplayState({
        internalInvoiceId: "inv-1",
        invoiceSummary: {
          invoice_id: "inv-1",
          invoice_number: "INV-1",
          invoice_status: "void",
          invoice_total_cents: 20000,
          amount_paid_cents: 0,
          balance_due_cents: 20000,
          payment_status: "unpaid",
          payment_attention: false,
        },
      }),
    ).toBe("invoice_void");
  });

  it("derives unpaid, partially_paid, and paid", () => {
    expect(
      deriveMaintenanceAgreementBillingPeriodPaymentDisplayState({
        internalInvoiceId: "inv-1",
        invoiceSummary: {
          invoice_id: "inv-1",
          invoice_number: "INV-1",
          invoice_status: "issued",
          invoice_total_cents: 20000,
          amount_paid_cents: 0,
          balance_due_cents: 20000,
          payment_status: "unpaid",
          payment_attention: false,
        },
      }),
    ).toBe("unpaid");

    expect(
      deriveMaintenanceAgreementBillingPeriodPaymentDisplayState({
        internalInvoiceId: "inv-1",
        invoiceSummary: {
          invoice_id: "inv-1",
          invoice_number: "INV-1",
          invoice_status: "issued",
          invoice_total_cents: 20000,
          amount_paid_cents: 6000,
          balance_due_cents: 14000,
          payment_status: "partial",
          payment_attention: false,
        },
      }),
    ).toBe("partially_paid");

    expect(
      deriveMaintenanceAgreementBillingPeriodPaymentDisplayState({
        internalInvoiceId: "inv-1",
        invoiceSummary: {
          invoice_id: "inv-1",
          invoice_number: "INV-1",
          invoice_status: "issued",
          invoice_total_cents: 20000,
          amount_paid_cents: 20000,
          balance_due_cents: 0,
          payment_status: "paid",
          payment_attention: false,
        },
      }),
    ).toBe("paid");
  });

  it("counts only recorded payments and surfaces payment attention without changing paid math", async () => {
    const { supabase } = makeSupabaseMock({
      maintenance_agreement_billing_periods: [
        makeBillingPeriodRow({
          id: "period-1",
          internal_invoice_id: "inv-1",
          billing_posture: "internal_invoice",
          billing_period_status: "invoice_linked",
        }),
      ],
      internal_invoices: [
        { id: "inv-1", invoice_number: "INV-1", status: "issued", total_cents: 12000, account_owner_user_id: ACCOUNT_OWNER },
      ],
      internal_invoice_payments: [
        { account_owner_user_id: ACCOUNT_OWNER, invoice_id: "inv-1", amount_cents: 3000, payment_status: "recorded", paid_at: "2026-05-26T10:00:00Z" },
        { account_owner_user_id: ACCOUNT_OWNER, invoice_id: "inv-1", amount_cents: 2000, payment_status: "pending", paid_at: "2026-05-26T11:00:00Z" },
        { account_owner_user_id: ACCOUNT_OWNER, invoice_id: "inv-1", amount_cents: 4000, payment_status: "failed", paid_at: "2026-05-26T12:00:00Z" },
        { account_owner_user_id: ACCOUNT_OWNER, invoice_id: "inv-1", amount_cents: 5000, payment_status: "reversed", paid_at: "2026-05-26T13:00:00Z" },
      ],
    });

    const rows = await listMaintenanceAgreementBillingPeriodsForAccount({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      payment_display_state: "payment_attention",
      amount_paid_cents: 3000,
      balance_due_cents: 9000,
      invoice_summary: {
        invoice_id: "inv-1",
        invoice_status: "issued",
        invoice_total_cents: 12000,
        amount_paid_cents: 3000,
        balance_due_cents: 9000,
        payment_status: "partial",
        payment_attention: true,
      },
    });
  });

  it("does not depend on payment allocations", async () => {
    const { supabase } = makeSupabaseMock({
      maintenance_agreement_billing_periods: [makeBillingPeriodRow({ id: "period-1" })],
    });

    await expect(
      listMaintenanceAgreementBillingPeriodsForAccount({
        supabase,
        accountOwnerUserId: ACCOUNT_OWNER,
      }),
    ).resolves.toHaveLength(1);
  });

  it("does not expose forbidden IDs, fields, or blocking flags", async () => {
    const { supabase } = makeSupabaseMock({
      maintenance_agreement_billing_periods: [
        makeBillingPeriodRow({
          id: "period-1",
          internal_invoice_id: "inv-1",
          billing_posture: "internal_invoice",
          billing_period_status: "invoice_linked",
        }),
      ],
      internal_invoices: [
        { id: "inv-1", invoice_number: "INV-1", status: "draft", total_cents: 10000, account_owner_user_id: ACCOUNT_OWNER },
      ],
      internal_invoice_payments: [],
    });

    const rows = await listMaintenanceAgreementBillingPeriodsForAccount({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
    });

    const row = rows[0];
    expect(row).toBeTruthy();
    expect(row).not.toHaveProperty("payment_id");
    expect(row).not.toHaveProperty("allocation_id");
    expect(row).not.toHaveProperty("source_internal_invoice_payment_id");
    expect(row).not.toHaveProperty("target_invoice_id");
    expect(row).not.toHaveProperty("maintenance_agreement_visit_id");
    expect(row).not.toHaveProperty("counts_toward_visit_balance");
    expect(row).not.toHaveProperty("next_due_date");
    expect(row).not.toHaveProperty("ops_status");
    expect(row).not.toHaveProperty("stripe_payment_intent_id");
    expect(row).not.toHaveProperty("qbo_id");
  });
});
