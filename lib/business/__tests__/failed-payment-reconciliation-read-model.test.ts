import { describe, it, expect } from "vitest";

import { loadFailedPaymentReconciliationItems } from "@/lib/business/failed-payment-reconciliation-read-model";

type AttemptRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  attempt_kind: string | null;
  attempt_status: string | null;
  blocked_reason_code: string | null;
  failure_code: string | null;
  failure_message: string | null;
  requires_action_type: string | null;
  retry_count: number | null;
  tenant_customer_payment_method_id: string | null;
  created_at: string | null;
  submitted_at: string | null;
  resolved_at: string | null;
  resolved_internal_invoice_payment_id: string | null;
};

type InvoiceRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string;
  job_id: string | null;
  invoice_number: string;
  status: string;
  total_cents: number;
};

type CustomerRow = {
  id: string;
  owner_user_id: string;
  full_name: string;
};

type MethodRow = {
  id: string;
  account_owner_user_id: string;
  payment_method_status: string;
  display_brand: string;
  display_last4: string;
  display_exp_month: number;
  display_exp_year: number;
};

type PaymentRow = {
  id: string;
  account_owner_user_id: string;
  invoice_id: string;
  amount_cents: number;
  payment_status: string;
};

type AllocationRow = {
  id: string;
  account_owner_user_id: string;
  source_internal_invoice_payment_id: string;
  target_invoice_id: string;
  allocated_amount_cents: number;
  allocation_status: string;
};

type BuildState = {
  attempts?: AttemptRow[];
  invoices?: InvoiceRow[];
  customers?: CustomerRow[];
  methods?: MethodRow[];
  payments?: PaymentRow[];
  allocations?: AllocationRow[];
};

function makeAttempt(overrides: Partial<AttemptRow> = {}): AttemptRow {
  return {
    id: "attempt-1",
    account_owner_user_id: "owner-1",
    customer_id: "customer-1",
    invoice_id: "invoice-1",
    attempt_kind: "scheduled_autopay",
    attempt_status: "failed_declined",
    blocked_reason_code: null,
    failure_code: "card_declined",
    failure_message: "Declined",
    requires_action_type: null,
    retry_count: 0,
    tenant_customer_payment_method_id: "method-1",
    created_at: "2026-06-01T10:00:00.000Z",
    submitted_at: "2026-06-01T10:01:00.000Z",
    resolved_at: "2026-06-01T10:01:00.000Z",
    resolved_internal_invoice_payment_id: null,
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: "invoice-1",
    account_owner_user_id: "owner-1",
    customer_id: "customer-1",
    job_id: "job-1",
    invoice_number: "INV-001",
    status: "issued",
    total_cents: 10000,
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: "customer-1",
    owner_user_id: "owner-1",
    full_name: "Jordan Example",
    ...overrides,
  };
}

function makeMethod(overrides: Partial<MethodRow> = {}): MethodRow {
  return {
    id: "method-1",
    account_owner_user_id: "owner-1",
    payment_method_status: "active",
    display_brand: "visa",
    display_last4: "4242",
    display_exp_month: 12,
    display_exp_year: 2030,
    ...overrides,
  };
}

function makePayment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: "payment-1",
    account_owner_user_id: "owner-1",
    invoice_id: "invoice-1",
    amount_cents: 2000,
    payment_status: "recorded",
    ...overrides,
  };
}

function makeAllocation(overrides: Partial<AllocationRow> = {}): AllocationRow {
  return {
    id: "alloc-1",
    account_owner_user_id: "owner-1",
    source_internal_invoice_payment_id: "payment-1",
    target_invoice_id: "invoice-1",
    allocated_amount_cents: 2000,
    allocation_status: "active",
    ...overrides,
  };
}

function makeAdmin(state: BuildState = {}) {
  const touched: Array<{ table: string; op: string }> = [];

  const tables: Record<string, any[]> = {
    tenant_saved_method_payment_attempts: state.attempts ?? [],
    internal_invoices: state.invoices ?? [],
    customers: state.customers ?? [],
    tenant_customer_payment_methods: state.methods ?? [],
    internal_invoice_payments: state.payments ?? [],
    internal_invoice_payment_allocations: state.allocations ?? [],
  };

  function runSelect(
    table: string,
    filters: Array<{ kind: "eq" | "in"; column: string; value: unknown }>,
    orderBy: { column: string; ascending: boolean } | null,
    limitValue: number | null,
  ) {
    let rows = [...(tables[table] ?? [])];

    for (const filter of filters) {
      if (filter.kind === "eq") {
        rows = rows.filter((row) => row?.[filter.column] === filter.value);
      }
      if (filter.kind === "in") {
        const values = Array.isArray(filter.value) ? filter.value : [];
        rows = rows.filter((row) => values.includes(row?.[filter.column]));
      }
    }

    if (orderBy) {
      const direction = orderBy.ascending ? 1 : -1;
      rows.sort((a, b) => {
        const left = String(a?.[orderBy.column] ?? "");
        const right = String(b?.[orderBy.column] ?? "");
        return left.localeCompare(right) * direction;
      });
    }

    if (limitValue != null) {
      rows = rows.slice(0, Math.max(0, limitValue));
    }

    return { data: rows, error: null };
  }

  const admin = {
    from(table: string) {
      touched.push({ table, op: "from" });

      const filters: Array<{ kind: "eq" | "in"; column: string; value: unknown }> = [];
      let orderBy: { column: string; ascending: boolean } | null = null;
      let limitValue: number | null = null;

      const chain = {
        select(_: string) {
          touched.push({ table, op: "select" });
          return chain;
        },
        eq(column: string, value: unknown) {
          touched.push({ table, op: "eq" });
          filters.push({ kind: "eq", column, value });
          return chain;
        },
        in(column: string, value: unknown[]) {
          touched.push({ table, op: "in" });
          filters.push({ kind: "in", column, value });
          return chain;
        },
        order(column: string, options?: { ascending?: boolean }) {
          touched.push({ table, op: "order" });
          orderBy = { column, ascending: Boolean(options?.ascending) };
          return chain;
        },
        limit(value: number) {
          touched.push({ table, op: "limit" });
          limitValue = value;
          return Promise.resolve(runSelect(table, filters, orderBy, limitValue));
        },
        then(resolve: (value: { data: any[]; error: null }) => unknown, reject?: (reason?: unknown) => unknown) {
          return Promise.resolve(runSelect(table, filters, orderBy, limitValue)).then(resolve, reject);
        },
        insert() {
          touched.push({ table, op: "insert" });
          throw new Error("Write operation not allowed in read model");
        },
        update() {
          touched.push({ table, op: "update" });
          throw new Error("Write operation not allowed in read model");
        },
        upsert() {
          touched.push({ table, op: "upsert" });
          throw new Error("Write operation not allowed in read model");
        },
        delete() {
          touched.push({ table, op: "delete" });
          throw new Error("Write operation not allowed in read model");
        },
      };

      return chain;
    },
  };

  return { admin, touched };
}

describe("loadFailedPaymentReconciliationItems", () => {
  it("includes declined scheduled_autopay attempts", async () => {
    const ctx = makeAdmin({
      attempts: [makeAttempt({ attempt_status: "failed_declined" })],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
      methods: [makeMethod()],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.attemptStatus).toBe("failed_declined");
    expect(result.items[0]?.failureCategory).toBe("payment_declined");
  });

  it("includes requires_action scheduled_autopay attempts", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({
          attempt_status: "failed_requires_action",
          requires_action_type: "3ds_authentication",
        }),
      ],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.attemptStatus).toBe("failed_requires_action");
    expect(result.items[0]?.failureCategory).toBe("authentication_required");
  });

  it("includes meaningful blocked_precondition attempts", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({
          attempt_status: "blocked_precondition",
          blocked_reason_code: "connected_account_not_ready",
        }),
      ],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.attemptStatus).toBe("blocked_precondition");
  });

  it("excludes non-meaningful blocked_precondition attempts", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({
          attempt_status: "blocked_precondition",
          blocked_reason_code: "unknown_reason",
        }),
      ],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(0);
  });

  it("excludes succeeded and abandoned attempts", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({ id: "attempt-succeeded", attempt_status: "succeeded" }),
        makeAttempt({ id: "attempt-abandoned", attempt_status: "abandoned" }),
      ],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(0);
  });

  it("excludes attempts resolved to internal invoice payments", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({
          attempt_status: "failed_declined",
          resolved_internal_invoice_payment_id: "payment-123",
        }),
      ],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(0);
  });

  it("excludes non-issued invoice statuses", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({ id: "attempt-draft", invoice_id: "invoice-draft" }),
        makeAttempt({ id: "attempt-void", invoice_id: "invoice-void" }),
        makeAttempt({ id: "attempt-cancelled", invoice_id: "invoice-cancelled" }),
      ],
      invoices: [
        makeInvoice({ id: "invoice-draft", status: "draft" }),
        makeInvoice({ id: "invoice-void", status: "void" }),
        makeInvoice({ id: "invoice-cancelled", status: "cancelled" }),
      ],
      customers: [makeCustomer()],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(0);
  });

  it("computes balance due from collected payment truth", async () => {
    const ctx = makeAdmin({
      attempts: [makeAttempt()],
      invoices: [makeInvoice({ total_cents: 10000 })],
      customers: [makeCustomer()],
      payments: [
        makePayment({ id: "payment-recorded", amount_cents: 2000, payment_status: "recorded" }),
        makePayment({ id: "payment-failed", amount_cents: 3000, payment_status: "failed" }),
      ],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items[0]?.balanceDueCents).toBe(8000);
  });

  it("does not let failed payment rows reduce balance due", async () => {
    const ctx = makeAdmin({
      attempts: [makeAttempt()],
      invoices: [makeInvoice({ total_cents: 10000 })],
      customers: [makeCustomer()],
      payments: [makePayment({ amount_cents: 5000, payment_status: "failed" })],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items[0]?.balanceDueCents).toBe(10000);
  });

  it("does not let inactive allocations reduce balance due", async () => {
    const ctx = makeAdmin({
      attempts: [makeAttempt()],
      invoices: [makeInvoice({ total_cents: 10000 })],
      customers: [makeCustomer()],
      payments: [makePayment({ id: "payment-1", amount_cents: 3000, payment_status: "recorded" })],
      allocations: [
        makeAllocation({
          source_internal_invoice_payment_id: "payment-1",
          allocated_amount_cents: 3000,
          allocation_status: "inactive",
        }),
      ],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items[0]?.balanceDueCents).toBe(10000);
  });

  it("returns correct summary values", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({
          id: "attempt-1",
          attempt_status: "failed_declined",
          invoice_id: "invoice-1",
          created_at: "2026-06-01T09:00:00.000Z",
          submitted_at: "2026-06-01T09:00:00.000Z",
          resolved_at: "2026-06-01T09:00:00.000Z",
        }),
        makeAttempt({
          id: "attempt-2",
          attempt_status: "failed_requires_action",
          invoice_id: "invoice-2",
          created_at: "2026-06-01T10:00:00.000Z",
          submitted_at: "2026-06-01T10:00:00.000Z",
          resolved_at: "2026-06-01T10:00:00.000Z",
        }),
        makeAttempt({
          id: "attempt-3",
          attempt_status: "blocked_precondition",
          blocked_reason_code: "missing_payment_profile",
          invoice_id: "invoice-3",
          created_at: "2026-06-01T11:00:00.000Z",
          submitted_at: "2026-06-01T11:00:00.000Z",
          resolved_at: "2026-06-01T11:00:00.000Z",
        }),
      ],
      invoices: [
        makeInvoice({ id: "invoice-1", total_cents: 1000 }),
        makeInvoice({ id: "invoice-2", total_cents: 2000 }),
        makeInvoice({ id: "invoice-3", total_cents: 3000 }),
      ],
      customers: [makeCustomer()],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.summary.openCount).toBe(3);
    expect(result.summary.declinedCount).toBe(1);
    expect(result.summary.requiresActionCount).toBe(1);
    expect(result.summary.blockedPreconditionCount).toBe(1);
    expect(result.summary.retryEligibleCount).toBe(1);
    expect(result.summary.totalBalanceDueCents).toBe(6000);
    expect(result.summary.oldestOpenedAt).toBe("2026-06-01T09:00:00.000Z");
    expect(result.summary.newestOpenedAt).toBe("2026-06-01T11:00:00.000Z");
  });

  it("scopes results to the requested account owner", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({ account_owner_user_id: "owner-1", invoice_id: "invoice-1" }),
        makeAttempt({
          id: "attempt-other-owner",
          account_owner_user_id: "owner-2",
          invoice_id: "invoice-2",
        }),
      ],
      invoices: [
        makeInvoice({ id: "invoice-1", account_owner_user_id: "owner-1" }),
        makeInvoice({ id: "invoice-2", account_owner_user_id: "owner-2" }),
      ],
      customers: [
        makeCustomer({ id: "customer-1", owner_user_id: "owner-1" }),
        makeCustomer({ id: "customer-2", owner_user_id: "owner-2" }),
      ],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.accountOwnerUserId).toBe("owner-1");
  });

  it("keeps no-Stripe read-only contract flags", async () => {
    const ctx = makeAdmin({
      attempts: [makeAttempt()],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    });

    const result = await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.noStripeCalls).toBe(true);
    expect(result.noPaymentRowWrites).toBe(true);
    expect(result.noAllocationRowWrites).toBe(true);
    expect(result.noInvoiceMutations).toBe(true);
    expect(result.noVisitOrNextDueMutations).toBe(true);
  });

  it("does not perform write operations", async () => {
    const ctx = makeAdmin({
      attempts: [makeAttempt()],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
      methods: [makeMethod()],
      payments: [makePayment()],
      allocations: [makeAllocation()],
    });

    await loadFailedPaymentReconciliationItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(
      ctx.touched.some((entry) => ["insert", "update", "upsert", "delete"].includes(entry.op)),
    ).toBe(false);
  });
});
