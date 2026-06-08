import { afterEach, describe, expect, it, vi } from "vitest";

import { listFieldPaymentCollectionReportsForReconciliation } from "@/lib/business/field-payment-reconciliation-read-model";

type ReportRow = {
  id: string;
  account_owner_user_id: string;
  job_id: string;
  internal_invoice_id: string;
  customer_id: string | null;
  reported_by_user_id: string;
  payment_method: string;
  amount_cents: number;
  currency: string;
  reference: string | null;
  note: string | null;
  status: string;
  reported_at: string | null;
};

type InvoiceRow = {
  id: string;
  account_owner_user_id: string;
  job_id: string;
  customer_id: string | null;
  invoice_display_number: string | null;
  invoice_number: string | null;
  status: string | null;
};

type JobRow = {
  id: string;
  job_display_number: string | null;
  title: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  locations?: Array<{ address_line1: string | null; city: string | null; state: string | null; zip: string | null }>;
};

type CustomerRow = {
  id: string;
  owner_user_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

type InternalUserRow = {
  user_id: string;
  role: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
};

type BuildState = {
  reports?: ReportRow[];
  invoices?: InvoiceRow[];
  jobs?: JobRow[];
  customers?: CustomerRow[];
  internalUsers?: InternalUserRow[];
  profiles?: ProfileRow[];
  tableErrors?: Record<string, unknown>;
};

function makeReport(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: "report-1",
    account_owner_user_id: "owner-1",
    job_id: "job-1",
    internal_invoice_id: "inv-1",
    customer_id: "cust-1",
    reported_by_user_id: "user-1",
    payment_method: "check",
    amount_cents: 1750,
    currency: "usd",
    reference: "CHK-1001",
    note: "Collected in field",
    status: "reported",
    reported_at: "2026-06-05T10:00:00.000Z",
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: "inv-1",
    account_owner_user_id: "owner-1",
    job_id: "job-1",
    customer_id: "cust-1",
    invoice_display_number: "2014",
    invoice_number: "INV-1",
    status: "issued",
    ...overrides,
  };
}

function makeJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job-1",
    job_display_number: "311",
    title: "Microwave not heating",
    customer_first_name: "Eddie",
    customer_last_name: "Castellanos",
    locations: [{
      address_line1: "3166 Jade Ct",
      city: "Stockton",
      state: "CA",
      zip: "95212",
    }],
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: "cust-1",
    owner_user_id: "owner-1",
    full_name: "Eddie Castellanos",
    first_name: "Eddie",
    last_name: "Castellanos",
    ...overrides,
  };
}

function makeInternalUser(overrides: Partial<InternalUserRow> = {}): InternalUserRow {
  return {
    user_id: "user-1",
    role: "tech",
    ...overrides,
  };
}

function makeProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "user-1",
    email: "tech@example.com",
    ...overrides,
  };
}

function makeAdmin(state: BuildState = {}) {
  const touched: Array<{ table: string; op: string }> = [];
  const tables: Record<string, any[]> = {
    field_payment_collection_reports: state.reports ?? [],
    internal_invoices: state.invoices ?? [],
    jobs: state.jobs ?? [],
    customers: state.customers ?? [],
    internal_users: state.internalUsers ?? [],
    profiles: state.profiles ?? [],
  };

  function runSelect(
    table: string,
    filters: Array<{ kind: "eq" | "in"; column: string; value: unknown }>,
    orderBy: { column: string; ascending: boolean } | null,
    limitValue: number | null,
  ) {
    const tableError = state.tableErrors?.[table];
    if (tableError) return { data: null, error: tableError };

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
      rows.sort((a, b) => String(a?.[orderBy.column] ?? "").localeCompare(String(b?.[orderBy.column] ?? "")) * direction);
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
        then(resolve: (value: { data: any[] | null; error: unknown }) => unknown, reject?: (reason?: unknown) => unknown) {
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

describe("listFieldPaymentCollectionReportsForReconciliation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists reported field payment rows", async () => {
    const ctx = makeAdmin({
      reports: [makeReport({ status: "reported" })],
      invoices: [makeInvoice()],
      jobs: [makeJob()],
      customers: [makeCustomer()],
      internalUsers: [makeInternalUser()],
      profiles: [makeProfile()],
    });

    const result = await listFieldPaymentCollectionReportsForReconciliation({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.status).toBe("reported");
  });

  it("includes check cash and other methods", async () => {
    const ctx = makeAdmin({
      reports: [
        makeReport({ id: "report-check", payment_method: "check" }),
        makeReport({ id: "report-cash", payment_method: "cash" }),
        makeReport({ id: "report-other", payment_method: "other" }),
      ],
      invoices: [makeInvoice()],
      jobs: [makeJob()],
      customers: [makeCustomer()],
      internalUsers: [makeInternalUser()],
      profiles: [makeProfile()],
    });

    const result = await listFieldPaymentCollectionReportsForReconciliation({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    const methods = result.items.map((item) => item.paymentMethod).sort();
    expect(methods).toEqual(["cash", "check", "other"]);
  });

  it("includes only open reconciliation statuses and excludes terminal statuses", async () => {
    const ctx = makeAdmin({
      reports: [
        makeReport({ id: "open-1", status: "reported" }),
        makeReport({ id: "open-2", status: "under_review" }),
        makeReport({ id: "open-3", status: "needs_correction" }),
        makeReport({ id: "closed-1", status: "verified" }),
        makeReport({ id: "closed-2", status: "rejected" }),
        makeReport({ id: "closed-3", status: "voided" }),
        makeReport({ id: "closed-4", status: "corrected" }),
      ],
      invoices: [makeInvoice()],
      jobs: [makeJob()],
      customers: [makeCustomer()],
      internalUsers: [makeInternalUser()],
      profiles: [makeProfile()],
    });

    const result = await listFieldPaymentCollectionReportsForReconciliation({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    const ids = result.items.map((item) => item.reportId).sort();
    expect(ids).toEqual(["open-1", "open-2", "open-3"]);
    expect(result.includedStatuses).toEqual(["reported", "under_review", "needs_correction"]);
    expect(result.excludedStatuses).toEqual(["verified", "rejected", "voided", "corrected"]);
  });

  it("includes invoice job customer and location context", async () => {
    const ctx = makeAdmin({
      reports: [makeReport()],
      invoices: [makeInvoice({ invoice_display_number: "2014", invoice_number: "INV-LEGACY-1" })],
      jobs: [makeJob({ job_display_number: "311", title: "Microwave not heating" })],
      customers: [makeCustomer({ full_name: "Eddie Castellanos" })],
      internalUsers: [makeInternalUser({ role: "tech" })],
      profiles: [makeProfile({ email: "tech@example.com" })],
    });

    const result = await listFieldPaymentCollectionReportsForReconciliation({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        invoiceReference: "Invoice #2014",
        jobReference: "Job #311",
        jobTitle: "Microwave not heating",
        customerDisplayName: "Eddie Castellanos",
        locationLabel: "3166 Jade Ct, Stockton CA 95212",
        reportedByDisplayName: "tech@example.com",
      }),
    );
  });

  it("builds selected invoice workspace links with invoice_id", async () => {
    const ctx = makeAdmin({
      reports: [makeReport({ internal_invoice_id: "inv-supp-1", job_id: "job-1" })],
      invoices: [makeInvoice({ id: "inv-supp-1", job_id: "job-1" })],
      jobs: [makeJob({ id: "job-1" })],
      customers: [makeCustomer()],
      internalUsers: [makeInternalUser()],
      profiles: [makeProfile()],
    });

    const result = await listFieldPaymentCollectionReportsForReconciliation({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items[0]?.links.invoiceWorkspaceHref).toBe(
      "/jobs/job-1/invoice?invoice_id=inv-supp-1#invoice-workspace",
    );
    expect(result.items[0]?.links.jobHref).toBe("/jobs/job-1");
  });

  it("is read-only and never performs write operations", async () => {
    const ctx = makeAdmin({
      reports: [makeReport()],
      invoices: [makeInvoice()],
      jobs: [makeJob()],
      customers: [makeCustomer()],
      internalUsers: [makeInternalUser()],
      profiles: [makeProfile()],
    });

    const result = await listFieldPaymentCollectionReportsForReconciliation({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.noVerificationActions).toBe(true);
    expect(result.noPaymentRowWrites).toBe(true);
    expect(result.noAllocationRowWrites).toBe(true);
    expect(result.noInvoiceMutations).toBe(true);
    expect(result.noStripeCalls).toBe(true);

    expect(ctx.touched.some((entry) => entry.op === "insert")).toBe(false);
    expect(ctx.touched.some((entry) => entry.op === "update")).toBe(false);
    expect(ctx.touched.some((entry) => entry.op === "upsert")).toBe(false);
    expect(ctx.touched.some((entry) => entry.op === "delete")).toBe(false);
  });

  it("returns an empty queue when the field payment reports table is missing from PostgREST schema cache", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = makeAdmin({
      reports: [makeReport()],
      tableErrors: {
        field_payment_collection_reports: {
          code: "PGRST205",
          message: "Could not find the table 'public.field_payment_collection_reports' in the schema cache",
        },
      },
    });

    const result = await listFieldPaymentCollectionReportsForReconciliation({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    });

    expect(result.items).toEqual([]);
    expect(result.summary).toEqual({
      openCount: 0,
      reportedCount: 0,
      underReviewCount: 0,
      needsCorrectionCount: 0,
      totalReportedAmountCents: 0,
      oldestReportedAt: null,
      newestReportedAt: null,
    });
    expect(result.noPaymentRowWrites).toBe(true);
    expect(result.noInvoiceMutations).toBe(true);
    expect(ctx.touched.some((entry) => entry.table !== "field_payment_collection_reports")).toBe(false);
    expect(ctx.touched.some((entry) => ["insert", "update", "upsert", "delete"].includes(entry.op))).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "Field payment reconciliation reports table is unavailable; returning empty reconciliation queue",
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        error: "Could not find the table 'public.field_payment_collection_reports' in the schema cache",
      }),
    );
  });

  it("does not fail-soft unrelated field payment report read errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = makeAdmin({
      tableErrors: {
        field_payment_collection_reports: {
          code: "42501",
          message: "permission denied for table field_payment_collection_reports",
        },
      },
    });

    await expect(listFieldPaymentCollectionReportsForReconciliation({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
    })).rejects.toThrow("Failed to load field payment reconciliation reports: permission denied for table field_payment_collection_reports");

    expect(warn).not.toHaveBeenCalled();
  });
});
