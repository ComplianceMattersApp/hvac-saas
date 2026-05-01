import { describe, expect, it, vi, beforeEach } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const setOpsStatusIfNotManualMock = vi.fn();
const reconcileServiceCaseStatusAfterJobChangeMock = vi.fn();
const resolveInternalInvoiceByJobIdMock = vi.fn();
const insertJobEventMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: () => false,
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) =>
    resolveBillingModeByAccountOwnerIdMock(...args),
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(async () => ({
    display_name: "Compliance Matters",
    support_email: null,
    support_phone: null,
  })),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  setOpsStatusIfNotManual: (...args: unknown[]) => setOpsStatusIfNotManualMock(...args),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/actions/service-case-reconciliation", () => ({
  reconcileServiceCaseStatusAfterJobChange: (...args: unknown[]) =>
    reconcileServiceCaseStatusAfterJobChangeMock(...args),
}));

vi.mock("@/lib/business/internal-invoice", () => ({
  normalizeInternalInvoiceItemType: vi.fn(() => "service"),
  resolveInternalInvoiceByJobId: (...args: unknown[]) => resolveInternalInvoiceByJobIdMock(...args),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: vi.fn(async () => undefined),
  healStalePaperworkOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/job-actions", () => ({
  insertJobEvent: (...args: unknown[]) => insertJobEventMock(...args),
}));

vi.mock("@/lib/notifications/account-owner", () => ({
  resolveNotificationAccountOwnerUserId: vi.fn(async () => "owner-1"),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: vi.fn(async () => ({
    authorized: true,
    reason: "allowed_active",
  })),
}));

function makeServiceActionsSupabaseMock() {
  return {
    from(table: string) {
      if (table === "jobs") {
        return {
          update: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "job-1",
                    invoice_complete: true,
                    data_entry_completed_at: "2026-04-30T12:00:00Z",
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: async () => ({ error: null }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function makeInternalInvoiceSupabaseMock() {
  let jobsSelectCount = 0;

  return {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => {
                jobsSelectCount += 1;
                if (jobsSelectCount === 1) {
                  return {
                    data: {
                      id: "job-1",
                      title: "Service Visit",
                      job_type: "service",
                      status: "completed",
                      field_complete: true,
                      ops_status: "invoice_required",
                      invoice_complete: false,
                      invoice_number: null,
                      customer_id: "customer-1",
                      contractor_id: "contractor-1",
                      location_id: "location-1",
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
              },
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }

      if (table === "internal_invoices") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe("service-case reconciliation wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: "internal-user-1",
      internalUser: {
        user_id: "internal-user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue("external_billing");
    setOpsStatusIfNotManualMock.mockResolvedValue({ updated: true, manualLockPrevented: false });
    reconcileServiceCaseStatusAfterJobChangeMock.mockResolvedValue(undefined);
    insertJobEventMock.mockResolvedValue(undefined);
  });

  it("markInvoiceSent triggers service-case reconciliation for service jobs", async () => {
    createClientMock.mockResolvedValue(makeServiceActionsSupabaseMock());
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: "invoice_required",
      invoice_complete: false,
      data_entry_completed_at: null,
      service_case_id: "case-1",
    });

    const { markInvoiceSent } = await import("@/lib/actions/service-actions");

    await expect(markInvoiceSent("job-1")).rejects.toThrow("REDIRECT:/jobs/job-1?banner=service_closeout_saved");

    expect(reconcileServiceCaseStatusAfterJobChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        serviceCaseId: "case-1",
        triggerJobId: "job-1",
        source: "mark_invoice_sent",
      }),
    );
  });

  it("issueInternalInvoiceFromForm triggers reconciliation after ops recompute when service job closes", async () => {
    createClientMock.mockResolvedValue(makeInternalInvoiceSupabaseMock());
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue("internal_invoicing");
    resolveInternalInvoiceByJobIdMock.mockResolvedValue({
      id: "invoice-1",
      status: "draft",
      billing_name: "Jane Doe",
      total_cents: 5000,
      line_items: [{ id: "line-1" }],
      invoice_number: "INV-1001",
    });

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("tab", "info");

    const { issueInternalInvoiceFromForm } = await import("@/lib/actions/internal-invoice-actions");

    await expect(issueInternalInvoiceFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=info&banner=internal_invoice_issued#internal-invoice-panel",
    );

    expect(reconcileServiceCaseStatusAfterJobChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        serviceCaseId: "case-1",
        triggerJobId: "job-1",
        source: "internal_invoice_issue_recompute",
      }),
    );
  });
});
