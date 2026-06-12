import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const revalidatePathMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const resolveOpsStatusMock = vi.fn();
const evaluateJobOpsStatusMock = vi.fn();
const healStalePaperworkOpsStatusMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const reconcileServiceCaseStatusAfterJobChangeMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

vi.mock("@/lib/utils/ops-status", () => ({
  formatWaitingStateReason: vi.fn(),
  getActiveWaitingState: vi.fn(),
  getPendingInfoSignal: vi.fn(),
  getWaitingStateLabel: vi.fn(),
  parseWaitingStateReason: vi.fn(),
  parseWaitingStateType: vi.fn(),
  resolveOpsStatus: (...args: unknown[]) => resolveOpsStatusMock(...args),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: vi.fn(),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: vi.fn(),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: (...args: unknown[]) => evaluateJobOpsStatusMock(...args),
  healStalePaperworkOpsStatus: (...args: unknown[]) =>
    healStalePaperworkOpsStatusMock(...args),
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
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/service-case-reconciliation", () => ({
  reconcileServiceCaseStatusAfterJobChange: (...args: unknown[]) =>
    reconcileServiceCaseStatusAfterJobChangeMock(...args),
}));

type JobsTableMockConfig = {
  initialJob: Record<string, unknown>;
  recomputedOpsStatus: string;
  eccRuns?: Array<Record<string, unknown>>;
};

function makeSupabaseForMarkInvoiceComplete(config: JobsTableMockConfig) {
  const jobUpdates: Array<Record<string, unknown>> = [];
  const jobEventRows: Array<Record<string, unknown>> = [];
  let jobsSingleCount = 0;

  return {
    client: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "jobs") {
          const query: any = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            single: vi.fn(async () => {
              jobsSingleCount += 1;
              if (jobsSingleCount === 1) {
                return { data: config.initialJob, error: null };
              }

              return {
                data: {
                  ops_status: config.recomputedOpsStatus,
                  job_type: config.initialJob.job_type,
                  service_case_id: config.initialJob.service_case_id ?? null,
                },
                error: null,
              };
            }),
            update: vi.fn((payload: Record<string, unknown>) => {
              jobUpdates.push(payload);
              return {
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                    data: {
                      id: config.initialJob.id,
                      invoice_complete: true,
                      data_entry_completed_at:
                        config.initialJob.data_entry_completed_at ??
                        "2026-05-20T12:00:00.000Z",
                      billing_disposition: payload.billing_disposition,
                      billing_disposition_at: payload.billing_disposition_at,
                      billing_disposition_by_user_id:
                        payload.billing_disposition_by_user_id,
                    },
                    error: null,
                  })),
                })),
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: config.initialJob.id,
                    invoice_complete: true,
                    data_entry_completed_at:
                      config.initialJob.data_entry_completed_at ??
                      "2026-05-20T12:00:00.000Z",
                    billing_disposition: payload.billing_disposition,
                    billing_disposition_at: payload.billing_disposition_at,
                    billing_disposition_by_user_id:
                      payload.billing_disposition_by_user_id,
                  },
                  error: null,
                })),
                  then: undefined,
                })),
              };
            }),
          };

          return query;
        }

        if (table === "ecc_test_runs") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: config.eccRuns ?? [], error: null })),
            })),
          };
        }

        if (table === "job_events") {
          return {
            insert: vi.fn(async (payload: Record<string, unknown>) => {
              jobEventRows.push(payload);
              return { error: null };
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    },
    jobUpdates,
    jobEventRows,
  };
}

describe("markInvoiceCompleteFromForm - external billing wording contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue("external_billing");

    resolveOpsStatusMock.mockReturnValue("paperwork_required");
    evaluateJobOpsStatusMock.mockResolvedValue(undefined);
    healStalePaperworkOpsStatusMock.mockResolvedValue(false);
    reconcileServiceCaseStatusAfterJobChangeMock.mockResolvedValue(undefined);
  });

  it("keeps external billing completion on invoice_complete path and preserves remaining paperwork blockers", async () => {
    const fixture = makeSupabaseForMarkInvoiceComplete({
      initialJob: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        ops_status: "paperwork_required",
        scheduled_date: "2026-05-19",
        window_start: "08:00",
        window_end: "10:00",
        data_entry_completed_at: null,
        service_case_id: null,
      },
      recomputedOpsStatus: "paperwork_required",
      eccRuns: [{ is_completed: true, computed_pass: true, override_pass: null }],
    });
    createClientMock.mockResolvedValue(fixture.client);

    const { markInvoiceCompleteFromForm } = await import(
      "@/lib/actions/job-ops-actions"
    );

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("return_to", "/ops/closeout-queue#job-job-1");
    formData.set("success_notice", "external_billing_complete");

    await expect(markInvoiceCompleteFromForm(formData)).rejects.toThrow(
      "notice=external_billing_complete",
    );

    expect(
      fixture.jobUpdates.some((row) => row.invoice_complete === true),
    ).toBe(true);
    expect(
      fixture.jobUpdates.some((row) => row.billing_disposition === "externally_billed"),
    ).toBe(true);
    expect(
      fixture.jobUpdates.some((row) => row.ops_status === "paperwork_required"),
    ).toBe(true);
    expect(
      fixture.jobUpdates.some((row) => Object.prototype.hasOwnProperty.call(row, "certs_complete")),
    ).toBe(false);

    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/closeout-queue");
    expect(resolveOpsStatusMock).toHaveBeenCalled();
  });

  it("blocks the external completion path when internal invoicing is enabled", async () => {
    const fixture = makeSupabaseForMarkInvoiceComplete({
      initialJob: {
        id: "job-1",
        status: "completed",
        job_type: "service",
        field_complete: true,
        certs_complete: true,
        invoice_complete: false,
        ops_status: "invoice_required",
        scheduled_date: "2026-05-19",
        window_start: "08:00",
        window_end: "10:00",
        data_entry_completed_at: null,
        service_case_id: "case-1",
      },
      recomputedOpsStatus: "invoice_required",
    });
    createClientMock.mockResolvedValue(fixture.client);
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValueOnce(
      "internal_invoicing",
    );

    const { markInvoiceCompleteFromForm } = await import(
      "@/lib/actions/job-ops-actions"
    );

    const formData = new FormData();
    formData.set("job_id", "job-1");

    await expect(markInvoiceCompleteFromForm(formData)).rejects.toThrow(
      "banner=internal_invoicing_billing_pending",
    );

    expect(fixture.jobUpdates).toHaveLength(0);
  });
});
