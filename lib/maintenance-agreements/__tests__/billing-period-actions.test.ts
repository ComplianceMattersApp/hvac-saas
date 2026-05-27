import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const redirectMock = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirectMock(to),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (error: any) => Boolean(error && (error.name === "InternalAccessError" || error.code)),
}));

type MockRow = Record<string, any>;

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const AGREEMENT_ID = "33333333-3333-4333-8333-333333333333";
const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const PERIOD_ONE_ID = "55555555-5555-4555-8555-555555555555";
const PERIOD_TWO_ID = "66666666-6666-4666-8666-666666666666";
const PERIOD_THREE_ID = "77777777-7777-4777-8777-777777777777";
const JOB_ONE_ID = "88888888-8888-4888-8888-888888888888";
const JOB_TWO_ID = "99999999-9999-4999-8999-999999999999";
const INVOICE_ONE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVOICE_TWO_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function buildSelectable(rows: MockRow[]) {
  const eqFilters: Array<[string, unknown]> = [];
  const neqFilters: Array<[string, unknown]> = [];
  const isFilters: Array<[string, unknown]> = [];

  const exec = () =>
    rows.filter((row) => eqFilters.every(([column, value]) => row[column] === value))
      .filter((row) => neqFilters.every(([column, value]) => row[column] !== value))
      .filter((row) => isFilters.every(([column, value]) => row[column] === value));

  const build = (): any => ({
    select: () => build(),
    eq: (column: string, value: unknown) => {
      eqFilters.push([column, value]);
      return build();
    },
    neq: (column: string, value: unknown) => {
      neqFilters.push([column, value]);
      return build();
    },
    is: (column: string, value: unknown) => {
      isFilters.push([column, value]);
      return build();
    },
    order: () => build(),
    maybeSingle: async () => ({ data: exec()[0] ?? null, error: null }),
    then: (resolve: any, reject?: any) => Promise.resolve({ data: exec(), error: null }).then(resolve, reject),
  });

  return build();
}

function makeBillingPeriodRow(input: Partial<MockRow> & { id: string }) {
  return {
    account_owner_user_id: OWNER_ID,
    maintenance_agreement_id: AGREEMENT_ID,
    customer_id: CUSTOMER_ID,
    coverage_start_date: "2026-06-01",
    coverage_end_date: "2026-06-30",
    billing_due_date: "2026-06-15",
    billing_cadence: "monthly",
    amount_due_cents: 20000,
    currency: "usd",
    billing_posture: "manual",
    billing_period_status: "draft",
    internal_invoice_id: null,
    external_reference: null,
    external_notes: null,
    status_reason: null,
    created_at: "2026-05-26T00:00:00Z",
    created_by_user_id: USER_ID,
    updated_at: "2026-05-26T00:00:00Z",
    updated_by_user_id: USER_ID,
    ...input,
  };
}

function makeInvoiceRow(input: Partial<MockRow> & { id: string }) {
  return {
    account_owner_user_id: OWNER_ID,
    customer_id: CUSTOMER_ID,
    job_id: JOB_ONE_ID,
    status: "draft",
    ...input,
  };
}

function makeJobRow(input: Partial<MockRow> & { id: string }) {
  return {
    account_owner_user_id: OWNER_ID,
    customer_id: CUSTOMER_ID,
    location_id: null,
    service_case_id: null,
    ...input,
  };
}

function makeAdminClient(params?: {
  agreement?: MockRow | null;
  customer?: MockRow | null;
  periods?: MockRow[];
  invoices?: MockRow[];
  jobs?: MockRow[];
  visitLinks?: MockRow[];
  insertReturns?: MockRow | null;
  updateReturns?: MockRow | null;
  updateError?: { code?: string; message?: string } | null;
  invoiceInsertReturns?: MockRow | null;
  invoiceInsertError?: { code?: string; message?: string } | null;
  lineItemInsertError?: { code?: string; message?: string } | null;
}) {
  const agreement = params?.agreement === undefined
    ? {
        id: AGREEMENT_ID,
        account_owner_user_id: OWNER_ID,
        customer_id: CUSTOMER_ID,
      }
    : params.agreement;
  const customer = params?.customer === undefined ? { id: CUSTOMER_ID, owner_user_id: OWNER_ID } : params.customer;
  const periods = params?.periods ?? [];
  const invoices = params?.invoices ?? [];
  const jobs = params?.jobs ?? [];
  const visitLinks = params?.visitLinks ?? [];
  const insertCalls: unknown[] = [];
  const updateCalls: unknown[] = [];
  const invoiceInsertCalls: unknown[] = [];
  const lineItemInsertCalls: unknown[] = [];
  const seenTables: string[] = [];
  const deleteMock = vi.fn(() => {
    throw new Error("delete should not be used");
  });

  return {
    from: vi.fn((table: string) => {
      seenTables.push(table);

      if (table === "maintenance_agreements") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: agreement, error: null }),
            }),
          }),
        };
      }

      if (table === "customers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: customer, error: null }),
            }),
          }),
        };
      }

      if (table === "maintenance_agreement_billing_periods") {
        return {
          select: () => buildSelectable(periods),
          insert: (payload: unknown) => {
            insertCalls.push(payload);
            return {
              select: () => ({
                maybeSingle: async () => ({ data: params?.insertReturns ?? { id: PERIOD_ONE_ID }, error: null }),
              }),
            };
          },
          update: (payload: unknown) => {
            updateCalls.push(payload);
            const eqFilters: Array<[string, unknown]> = [];
            const isFilters: Array<[string, unknown]> = [];
            const resolveRow = () => {
              if (params?.updateReturns !== undefined) return params.updateReturns;
              const match = periods.find((row) =>
                eqFilters.every(([column, value]) => row[column] === value) &&
                isFilters.every(([column, value]) => row[column] === value)
              );
              return match ? { id: String(match.id) } : null;
            };

            const build = (): any => ({
              eq: (column: string, value: unknown) => {
                eqFilters.push([column, value]);
                return build();
              },
              is: (column: string, value: unknown) => {
                isFilters.push([column, value]);
                return build();
              },
              select: () => ({
                maybeSingle: async () => ({
                  data: params?.updateError ? null : (resolveRow() ?? null),
                  error: params?.updateError ?? null,
                }),
              }),
            });

            return build();
          },
          delete: deleteMock,
        };
      }

      if (table === "internal_invoices") {
        return {
          select: () => buildSelectable(invoices),
          insert: (payload: unknown) => {
            invoiceInsertCalls.push(payload);
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: params?.invoiceInsertError
                    ? null
                    : (params?.invoiceInsertReturns ?? { id: INVOICE_ONE_ID, status: "draft" }),
                  error: params?.invoiceInsertError ?? null,
                }),
              }),
            };
          },
        };
      }

      if (table === "internal_invoice_line_items") {
        return {
          insert: async (payload: unknown) => {
            lineItemInsertCalls.push(payload);
            return { error: params?.lineItemInsertError ?? null };
          },
        };
      }

      if (table === "jobs") {
        return {
          select: () => buildSelectable(jobs),
        };
      }

      if (table === "maintenance_agreement_visits") {
        return {
          select: () => buildSelectable(visitLinks),
        };
      }

      if (["internal_invoice_payments", "internal_invoice_payment_allocations", "stripe"].includes(table)) {
        throw new Error(`Forbidden table touched: ${table}`);
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    _insertCalls: insertCalls,
    _updateCalls: updateCalls,
    _invoiceInsertCalls: invoiceInsertCalls,
    _lineItemInsertCalls: lineItemInsertCalls,
    _seenTables: seenTables,
    _deleteMock: deleteMock,
  };
}

function buildFormData(overrides?: Record<string, string>) {
  const formData = new FormData();
  const values = {
    maintenance_agreement_id: AGREEMENT_ID,
    coverage_start_date: "2026-07-01",
    coverage_end_date: "2026-07-31",
    billing_cadence: "monthly",
    amount_due_cents: "25000",
    currency: "usd",
    billing_posture: "manual",
    billing_period_status: "draft",
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function buildLinkFormData(overrides?: Record<string, string>) {
  const formData = new FormData();
  const values = {
    billing_period_id: PERIOD_ONE_ID,
    internal_invoice_id: INVOICE_ONE_ID,
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function buildUnlinkFormData(overrides?: Record<string, string>) {
  const formData = new FormData();
  const values = {
    billing_period_id: PERIOD_ONE_ID,
    status_reason: "Correction: linked wrong invoice",
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function buildGenerateDraftInvoiceFormData(overrides?: Record<string, string>) {
  const formData = new FormData();
  const values = {
    billing_period_id: PERIOD_ONE_ID,
    anchor_job_id: JOB_ONE_ID,
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

async function expectRedirect(fn: () => Promise<void>) {
  try {
    await fn();
    throw new Error("Expected redirect");
  } catch (error: any) {
    const message = String(error?.message ?? "");
    if (message.startsWith("REDIRECT:")) {
      return message.slice("REDIRECT:".length);
    }
    throw error;
  }
}

describe("billing period server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue({});
    requireInternalUserMock.mockResolvedValue({
      userId: USER_ID,
      internalUser: {
        user_id: USER_ID,
        role: "billing",
        is_active: true,
        account_owner_user_id: OWNER_ID,
      },
    });
  });

  it("allows Owner/Admin/Billing to create and revalidates the customer profile", async () => {
    const admin = makeAdminClient();
    createAdminClientMock.mockReturnValue(admin);

    const { createMaintenanceAgreementBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    const target = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData()),
    );

    expect(target).toBe(`/customers/${CUSTOMER_ID}?banner=created`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/customers/${CUSTOMER_ID}`);
    expect(admin._insertCalls).toHaveLength(1);
    expect(admin._insertCalls[0]).toMatchObject({
      account_owner_user_id: OWNER_ID,
      maintenance_agreement_id: AGREEMENT_ID,
      customer_id: CUSTOMER_ID,
      coverage_start_date: "2026-07-01",
      coverage_end_date: "2026-07-31",
      billing_cadence: "monthly",
      amount_due_cents: 25000,
      currency: "usd",
      billing_posture: "manual",
      billing_period_status: "draft",
      internal_invoice_id: null,
      created_by_user_id: USER_ID,
      updated_by_user_id: USER_ID,
    });
  });

  it("awaits the server client before internal auth checks in create action", async () => {
    const serverClient = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
      },
    };
    createClientMock.mockResolvedValueOnce(serverClient);

    requireInternalUserMock.mockImplementationOnce(async ({ supabase }: any) => {
      expect(supabase).toBe(serverClient);
      expect(typeof supabase?.auth?.getUser).toBe("function");
      return {
        userId: USER_ID,
        internalUser: {
          user_id: USER_ID,
          role: "billing",
          is_active: true,
          account_owner_user_id: OWNER_ID,
        },
      };
    });

    const admin = makeAdminClient();
    createAdminClientMock.mockReturnValue(admin);

    const { createMaintenanceAgreementBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    const target = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData()),
    );

    expect(target).toBe(`/customers/${CUSTOMER_ID}?banner=created`);
    expect(requireInternalUserMock).toHaveBeenCalledWith({ supabase: serverClient });
  });

  it("denies office/tech roles and internal access failures", async () => {
    const officeAdmin = makeAdminClient();
    createAdminClientMock.mockReturnValue(officeAdmin);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: "88888888-8888-4888-8888-888888888888",
      internalUser: {
        user_id: "88888888-8888-4888-8888-888888888888",
        role: "office",
        is_active: true,
        account_owner_user_id: OWNER_ID,
      },
    });

    const { createMaintenanceAgreementBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    const officeTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData()),
    );
    expect(officeTarget).toBe(`/customers/${CUSTOMER_ID}?banner=access_denied`);
    expect(officeAdmin._insertCalls).toHaveLength(0);

    const techAdmin = makeAdminClient();
    createAdminClientMock.mockReturnValue(techAdmin);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: "99999999-9999-4999-8999-999999999999",
      internalUser: {
        user_id: "99999999-9999-4999-8999-999999999999",
        role: "tech",
        is_active: true,
        account_owner_user_id: OWNER_ID,
      },
    });

    const techTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData()),
    );
    expect(techTarget).toBe(`/customers/${CUSTOMER_ID}?banner=access_denied`);

    const accessFailureAdmin = makeAdminClient();
    createAdminClientMock.mockReturnValue(accessFailureAdmin);
    requireInternalUserMock.mockRejectedValueOnce({ name: "InternalAccessError", code: "AUTH_REQUIRED", message: "Authentication required." });

    const accessFailureTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData()),
    );
    expect(accessFailureTarget).toBe(`/customers/${CUSTOMER_ID}?banner=access_denied`);
  });

  it("denies missing agreements and cross-account agreement/customer scope", async () => {
    const missingAgreementAdmin = makeAdminClient({ agreement: null });
    createAdminClientMock.mockReturnValue(missingAgreementAdmin);

    const { createMaintenanceAgreementBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    const missingTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData()),
    );
    expect(missingTarget).toBe(`/customers/${CUSTOMER_ID}?banner=validation_error`);

    const crossAccountAdmin = makeAdminClient({
      agreement: {
        id: AGREEMENT_ID,
        account_owner_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        customer_id: CUSTOMER_ID,
      },
      customer: { id: CUSTOMER_ID, owner_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    });
    createAdminClientMock.mockReturnValue(crossAccountAdmin);

    const crossAccountTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData()),
    );
    expect(crossAccountTarget).toBe(`/customers/${CUSTOMER_ID}?banner=access_denied`);
  });

  it("enforces required fields, date ordering, and overlap rules", async () => {
    const admin = makeAdminClient();
    createAdminClientMock.mockReturnValue(admin);

    const { createMaintenanceAgreementBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    const missingTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ coverage_start_date: "" })),
    );
    expect(missingTarget).toBe(`/customers/${CUSTOMER_ID}?banner=validation_error`);

    const invalidOrderTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ coverage_start_date: "2026-08-01", coverage_end_date: "2026-07-01" })),
    );
    expect(invalidOrderTarget).toBe(`/customers/${CUSTOMER_ID}?banner=validation_error`);

    createAdminClientMock.mockReturnValue(makeAdminClient({ periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, coverage_start_date: "2026-07-01", coverage_end_date: "2026-07-31" })] }));
    const duplicateTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData()),
    );
    expect(duplicateTarget).toBe(`/customers/${CUSTOMER_ID}?banner=duplicate_or_overlap_error`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, coverage_start_date: "2026-06-15", coverage_end_date: "2026-07-15" })],
    }));
    const overlapTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData()),
    );
    expect(overlapTarget).toBe(`/customers/${CUSTOMER_ID}?banner=duplicate_or_overlap_error`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, coverage_start_date: "2026-06-15", coverage_end_date: "2026-07-15", billing_period_status: "cancelled" })],
    }));
    const cancelledTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData()),
    );
    expect(cancelledTarget).toBe(`/customers/${CUSTOMER_ID}?banner=created`);
  });

  it("enforces posture-specific validation and normalization", async () => {
    const admin = makeAdminClient();
    createAdminClientMock.mockReturnValue(admin);

    const { createMaintenanceAgreementBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    const invoiceIdTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ billing_posture: "internal_invoice", billing_period_status: "draft", internal_invoice_id: PERIOD_ONE_ID })),
    );
    expect(invoiceIdTarget).toBe(`/customers/${CUSTOMER_ID}?banner=validation_error`);

    const internalAllowedTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ billing_posture: "internal_invoice", billing_period_status: "pending_billing" })),
    );
    expect(internalAllowedTarget).toBe(`/customers/${CUSTOMER_ID}?banner=created`);
    expect(admin._insertCalls[0]).toMatchObject({ billing_posture: "internal_invoice", billing_period_status: "pending_billing", internal_invoice_id: null });

    const noChargeTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ billing_posture: "no_charge", billing_period_status: "draft", amount_due_cents: "0" })),
    );
    expect(noChargeTarget).toBe(`/customers/${CUSTOMER_ID}?banner=created`);
    expect(admin._insertCalls[1]).toMatchObject({ billing_posture: "no_charge", billing_period_status: "no_charge", amount_due_cents: 0 });

    const waivedMissingReasonTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ billing_posture: "waived", billing_period_status: "draft", status_reason: "" })),
    );
    expect(waivedMissingReasonTarget).toBe(`/customers/${CUSTOMER_ID}?banner=validation_error`);

    const waivedTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ billing_posture: "waived", billing_period_status: "draft", status_reason: "Courtesy waiver" })),
    );
    expect(waivedTarget).toBe(`/customers/${CUSTOMER_ID}?banner=created`);
    expect(admin._insertCalls[2]).toMatchObject({ billing_posture: "waived", billing_period_status: "waived", status_reason: "Courtesy waiver" });

    const notBilledMissingReasonTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ billing_posture: "not_billed_through_compliance_matters", billing_period_status: "draft", status_reason: "" })),
    );
    expect(notBilledMissingReasonTarget).toBe(`/customers/${CUSTOMER_ID}?banner=validation_error`);

    const notBilledTarget = await expectRedirect(() =>
      createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ billing_posture: "not_billed_through_compliance_matters", billing_period_status: "draft", status_reason: "External billing handled elsewhere" })),
    );
    expect(notBilledTarget).toBe(`/customers/${CUSTOMER_ID}?banner=created`);
    expect(admin._insertCalls[3]).toMatchObject({ billing_posture: "not_billed_through_compliance_matters", billing_period_status: "not_billed", status_reason: "External billing handled elsewhere" });
  });

  it("allows update only for non-linked rows and cancel with a reason", async () => {
    const admin = makeAdminClient({ periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: null })], updateReturns: { id: PERIOD_ONE_ID } });
    createAdminClientMock.mockReturnValue(admin);

    const { updateMaintenanceAgreementBillingPeriodFromForm, cancelMaintenanceAgreementBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    const updateTarget = await expectRedirect(() =>
      updateMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ billing_period_id: PERIOD_ONE_ID, coverage_start_date: "2026-07-02", coverage_end_date: "2026-07-31", billing_period_status: "pending_billing", amount_due_cents: "26000" })),
    );
    expect(updateTarget).toBe(`/customers/${CUSTOMER_ID}?banner=updated`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/customers/${CUSTOMER_ID}`);
    expect(admin._updateCalls[0]).toMatchObject({ coverage_start_date: "2026-07-02", coverage_end_date: "2026-07-31", billing_period_status: "pending_billing", amount_due_cents: 26000 });

    const linkedAdmin = makeAdminClient({ periods: [makeBillingPeriodRow({ id: PERIOD_TWO_ID, internal_invoice_id: "inv-1" })] });
    createAdminClientMock.mockReturnValue(linkedAdmin);
    const linkedTarget = await expectRedirect(() =>
      updateMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ billing_period_id: PERIOD_TWO_ID, coverage_start_date: "2026-07-02", coverage_end_date: "2026-07-31" })),
    );
    expect(linkedTarget).toBe(`/customers/${CUSTOMER_ID}?banner=validation_error`);

    createAdminClientMock.mockReturnValue(makeAdminClient({ periods: [makeBillingPeriodRow({ id: PERIOD_THREE_ID, internal_invoice_id: null })], updateReturns: { id: PERIOD_THREE_ID } }));
    const cancelMissingReasonTarget = await expectRedirect(() =>
      cancelMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ billing_period_id: PERIOD_THREE_ID, status_reason: "" })),
    );
    expect(cancelMissingReasonTarget).toBe(`/customers/${CUSTOMER_ID}?banner=validation_error`);

    const cancelTarget = await expectRedirect(() =>
      cancelMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData({ billing_period_id: PERIOD_THREE_ID, billing_period_status: "draft", status_reason: "Customer requested pause" })),
    );
    expect(cancelTarget).toBe(`/customers/${CUSTOMER_ID}?banner=cancelled`);
    expect(createAdminClientMock.mock.results.at(-1)?.value._updateCalls[0]).toMatchObject({ billing_period_status: "cancelled", status_reason: "Customer requested pause" });
  });

  it("links an eligible invoice for Owner/Admin/Billing and sets invoice_linked state", async () => {
    const admin = makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, billing_period_status: "pending_billing", internal_invoice_id: null })],
      invoices: [makeInvoiceRow({ id: INVOICE_ONE_ID, job_id: JOB_ONE_ID, status: "draft" })],
      visitLinks: [{ id: "visit-1", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
      updateReturns: { id: PERIOD_ONE_ID },
    });
    createAdminClientMock.mockReturnValue(admin);

    const { linkInternalInvoiceToBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    const target = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );

    expect(target).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_linked`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/customers/${CUSTOMER_ID}`);
    expect(admin._updateCalls).toHaveLength(1);
    expect(admin._updateCalls[0]).toMatchObject({
      internal_invoice_id: INVOICE_ONE_ID,
      billing_period_status: "invoice_linked",
      updated_by_user_id: USER_ID,
    });
  });

  it("denies dispatcher/technician for manual link actions", async () => {
    const dispatcherAdmin = makeAdminClient();
    createAdminClientMock.mockReturnValue(dispatcherAdmin);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      internalUser: {
        user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        role: "dispatcher",
        is_active: true,
        account_owner_user_id: OWNER_ID,
      },
    });

    const { linkInternalInvoiceToBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    const dispatcherTarget = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );
    expect(dispatcherTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_denied`);

    const technicianAdmin = makeAdminClient();
    createAdminClientMock.mockReturnValue(technicianAdmin);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      internalUser: {
        user_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        role: "technician",
        is_active: true,
        account_owner_user_id: OWNER_ID,
      },
    });

    const technicianTarget = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );
    expect(technicianTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_denied`);
  });

  it("rejects invalid/missing period, invoice, and cancelled/already-linked period states", async () => {
    const { linkInternalInvoiceToBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    createAdminClientMock.mockReturnValue(makeAdminClient({ periods: [] }));
    const missingPeriod = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );
    expect(missingPeriod).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_invalid`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, billing_period_status: "pending_billing", internal_invoice_id: null })],
      invoices: [],
    }));
    const missingInvoice = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );
    expect(missingInvoice).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_invalid`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, billing_period_status: "cancelled", internal_invoice_id: null })],
      invoices: [makeInvoiceRow({ id: INVOICE_ONE_ID })],
    }));
    const cancelledTarget = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );
    expect(cancelledTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_invalid`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, billing_period_status: "pending_billing", internal_invoice_id: INVOICE_TWO_ID })],
      invoices: [makeInvoiceRow({ id: INVOICE_ONE_ID })],
    }));
    const alreadyLinkedTarget = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );
    expect(alreadyLinkedTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_conflict`);
  });

  it("rejects cross-account, void, claimed, customer-mismatch, and agreement-visit mismatch invoices", async () => {
    const { linkInternalInvoiceToBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: null })],
      invoices: [makeInvoiceRow({ id: INVOICE_ONE_ID, account_owner_user_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" })],
    }));
    const crossAccount = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );
    expect(crossAccount).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_denied`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: null })],
      invoices: [makeInvoiceRow({ id: INVOICE_ONE_ID, status: "void" })],
    }));
    const voidInvoice = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );
    expect(voidInvoice).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_invalid`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [
        makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: null }),
        makeBillingPeriodRow({ id: PERIOD_TWO_ID, internal_invoice_id: INVOICE_ONE_ID }),
      ],
      invoices: [makeInvoiceRow({ id: INVOICE_ONE_ID })],
    }));
    const claimedInvoice = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );
    expect(claimedInvoice).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_conflict`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: null })],
      invoices: [makeInvoiceRow({ id: INVOICE_ONE_ID, customer_id: "ffffffff-ffff-4fff-8fff-ffffffffffff" })],
    }));
    const customerMismatch = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );
    expect(customerMismatch).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_invalid`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: null })],
      invoices: [makeInvoiceRow({ id: INVOICE_ONE_ID, job_id: JOB_TWO_ID })],
      visitLinks: [{ id: "visit-other", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
    }));
    const visitMismatch = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );
    expect(visitMismatch).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_invalid`);
  });

  it("allows unlink with reason for Owner/Admin/Billing and restores pending_billing", async () => {
    const admin = makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: INVOICE_ONE_ID, billing_period_status: "invoice_linked" })],
      updateReturns: { id: PERIOD_ONE_ID },
    });
    createAdminClientMock.mockReturnValue(admin);

    const { unlinkInternalInvoiceFromBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    const target = await expectRedirect(() =>
      unlinkInternalInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildUnlinkFormData()),
    );

    expect(target).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_unlinked`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/customers/${CUSTOMER_ID}`);
    expect(admin._updateCalls[0]).toMatchObject({
      internal_invoice_id: null,
      billing_period_status: "pending_billing",
      status_reason: "Correction: linked wrong invoice",
      updated_by_user_id: USER_ID,
    });
  });

  it("requires unlink reason and does not unlink periods without an invoice", async () => {
    const { unlinkInternalInvoiceFromBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: INVOICE_ONE_ID })],
    }));
    const missingReason = await expectRedirect(() =>
      unlinkInternalInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildUnlinkFormData({ status_reason: "" })),
    );
    expect(missingReason).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_unlink_reason_required`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: null })],
    }));
    const noInvoiceLinked = await expectRedirect(() =>
      unlinkInternalInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildUnlinkFormData()),
    );
    expect(noInvoiceLinked).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_invalid`);
  });

  it("generates draft invoice from billing period for Owner/Admin/Billing and links the period", async () => {
    const admin = makeAdminClient({
      periods: [
        makeBillingPeriodRow({
          id: PERIOD_ONE_ID,
          internal_invoice_id: null,
          billing_period_status: "pending_billing",
          billing_posture: "internal_invoice",
          amount_due_cents: 25000,
          coverage_start_date: "2026-07-01",
          coverage_end_date: "2026-07-31",
          billing_cadence: "monthly",
        }),
      ],
      jobs: [makeJobRow({ id: JOB_ONE_ID, customer_id: CUSTOMER_ID })],
      invoices: [],
      visitLinks: [{ id: "visit-1", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
      updateReturns: { id: PERIOD_ONE_ID },
    });
    createAdminClientMock.mockReturnValue(admin);

    const { generateDraftInvoiceFromBillingPeriodFromForm } = await import(
      "@/lib/maintenance-agreements/billing-period-actions"
    );

    const target = await expectRedirect(() =>
      generateDraftInvoiceFromBillingPeriodFromForm(
        `/customers/${CUSTOMER_ID}`,
        buildGenerateDraftInvoiceFormData(),
      )
    );

    expect(target).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_generated`);
    expect(admin._invoiceInsertCalls).toHaveLength(1);
    expect(admin._invoiceInsertCalls[0]).toMatchObject({
      account_owner_user_id: OWNER_ID,
      job_id: JOB_ONE_ID,
      customer_id: CUSTOMER_ID,
      status: "draft",
      source_type: "job",
      subtotal_cents: 25000,
      total_cents: 25000,
      created_by_user_id: USER_ID,
      updated_by_user_id: USER_ID,
    });
    expect(admin._lineItemInsertCalls).toHaveLength(1);
    expect(admin._lineItemInsertCalls[0]).toMatchObject({
      invoice_id: INVOICE_ONE_ID,
      source_kind: "manual",
      item_name_snapshot: "Service Plan Billing Period",
      item_type_snapshot: "service",
      quantity: "1.00",
      unit_price: "250.00",
      line_subtotal: "250.00",
      created_by_user_id: USER_ID,
      updated_by_user_id: USER_ID,
    });
    expect(String((admin._lineItemInsertCalls[0] as any)?.description_snapshot ?? "")).toContain("Service Plan Billing Period (monthly): 07/01/2026-07/31/2026");
    expect(admin._updateCalls.at(-1)).toMatchObject({
      internal_invoice_id: INVOICE_ONE_ID,
      billing_period_status: "invoice_linked",
      updated_by_user_id: USER_ID,
    });
  });

  it("denies dispatcher/technician for generate draft invoice action", async () => {
    const { generateDraftInvoiceFromBillingPeriodFromForm } = await import(
      "@/lib/maintenance-agreements/billing-period-actions"
    );

    const dispatcherAdmin = makeAdminClient();
    createAdminClientMock.mockReturnValue(dispatcherAdmin);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      internalUser: {
        user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        role: "dispatcher",
        is_active: true,
        account_owner_user_id: OWNER_ID,
      },
    });

    const dispatcherTarget = await expectRedirect(() =>
      generateDraftInvoiceFromBillingPeriodFromForm(
        `/customers/${CUSTOMER_ID}`,
        buildGenerateDraftInvoiceFormData(),
      )
    );
    expect(dispatcherTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_generate_denied`);

    const technicianAdmin = makeAdminClient();
    createAdminClientMock.mockReturnValue(technicianAdmin);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      internalUser: {
        user_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        role: "technician",
        is_active: true,
        account_owner_user_id: OWNER_ID,
      },
    });

    const technicianTarget = await expectRedirect(() =>
      generateDraftInvoiceFromBillingPeriodFromForm(
        `/customers/${CUSTOMER_ID}`,
        buildGenerateDraftInvoiceFormData(),
      )
    );
    expect(technicianTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_generate_denied`);
  });

  it("blocks cancelled/already-linked/zero-amount periods and missing visit linkage for generation", async () => {
    const { generateDraftInvoiceFromBillingPeriodFromForm } = await import(
      "@/lib/maintenance-agreements/billing-period-actions"
    );

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, billing_period_status: "cancelled", billing_posture: "internal_invoice" })],
      jobs: [makeJobRow({ id: JOB_ONE_ID })],
      visitLinks: [{ id: "visit-1", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
    }));
    const cancelledTarget = await expectRedirect(() =>
      generateDraftInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildGenerateDraftInvoiceFormData())
    );
    expect(cancelledTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_generate_invalid`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: INVOICE_TWO_ID, billing_posture: "internal_invoice" })],
      jobs: [makeJobRow({ id: JOB_ONE_ID })],
      visitLinks: [{ id: "visit-1", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
    }));
    const linkedTarget = await expectRedirect(() =>
      generateDraftInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildGenerateDraftInvoiceFormData())
    );
    expect(linkedTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_generate_conflict`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, amount_due_cents: 0, billing_posture: "internal_invoice" })],
      jobs: [makeJobRow({ id: JOB_ONE_ID })],
      visitLinks: [{ id: "visit-1", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
    }));
    const zeroAmountTarget = await expectRedirect(() =>
      generateDraftInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildGenerateDraftInvoiceFormData())
    );
    expect(zeroAmountTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_generate_invalid`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, billing_posture: "internal_invoice" })],
      jobs: [makeJobRow({ id: JOB_ONE_ID })],
      visitLinks: [{ id: "visit-mismatch", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_TWO_ID }],
    }));
    const visitMismatchTarget = await expectRedirect(() =>
      generateDraftInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildGenerateDraftInvoiceFormData())
    );
    expect(visitMismatchTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_generate_invalid`);
  });

  it("blocks wrong-account/wrong-customer anchor job scope", async () => {
    const { generateDraftInvoiceFromBillingPeriodFromForm } = await import(
      "@/lib/maintenance-agreements/billing-period-actions"
    );

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, billing_posture: "internal_invoice" })],
      jobs: [makeJobRow({ id: JOB_ONE_ID, account_owner_user_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" })],
      visitLinks: [{ id: "visit-1", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
    }));
    const wrongAccountTarget = await expectRedirect(() =>
      generateDraftInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildGenerateDraftInvoiceFormData())
    );
    expect(wrongAccountTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_generate_denied`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, billing_posture: "internal_invoice" })],
      jobs: [makeJobRow({ id: JOB_ONE_ID, customer_id: "ffffffff-ffff-4fff-8fff-ffffffffffff" })],
      visitLinks: [{ id: "visit-1", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
    }));
    const wrongCustomerTarget = await expectRedirect(() =>
      generateDraftInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildGenerateDraftInvoiceFormData())
    );
    expect(wrongCustomerTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_generate_invalid`);
  });

  it("blocks duplicate generation when anchor job already has active invoice or period link race occurs", async () => {
    const { generateDraftInvoiceFromBillingPeriodFromForm } = await import(
      "@/lib/maintenance-agreements/billing-period-actions"
    );

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: null, billing_posture: "internal_invoice" })],
      jobs: [makeJobRow({ id: JOB_ONE_ID })],
      invoices: [makeInvoiceRow({ id: INVOICE_TWO_ID, job_id: JOB_ONE_ID, status: "draft" })],
      visitLinks: [{ id: "visit-1", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
    }));
    const existingInvoiceTarget = await expectRedirect(() =>
      generateDraftInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildGenerateDraftInvoiceFormData())
    );
    expect(existingInvoiceTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_generate_conflict`);

    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: null, billing_posture: "internal_invoice" })],
      jobs: [makeJobRow({ id: JOB_ONE_ID })],
      invoices: [],
      visitLinks: [{ id: "visit-1", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
      updateReturns: null,
    }));
    const raceTarget = await expectRedirect(() =>
      generateDraftInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildGenerateDraftInvoiceFormData())
    );
    expect(raceTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_generate_conflict`);
  });

  it("preserves forbidden side effects during generation (no payments/allocations/Stripe/visits/next_due mutations)", async () => {
    const admin = makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: null, billing_posture: "internal_invoice" })],
      jobs: [makeJobRow({ id: JOB_ONE_ID })],
      invoices: [],
      visitLinks: [{ id: "visit-1", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
      updateReturns: { id: PERIOD_ONE_ID },
    });
    createAdminClientMock.mockReturnValue(admin);

    const { generateDraftInvoiceFromBillingPeriodFromForm } = await import(
      "@/lib/maintenance-agreements/billing-period-actions"
    );

    await expectRedirect(() =>
      generateDraftInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildGenerateDraftInvoiceFormData())
    );

    expect(admin._seenTables).toContain("internal_invoices");
    expect(admin._seenTables).toContain("internal_invoice_line_items");
    expect(admin._seenTables).toContain("jobs");
    expect(admin._seenTables).toContain("maintenance_agreement_visits");
    expect(admin._seenTables).not.toContain("internal_invoice_payments");
    expect(admin._seenTables).not.toContain("internal_invoice_payment_allocations");
    expect(admin._seenTables).not.toContain("stripe");
  });

  it("maps race-condition unique conflicts to link_conflict banner", async () => {
    createAdminClientMock.mockReturnValue(makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: null })],
      invoices: [makeInvoiceRow({ id: INVOICE_ONE_ID, job_id: JOB_ONE_ID })],
      visitLinks: [{ id: "visit-1", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
      updateError: { code: "23505", message: "duplicate key value violates unique constraint" },
    }));

    const { linkInternalInvoiceToBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    const conflictTarget = await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );

    expect(conflictTarget).toBe(`/customers/${CUSTOMER_ID}?banner=billing_period_invoice_link_conflict`);
  });

  it("does not mutate invoice/payment/allocation rows and uses only billing period updates for link/unlink", async () => {
    const admin = makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: null, billing_period_status: "pending_billing" })],
      invoices: [makeInvoiceRow({ id: INVOICE_ONE_ID, job_id: JOB_ONE_ID })],
      visitLinks: [{ id: "visit-1", account_owner_user_id: OWNER_ID, agreement_id: AGREEMENT_ID, job_id: JOB_ONE_ID }],
      updateReturns: { id: PERIOD_ONE_ID },
    });
    createAdminClientMock.mockReturnValue(admin);

    const {
      linkInternalInvoiceToBillingPeriodFromForm,
      unlinkInternalInvoiceFromBillingPeriodFromForm,
    } = await import("@/lib/maintenance-agreements/billing-period-actions");

    await expectRedirect(() =>
      linkInternalInvoiceToBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildLinkFormData()),
    );

    const unlinkAdmin = makeAdminClient({
      periods: [makeBillingPeriodRow({ id: PERIOD_ONE_ID, internal_invoice_id: INVOICE_ONE_ID, billing_period_status: "invoice_linked" })],
      updateReturns: { id: PERIOD_ONE_ID },
    });
    createAdminClientMock.mockReturnValue(unlinkAdmin);

    await expectRedirect(() =>
      unlinkInternalInvoiceFromBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildUnlinkFormData()),
    );

    expect(admin._seenTables).toContain("internal_invoices");
    expect(admin._seenTables).toContain("maintenance_agreement_visits");
    expect(admin._seenTables).not.toContain("internal_invoice_payments");
    expect(admin._seenTables).not.toContain("internal_invoice_payment_allocations");
    expect(unlinkAdmin._seenTables).not.toContain("internal_invoice_payments");
    expect(unlinkAdmin._seenTables).not.toContain("internal_invoice_payment_allocations");
    expect(admin._deleteMock).not.toHaveBeenCalled();
    expect(unlinkAdmin._deleteMock).not.toHaveBeenCalled();
  });

  it("never touches invoice, payment, allocation, Stripe, or visit mutation tables and never deletes", async () => {
    const admin = makeAdminClient();
    createAdminClientMock.mockReturnValue(admin);

    const { createMaintenanceAgreementBillingPeriodFromForm } = await import("@/lib/maintenance-agreements/billing-period-actions");

    await expectRedirect(() => createMaintenanceAgreementBillingPeriodFromForm(`/customers/${CUSTOMER_ID}`, buildFormData()));

    expect(admin._seenTables).toContain("maintenance_agreements");
    expect(admin._seenTables).toContain("customers");
    expect(admin._seenTables).toContain("maintenance_agreement_billing_periods");
    expect(admin._seenTables).not.toContain("internal_invoices");
    expect(admin._seenTables).not.toContain("internal_invoice_payments");
    expect(admin._seenTables).not.toContain("internal_invoice_payment_allocations");
    expect(admin._seenTables).not.toContain("maintenance_agreement_visits");
    expect(admin._seenTables).not.toContain("jobs");
    expect(admin._deleteMock).not.toHaveBeenCalled();
  });
});