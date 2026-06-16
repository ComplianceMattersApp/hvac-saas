import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const setOpsStatusIfNotManualMock = vi.fn();
const reconcileServiceCaseStatusAfterJobChangeMock = vi.fn();
const revalidatePathMock = vi.fn();
const autoCountMaintenanceAgreementVisitsForCompletedServiceJobMock = vi.fn();
const expireStoredOpenTenantInvoiceCheckoutSessionsForInvoiceMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) =>
    resolveBillingModeByAccountOwnerIdMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/business/internal-invoice-payments", () => ({
  expireStoredOpenTenantInvoiceCheckoutSessionsForInvoice: (...args: unknown[]) =>
    expireStoredOpenTenantInvoiceCheckoutSessionsForInvoiceMock(...args),
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

vi.mock("@/lib/maintenance-agreements/agreement-actions", () => ({
  autoCountMaintenanceAgreementVisitsForCompletedServiceJob: (...args: unknown[]) =>
    autoCountMaintenanceAgreementVisitsForCompletedServiceJobMock(...args),
}));

type FixtureConfig = {
  updatedDataEntryCompletedAt?: string;
  jobEventInsertError?: Error;
};

function makeServiceCloseoutSupabaseFixture(config: FixtureConfig = {}) {
  const jobUpdates: Array<Record<string, unknown>> = [];
  const jobEvents: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            jobUpdates.push(payload);
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "job-1",
                      invoice_complete: true,
                      data_entry_completed_at:
                        config.updatedDataEntryCompletedAt ?? "2026-05-22T10:30:00.000Z",
                      billing_disposition: payload.billing_disposition,
                      billing_disposition_at: payload.billing_disposition_at,
                      billing_disposition_by_user_id:
                        payload.billing_disposition_by_user_id,
                    },
                    error: null,
                  })),
                })),
              })),
            };
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            jobEvents.push(payload);
            return { error: config.jobEventInsertError ?? null };
          }),
        };
      }

      if (table === "internal_invoices") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
        };
        query.eq
          .mockReturnValueOnce(query)
          .mockImplementationOnce(async () => ({
            data: [{ id: "inv-1" }],
            error: null,
          }));
        return query;
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, jobUpdates, jobEvents };
}

describe("markInvoiceSent - canonical external billing completion contract", () => {
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

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });

    setOpsStatusIfNotManualMock.mockResolvedValue({
      updated: true,
      manualLockPrevented: false,
    });

    reconcileServiceCaseStatusAfterJobChangeMock.mockResolvedValue(undefined);
    expireStoredOpenTenantInvoiceCheckoutSessionsForInvoiceMock.mockResolvedValue({
      attempted: 0,
      expired: 0,
      skipped: 0,
    });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue("external_billing");
    autoCountMaintenanceAgreementVisitsForCompletedServiceJobMock.mockResolvedValue({
      evaluatedLinks: 1,
      eligibleLinks: 1,
      countedLinks: 1,
      alreadyCountedLinks: 0,
      skippedLinks: 0,
    });
  });

  it("triggers maintenance visit auto-count after successful service completion", async () => {
    const fixture = makeServiceCloseoutSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: "scheduled",
      status: "in_process",
      field_complete: false,
      service_case_id: "case-1",
      service_visit_outcome: null,
    });

    const { markServiceComplete } = await import("@/lib/actions/service-actions");

    await expect(markServiceComplete("job-1")).rejects.toThrow("banner=service_closeout_saved");

    expect(fixture.jobUpdates).toHaveLength(1);
    expect(fixture.jobUpdates[0]).toEqual(
      expect.objectContaining({
        status: "completed",
        field_complete: true,
        ops_status: "invoice_required",
      }),
    );
    expect(fixture.jobUpdates[0]).not.toHaveProperty("invoice_complete");

    expect(autoCountMaintenanceAgreementVisitsForCompletedServiceJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: fixture.supabase,
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        actingUserId: "internal-user-1",
      }),
    );
  });

  it("still redirects after service completion when event logging fails", async () => {
    const fixture = makeServiceCloseoutSupabaseFixture({
      jobEventInsertError: new Error("timeline insert failed"),
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: "scheduled",
      status: "in_process",
      field_complete: false,
      service_case_id: "case-1",
      service_visit_outcome: null,
    });

    const { markServiceComplete } = await import("@/lib/actions/service-actions");

    await expect(markServiceComplete("job-1")).rejects.toThrow("banner=service_closeout_saved");

    expect(fixture.jobUpdates).toHaveLength(1);
    expect(fixture.jobUpdates[0]).toEqual(
      expect.objectContaining({
        status: "completed",
        field_complete: true,
        ops_status: "invoice_required",
      }),
    );
  });

  it("still redirects after service completion when service-case reconciliation fails", async () => {
    const fixture = makeServiceCloseoutSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    reconcileServiceCaseStatusAfterJobChangeMock.mockRejectedValueOnce(
      new Error("reconciliation failed"),
    );
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: "scheduled",
      status: "in_process",
      field_complete: false,
      service_case_id: "case-1",
      service_visit_outcome: null,
    });

    const { markServiceComplete } = await import("@/lib/actions/service-actions");

    await expect(markServiceComplete("job-1")).rejects.toThrow("banner=service_closeout_saved");

    expect(fixture.jobUpdates).toHaveLength(1);
    expect(fixture.jobEvents.length).toBeGreaterThan(0);
  });

  it("marks external billing complete, keeps closeout projection flow, and logs canonical event copy", async () => {
    const fixture = makeServiceCloseoutSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: "invoice_required",
      invoice_complete: false,
      data_entry_completed_at: null,
      service_case_id: "case-1",
    });

    const { markInvoiceSent } = await import("@/lib/actions/service-actions");

    await expect(
      markInvoiceSent("job-1", "/jobs/job-1?tab=ops#service-closeout"),
    ).rejects.toThrow("banner=service_closeout_saved");

    expect(
      fixture.jobUpdates.some((row) => row.invoice_complete === true),
    ).toBe(true);
    expect(
      fixture.jobUpdates.some((row) => row.billing_disposition === "externally_billed"),
    ).toBe(true);
    expect(
      fixture.jobUpdates.some((row) => Object.prototype.hasOwnProperty.call(row, "data_entry_completed_at")),
    ).toBe(true);
    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledWith("job-1", "closed");
    expect(expireStoredOpenTenantInvoiceCheckoutSessionsForInvoiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        invoiceId: "inv-1",
      }),
    );

    expect(fixture.jobEvents).toHaveLength(1);
    expect(fixture.jobEvents[0]).toEqual(
      expect.objectContaining({
        event_type: "ops_update",
        message: "External billing marked complete",
      }),
    );

    expect(revalidatePathMock).toHaveBeenCalledWith("/jobs/job-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops");
  });

  it("blocks external completion when internal invoicing is enabled", async () => {
    const fixture = makeServiceCloseoutSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: "invoice_required",
      invoice_complete: false,
      data_entry_completed_at: null,
      service_case_id: "case-1",
    });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValueOnce("internal_invoicing");

    const { markInvoiceSent } = await import("@/lib/actions/service-actions");

    await expect(markInvoiceSent("job-1")).rejects.toThrow(
      "banner=internal_invoicing_billing_pending",
    );

    expect(fixture.jobUpdates).toHaveLength(0);
    expect(fixture.jobEvents).toHaveLength(0);
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
  });
});
