import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveInternalInvoiceByJobIdMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const insertJobEventMock = vi.fn();
const evaluateJobOpsStatusMock = vi.fn();
const healStalePaperworkOpsStatusMock = vi.fn();
const reconcileServiceCaseStatusAfterJobChangeMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) =>
    resolveBillingModeByAccountOwnerIdMock(...args),
}));

vi.mock("@/lib/business/internal-invoice", async () => {
  const actual = await vi.importActual<typeof import("@/lib/business/internal-invoice")>(
    "@/lib/business/internal-invoice",
  );
  return {
    ...actual,
    resolveInternalInvoiceByJobId: (...args: unknown[]) =>
      resolveInternalInvoiceByJobIdMock(...args),
    resolveInternalInvoiceById: vi.fn(async () => null),
  };
});

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: (...args: unknown[]) => evaluateJobOpsStatusMock(...args),
  healStalePaperworkOpsStatus: (...args: unknown[]) =>
    healStalePaperworkOpsStatusMock(...args),
}));

vi.mock("@/lib/actions/job-actions", () => ({
  insertJobEvent: (...args: unknown[]) => insertJobEventMock(...args),
}));

vi.mock("@/lib/actions/service-case-reconciliation", () => ({
  reconcileServiceCaseStatusAfterJobChange: (...args: unknown[]) =>
    reconcileServiceCaseStatusAfterJobChangeMock(...args),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/account-owner", () => ({
  resolveNotificationAccountOwnerId: vi.fn(async () => "owner-1"),
  resolveNotificationAccountOwnerUserId: vi.fn(async () => "owner-1"),
}));

function buildFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("tab", "info");
  formData.set("no_redirect", "1");

  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }

  return formData;
}

function draftInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "invoice-1",
    account_owner_user_id: "owner-1",
    job_id: "job-1",
    invoice_number: "INV-1",
    status: "draft",
    total_cents: 0,
    line_items: [],
    ...overrides,
  };
}

function makeSupabaseFixture() {
  const jobUpdates: Array<Record<string, unknown>> = [];
  const forbiddenWrites: Array<{ table: string; payload: unknown }> = [];
  let jobReadCount = 0;

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => {
                jobReadCount += 1;
                if (jobReadCount === 1) {
                  return {
                    data: {
                      id: "job-1",
                      title: "Job 1",
                      job_type: "service",
                      status: "completed",
                      field_complete: true,
                      ops_status: "invoice_required",
                      invoice_complete: false,
                      invoice_number: null,
                      data_entry_completed_at: null,
                      service_case_id: "case-1",
                    },
                    error: null,
                  };
                }

                return {
                  data: {
                    ops_status: "closed",
                    job_type: "service",
                    service_case_id: "case-1",
                  },
                  error: null,
                };
              }),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobUpdates.push(payload);
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "job-1",
                      invoice_complete: true,
                      data_entry_completed_at: payload.data_entry_completed_at,
                    },
                    error: null,
                  })),
                })),
              })),
            };
          }),
        };
      }

      if (table === "internal_user_access_capabilities") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
        };
      }

      if (
        table === "internal_invoice_payments" ||
        table === "internal_invoice_line_items" ||
        table === "internal_invoices"
      ) {
        return {
          insert: vi.fn((payload: unknown) => {
            forbiddenWrites.push({ table, payload });
            return Promise.resolve({ error: null });
          }),
          update: vi.fn((payload: unknown) => {
            forbiddenWrites.push({ table, payload });
            return { eq: vi.fn(async () => ({ error: null })) };
          }),
          delete: vi.fn(() => {
            forbiddenWrites.push({ table, payload: null });
            return { eq: vi.fn(async () => ({ error: null })) };
          }),
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, jobUpdates, forbiddenWrites };
}

describe("internal invoice billing disposition actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: "owner-1",
      internalUser: {
        user_id: "owner-1",
        role: "owner",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue("internal_invoicing");
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
    resolveInternalInvoiceByJobIdMock.mockResolvedValue(draftInvoice());
    evaluateJobOpsStatusMock.mockResolvedValue(undefined);
    healStalePaperworkOpsStatusMock.mockResolvedValue(false);
    reconcileServiceCaseStatusAfterJobChangeMock.mockResolvedValue(undefined);
    insertJobEventMock.mockResolvedValue(undefined);
  });

  it("marks a zero-dollar draft invoice as no charge without fake charges or payments", async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    const { markInternalInvoiceNoChargeFromForm } = await import(
      "@/lib/actions/internal-invoice-actions"
    );

    const result = await markInternalInvoiceNoChargeFromForm(
      buildFormData({ billing_disposition_note: "Warranty courtesy" }),
    );

    expect(result).toEqual({
      ok: true,
      banner: "internal_invoice_no_charge_saved",
      fieldErrors: undefined,
    });
    expect(fixture.jobUpdates).toHaveLength(1);
    expect(fixture.jobUpdates[0]).toEqual(
      expect.objectContaining({
        invoice_complete: true,
        billing_disposition: "no_charge",
        billing_disposition_note: "Warranty courtesy",
        billing_disposition_by_user_id: "owner-1",
      }),
    );
    expect(fixture.forbiddenWrites).toHaveLength(0);
    expect(reconcileServiceCaseStatusAfterJobChangeMock).toHaveBeenCalled();
  });

  it("marks a zero-dollar draft invoice as externally billed without fake charges or payments", async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    const { markInternalInvoiceExternallyBilledFromForm } = await import(
      "@/lib/actions/internal-invoice-actions"
    );

    const result = await markInternalInvoiceExternallyBilledFromForm(buildFormData());

    expect(result).toEqual({
      ok: true,
      banner: "internal_invoice_externally_billed_saved",
      fieldErrors: undefined,
    });
    expect(fixture.jobUpdates[0]).toEqual(
      expect.objectContaining({
        invoice_complete: true,
        billing_disposition: "externally_billed",
        billing_disposition_by_user_id: "owner-1",
      }),
    );
    expect(fixture.forbiddenWrites).toHaveLength(0);
  });

  it("denies billing disposition when the invoice has a positive total", async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(
      draftInvoice({ total_cents: 5000 }),
    );

    const { markInternalInvoiceNoChargeFromForm } = await import(
      "@/lib/actions/internal-invoice-actions"
    );

    const result = await markInternalInvoiceNoChargeFromForm(buildFormData());

    expect(result).toEqual({
      ok: false,
      banner: "internal_invoice_disposition_requires_zero_total",
      fieldErrors: undefined,
    });
    expect(fixture.jobUpdates).toHaveLength(0);
    expect(fixture.forbiddenWrites).toHaveLength(0);
  });

  it("denies unauthorized users before disposition writes", async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: "office-1",
      internalUser: {
        user_id: "office-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const { markInternalInvoiceNoChargeFromForm } = await import(
      "@/lib/actions/internal-invoice-actions"
    );

    await expect(markInternalInvoiceNoChargeFromForm(buildFormData())).rejects.toThrow(
      "banner=not_authorized",
    );
    expect(fixture.jobUpdates).toHaveLength(0);
    expect(fixture.forbiddenWrites).toHaveLength(0);
  });
});
