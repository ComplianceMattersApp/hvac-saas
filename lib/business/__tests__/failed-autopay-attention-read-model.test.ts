import { describe, expect, it } from "vitest";
import { loadFailedAutopayAttentionItems } from "@/lib/business/failed-autopay-attention-read-model";

type Row = Record<string, unknown>;

type QueryState = {
  eq: Record<string, unknown>;
  in: Record<string, unknown[]>;
  orderBy: Array<{ column: string; ascending: boolean }>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function parseDateMs(value: unknown) {
  const text = clean(value);
  if (!text) return 0;
  return Date.parse(text) || 0;
}

function makeAdmin(seed?: {
  attempts?: Row[];
  invoices?: Row[];
  customers?: Row[];
  methods?: Row[];
  consents?: Row[];
}) {
  const tables: Record<string, Row[]> = {
    tenant_saved_method_payment_attempts: [...(seed?.attempts ?? [])],
    internal_invoices: [...(seed?.invoices ?? [])],
    customers: [...(seed?.customers ?? [])],
    tenant_customer_payment_methods: [...(seed?.methods ?? [])],
    tenant_customer_autopay_consents: [...(seed?.consents ?? [])],
  };

  const touched: Array<{ table: string; op: string }> = [];

  const from = (table: string) => {
    return {
      select: () => {
        touched.push({ table, op: "select" });

        const state: QueryState = {
          eq: {},
          in: {},
          orderBy: [],
        };

        const chain: any = {
          eq: (column: string, value: unknown) => {
            state.eq[column] = value;
            return chain;
          },
          in: (column: string, values: unknown[]) => {
            state.in[column] = values;
            return chain;
          },
          order: (column: string, opts?: { ascending?: boolean }) => {
            state.orderBy.push({ column, ascending: Boolean(opts?.ascending ?? true) });
            return chain;
          },
          limit: async (count: number) => {
            let rows = [...(tables[table] ?? [])];

            rows = rows.filter((row) => {
              const eqOk = Object.entries(state.eq).every(([key, value]) => row[key] === value);
              const inOk = Object.entries(state.in).every(([key, values]) => values.includes(row[key]));
              return eqOk && inOk;
            });

            for (const orderDef of state.orderBy) {
              rows.sort((a, b) => {
                const aValue = a[orderDef.column];
                const bValue = b[orderDef.column];
                const aMs = parseDateMs(aValue);
                const bMs = parseDateMs(bValue);
                const delta = aMs - bMs;
                return orderDef.ascending ? delta : -delta;
              });
            }

            return { data: rows.slice(0, count), error: null };
          },
        };

        return chain;
      },
      insert: () => {
        touched.push({ table, op: "insert" });
        throw new Error(`Unexpected write insert on ${table}`);
      },
      update: () => {
        touched.push({ table, op: "update" });
        throw new Error(`Unexpected write update on ${table}`);
      },
      upsert: () => {
        touched.push({ table, op: "upsert" });
        throw new Error(`Unexpected write upsert on ${table}`);
      },
      delete: () => {
        touched.push({ table, op: "delete" });
        throw new Error(`Unexpected write delete on ${table}`);
      },
    };
  };

  return {
    admin: { from },
    touched,
  };
}

function makeAttempt(overrides?: Row): Row {
  return {
    id: "attempt-1",
    account_owner_user_id: "owner-1",
    customer_id: "cust-1",
    invoice_id: "inv-1",
    billing_period_id: "bp-1",
    maintenance_agreement_id: "ma-1",
    tenant_customer_payment_method_id: "pm-row-1",
    tenant_customer_autopay_consent_id: "consent-1",
    attempt_kind: "scheduled_autopay",
    attempt_status: "failed_declined",
    blocked_reason_code: null,
    failure_code: "card_declined",
    failure_message: "Card declined",
    requires_action_type: null,
    retry_count: 0,
    next_retry_at: null,
    amount_cents_snapshot: 2500,
    invoice_balance_due_cents_snapshot: 2500,
    invoice_status_snapshot: "issued",
    consent_status_snapshot: "enabled",
    payment_method_status_snapshot: "active",
    stripe_connected_account_id: "acct_ready_1",
    created_at: "2026-05-28T10:00:00.000Z",
    submitted_at: "2026-05-28T10:01:00.000Z",
    resolved_at: "2026-05-28T10:02:00.000Z",
    resolved_internal_invoice_payment_id: null,
    ...overrides,
  };
}

function makeInvoice(overrides?: Row): Row {
  return {
    id: "inv-1",
    customer_id: "cust-1",
    invoice_number: "INV-1001",
    status: "issued",
    total_cents: 2500,
    ...overrides,
  };
}

function makeCustomer(overrides?: Row): Row {
  return {
    id: "cust-1",
    full_name: "Ada Lovelace",
    first_name: "Ada",
    last_name: "Lovelace",
    ...overrides,
  };
}

function makeMethod(overrides?: Row): Row {
  return {
    id: "pm-row-1",
    payment_method_status: "active",
    display_brand: "visa",
    display_last4: "4242",
    display_exp_month: 12,
    display_exp_year: 2030,
    ...overrides,
  };
}

function makeConsent(overrides?: Row): Row {
  return {
    id: "consent-1",
    consent_status: "enabled",
    ...overrides,
  };
}

describe("failed autopay attention read model", () => {
  it("includes failed_declined scheduled autopay attempts", async () => {
    const ctx = makeAdmin({
      attempts: [makeAttempt({ id: "attempt-failed-declined" })],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
      methods: [makeMethod()],
      consents: [makeConsent()],
    });

    const result = await loadFailedAutopayAttentionItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.attemptStatus).toBe("failed_declined");
    expect(result.items[0]?.attentionCategory).toBe("payment_declined");
    expect(result.items[0]?.recommendedOperatorAction).toBe("review_payment_method");
  });

  it("includes failed_requires_action and maps authentication category/action", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({
          id: "attempt-requires-action",
          attempt_status: "failed_requires_action",
          failure_code: "authentication_required",
          requires_action_type: "3ds",
        }),
      ],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    });

    const result = await loadFailedAutopayAttentionItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.attentionCategory).toBe("authentication_required");
    expect(result.items[0]?.recommendedOperatorAction).toBe("request_customer_authentication");
  });

  it("includes only meaningful blocked_precondition attempts", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({
          id: "attempt-meaningful-blocked",
          attempt_status: "blocked_precondition",
          blocked_reason_code: "missing_saved_payment_method",
          failure_code: "missing_saved_payment_method",
          failure_message: "No active payment method",
        }),
        makeAttempt({
          id: "attempt-nonmeaningful-blocked",
          attempt_status: "blocked_precondition",
          blocked_reason_code: "duplicate_inflight_attempt",
          failure_code: "duplicate_inflight_attempt",
        }),
      ],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    });

    const result = await loadFailedAutopayAttentionItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items.map((item) => item.attemptId)).toEqual(["attempt-meaningful-blocked"]);
    expect(result.items[0]?.attentionCategory).toBe("precondition_blocked");
    expect(result.items[0]?.recommendedOperatorAction).toBe("fix_payment_setup");
  });

  it("excludes pending/submitted/succeeded/abandoned and resolved attempts", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({ id: "attempt-pending", attempt_status: "pending" }),
        makeAttempt({ id: "attempt-submitted", attempt_status: "submitted" }),
        makeAttempt({ id: "attempt-succeeded", attempt_status: "succeeded" }),
        makeAttempt({ id: "attempt-abandoned", attempt_status: "abandoned" }),
        makeAttempt({
          id: "attempt-resolved-closed",
          attempt_status: "failed_declined",
          resolved_internal_invoice_payment_id: "payment-1",
        }),
      ],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    });

    const result = await loadFailedAutopayAttentionItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(0);
  });

  it("excludes non-scheduled attempts and applies account owner scope", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({ id: "attempt-in-scope" }),
        makeAttempt({ id: "attempt-manual", attempt_kind: "manual_saved_method" }),
        makeAttempt({ id: "attempt-other-owner", account_owner_user_id: "owner-2" }),
      ],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    });

    const result = await loadFailedAutopayAttentionItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items.map((item) => item.attemptId)).toEqual(["attempt-in-scope"]);
  });

  it("applies optional customer and invoice filters", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({ id: "attempt-cust-1-inv-1", customer_id: "cust-1", invoice_id: "inv-1" }),
        makeAttempt({ id: "attempt-cust-2-inv-2", customer_id: "cust-2", invoice_id: "inv-2" }),
      ],
      invoices: [makeInvoice({ id: "inv-1", customer_id: "cust-1" }), makeInvoice({ id: "inv-2", customer_id: "cust-2" })],
      customers: [makeCustomer({ id: "cust-1" }), makeCustomer({ id: "cust-2", full_name: "Grace Hopper" })],
    });

    const customerFiltered = await loadFailedAutopayAttentionItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      customerId: "cust-2",
    });

    expect(customerFiltered.items.map((item) => item.attemptId)).toEqual(["attempt-cust-2-inv-2"]);

    const invoiceFiltered = await loadFailedAutopayAttentionItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      invoiceId: "inv-1",
    });

    expect(invoiceFiltered.items.map((item) => item.attemptId)).toEqual(["attempt-cust-1-inv-1"]);
  });

  it("handles missing joined records without crashing", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({
          id: "attempt-missing-joins",
          customer_id: "cust-missing",
          invoice_id: "inv-missing",
          tenant_customer_payment_method_id: "pm-missing",
          tenant_customer_autopay_consent_id: "consent-missing",
        }),
      ],
      invoices: [],
      customers: [],
      methods: [],
      consents: [],
    });

    const result = await loadFailedAutopayAttentionItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.invoiceNumber).toBeNull();
    expect(result.items[0]?.customerName).toBeNull();
    expect(result.items[0]?.paymentMethod.brand).toBeNull();
    expect(result.items[0]?.consent.consentStatus).toBe("enabled");
  });

  it("sorts newest first by last attempt timestamp and returns counts", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({
          id: "attempt-old",
          attempt_status: "failed_declined",
          submitted_at: "2026-05-28T09:00:00.000Z",
          resolved_at: "2026-05-28T09:00:00.000Z",
        }),
        makeAttempt({
          id: "attempt-new",
          attempt_status: "failed_requires_action",
          submitted_at: "2026-05-28T12:00:00.000Z",
          resolved_at: "2026-05-28T12:00:00.000Z",
          requires_action_type: "3ds",
        }),
        makeAttempt({
          id: "attempt-middle",
          attempt_status: "blocked_precondition",
          blocked_reason_code: "connected_account_not_ready",
          submitted_at: "2026-05-28T10:00:00.000Z",
          resolved_at: "2026-05-28T10:00:00.000Z",
        }),
      ],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    });

    const result = await loadFailedAutopayAttentionItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items.map((item) => item.attemptId)).toEqual([
      "attempt-new",
      "attempt-middle",
      "attempt-old",
    ]);
    expect(result.countsByStatus).toEqual({
      failed_declined: 1,
      failed_requires_action: 1,
      blocked_precondition: 1,
    });
    expect(result.countsByCategory).toEqual({
      payment_declined: 1,
      authentication_required: 1,
      precondition_blocked: 1,
      unknown_failure: 0,
    });
    expect(result.items[1]?.connectedAccountReadinessBlocker).toBe("connected_account_not_ready");
  });

  it("caps results by limit and keeps read-only contract flags", async () => {
    const ctx = makeAdmin({
      attempts: [
        makeAttempt({ id: "attempt-1", created_at: "2026-05-28T10:00:00.000Z" }),
        makeAttempt({ id: "attempt-2", created_at: "2026-05-28T11:00:00.000Z" }),
      ],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    });

    const result = await loadFailedAutopayAttentionItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      limit: 1,
    });

    expect(result.items).toHaveLength(1);
    expect(result.noStripeCalls).toBe(true);
    expect(result.noPaymentRowWrites).toBe(true);
    expect(result.noAllocationRowWrites).toBe(true);
    expect(result.noInvoiceMutations).toBe(true);
    expect(result.noVisitOrNextDueMutations).toBe(true);
  });

  it("does not perform any write operations", async () => {
    const ctx = makeAdmin({
      attempts: [makeAttempt()],
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
      methods: [makeMethod()],
      consents: [makeConsent()],
    });

    await loadFailedAutopayAttentionItems({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(ctx.touched.some((entry) => ["insert", "update", "upsert", "delete"].includes(entry.op))).toBe(false);
  });
});
