import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const evaluateEccOpsStatusMock = vi.fn();
const evaluateJobOpsStatusMock = vi.fn();
const healStalePaperworkOpsStatusMock = vi.fn();
const revalidatePathMock = vi.fn();
const redirectMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();

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

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) =>
    resolveBillingModeByAccountOwnerIdMock(...args),
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: (...args: unknown[]) => evaluateEccOpsStatusMock(...args),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: (...args: unknown[]) => evaluateJobOpsStatusMock(...args),
  healStalePaperworkOpsStatus: (...args: unknown[]) => healStalePaperworkOpsStatusMock(...args),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: vi.fn(),
}));

type JobSnapshot = {
  id: string;
  status: string;
  job_type: string;
  ops_status: string;
  field_complete: boolean;
  certs_complete: boolean;
  invoice_complete: boolean;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  pending_info_reason: string | null;
  on_hold_reason: string | null;
  follow_up_date: string | null;
  next_action_note: string | null;
  action_required_by: string | null;
};

function makeSupabaseForRelease(before: JobSnapshot, afterOpsStatus: string) {
  let jobsSelectCount = 0;

  return {
    from(table: string) {
      if (table === "jobs") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          single: vi.fn(async () => {
            jobsSelectCount += 1;

            if (jobsSelectCount === 1) {
              return { data: before, error: null };
            }

            return { data: { ops_status: afterOpsStatus }, error: null };
          }),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };

        return query;
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async () => ({ error: null })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function makeSupabaseForOpsUpdate(params: {
  before: Pick<
    JobSnapshot,
    | "ops_status"
    | "pending_info_reason"
    | "on_hold_reason"
    | "follow_up_date"
    | "next_action_note"
    | "action_required_by"
  >;
}) {
  const jobEvents: Record<string, unknown>[] = [];
  const jobUpdates: Record<string, unknown>[] = [];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "internal-user-1" } } })),
    },
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: params.before, error: null })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobUpdates.push(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            jobEvents.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, jobEvents, jobUpdates };
}

function makeSupabaseForReleaseFromForm(before: JobSnapshot, afterOpsStatus: string) {
  const jobEvents: Record<string, unknown>[] = [];
  const jobUpdates: Record<string, unknown>[] = [];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "internal-user-1" } } })),
    },
    from(table: string) {
      if (table === "jobs") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          single: vi.fn(async () => ({ data: before, error: null })),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobUpdates.push(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
        return query;
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            jobEvents.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, jobEvents, jobUpdates, afterOpsStatus };
}

function makeSupabaseForCertPermitBlocker(job: Record<string, unknown>) {
  const jobUpdates: Record<string, unknown>[] = [];
  const jobEvents: Record<string, unknown>[] = [];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "internal-user-1" } } })),
    },
    from(table: string) {
      if (table === "jobs") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          single: vi.fn(async () => ({ data: job, error: null })),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobUpdates.push(payload);
            return query;
          }),
          then: (onFulfilled: (value: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(onFulfilled),
        };
        return query;
      }

      if (table === "ecc_test_runs") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          then: (onFulfilled: (value: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve({
              data: [
                {
                  is_completed: true,
                  computed_pass: true,
                  override_pass: null,
                },
              ],
              error: null,
            }).then(onFulfilled),
        };
        return query;
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            jobEvents.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, jobUpdates, jobEvents };
}

function makeSupabaseForCertCloseout(params: {
  job: Record<string, unknown>;
  eccRuns?: Array<Record<string, unknown>>;
  internalInvoice?: Record<string, unknown> | null;
  internalInvoiceError?: { message: string } | null;
  recomputedOpsStatus: string;
  certUpdateError?: { message: string } | null;
  jobReadMissingBillingDisposition?: boolean;
}) {
  const jobUpdates: Record<string, unknown>[] = [];
  const jobEvents: Record<string, unknown>[] = [];
  let jobsSingleCount = 0;

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "internal-user-1" } } })),
    },
    from(table: string) {
      if (table === "jobs") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobUpdates.push(payload);
            query.__lastUpdatePayload = payload;
            return query;
          }),
          single: vi.fn(async () => {
            jobsSingleCount += 1;

            if (params.jobReadMissingBillingDisposition) {
              if (jobsSingleCount === 1) {
                return {
                  data: null,
                  error: {
                    code: "42703",
                    message: "column jobs.billing_disposition does not exist",
                  },
                };
              }
              if (jobsSingleCount === 2) {
                return { data: params.job, error: null };
              }
              return { data: { ops_status: params.recomputedOpsStatus }, error: null };
            }

            if (jobsSingleCount === 1) {
              return { data: params.job, error: null };
            }
            return { data: { ops_status: params.recomputedOpsStatus }, error: null };
          }),
          maybeSingle: vi.fn(async () => {
            if (params.certUpdateError) {
              return { data: null, error: params.certUpdateError };
            }

            return {
              data: {
                id: params.job.id,
                certs_complete: true,
                invoice_complete: Boolean(
                  (query.__lastUpdatePayload ?? {}).invoice_complete ??
                    params.job.invoice_complete,
                ),
              },
              error: null,
            };
          }),
        };

        return query;
      }

      if (table === "ecc_test_runs") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          then: (onFulfilled: (value: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve({
              data: params.eccRuns ?? [
                {
                  is_completed: true,
                  computed_pass: true,
                  override_pass: null,
                },
              ],
              error: null,
            }).then(onFulfilled),
        };
        return query;
      }

      if (table === "internal_invoices") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          neq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: params.internalInvoiceError ? null : params.internalInvoice ?? null,
            error: params.internalInvoiceError ?? null,
          })),
        };
        return query;
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            jobEvents.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, jobEvents, jobUpdates };
}

describe("releaseAndReevaluate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
    evaluateJobOpsStatusMock.mockResolvedValue(undefined);
    healStalePaperworkOpsStatusMock.mockResolvedValue(true);
    revalidatePathMock.mockReturnValue(undefined);
    redirectMock.mockReturnValue(undefined);
    requireInternalUserMock.mockResolvedValue({
      userId: "internal-user-1",
      internalUser: {
        user_id: "internal-user-1",
        account_owner_user_id: "owner-1",
        role: "office",
        is_active: true,
      },
    });
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue("external_billing");
  });

  it("heals fully complete ECC jobs to closed after release reevaluation", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseForRelease(
        {
          id: "job-1",
          status: "completed",
          job_type: "ecc",
          ops_status: "paperwork_required",
          field_complete: true,
          certs_complete: true,
          invoice_complete: true,
          scheduled_date: "2026-04-10",
          window_start: "08:00",
          window_end: "10:00",
          pending_info_reason: null,
          on_hold_reason: null,
          follow_up_date: null,
          next_action_note: null,
          action_required_by: null,
        },
        "closed",
      ),
    );

    const { releaseAndReevaluate } = await import("@/lib/actions/job-ops-actions");
    const nextOps = await releaseAndReevaluate("job-1", "unit_test");

    expect(evaluateEccOpsStatusMock).toHaveBeenCalledWith("job-1");
    expect(healStalePaperworkOpsStatusMock).toHaveBeenCalledWith("job-1");
    expect(healStalePaperworkOpsStatusMock).toHaveBeenCalledTimes(1);
    expect(nextOps).toBe("closed");
  });

  it("writes normalized ops blocker metadata for updateJobOpsFromForm", async () => {
    const { supabase, jobEvents } = makeSupabaseForOpsUpdate({
      before: {
        ops_status: "scheduled",
        pending_info_reason: null,
        on_hold_reason: null,
        follow_up_date: null,
        next_action_note: null,
        action_required_by: null,
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("interrupt_state", "pending_info");
    formData.set("status_reason", "Need permit confirmation");

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");
    await updateJobOpsFromForm(formData);

    expect(jobEvents).toHaveLength(1);
    expect(jobEvents[0]).toEqual(
      expect.objectContaining({
        event_type: "ops_update",
        user_id: "internal-user-1",
        meta: expect.objectContaining({
          timeline_v: 1,
          event_family: "ops_blocker",
          actor_user_id: "internal-user-1",
          source_action: "updateJobOpsFromForm",
          previous: { ops_status: "scheduled" },
          next: { ops_status: "pending_info" },
          reason: "Need permit confirmation",
          blocker_context: expect.objectContaining({
            pending_reason: "Need permit confirmation",
            hold_reason: null,
          }),
        }),
      }),
    );
  });

  it("writes normalized ops blocker metadata for releaseAndReevaluateFromForm", async () => {
    const before: JobSnapshot = {
      id: "job-1",
      status: "open",
      job_type: "service",
      ops_status: "on_hold",
      field_complete: false,
      certs_complete: false,
      invoice_complete: false,
      scheduled_date: "2026-04-10",
      window_start: "08:00",
      window_end: "10:00",
      pending_info_reason: null,
      on_hold_reason: "Missing parts",
      follow_up_date: null,
      next_action_note: null,
      action_required_by: null,
    };

    const { supabase, jobEvents } = makeSupabaseForReleaseFromForm(before, "scheduled");
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");

    const { releaseAndReevaluateFromForm } = await import("@/lib/actions/job-ops-actions");
    await releaseAndReevaluateFromForm(formData);

    expect(jobEvents).toHaveLength(1);
    expect(jobEvents[0]).toEqual(
      expect.objectContaining({
        event_type: "ops_update",
        user_id: "internal-user-1",
        meta: expect.objectContaining({
          timeline_v: 1,
          event_family: "ops_blocker",
          actor_user_id: "internal-user-1",
          source_action: "releaseAndReevaluateFromForm",
          previous: { ops_status: "on_hold" },
          next: { ops_status: "scheduled" },
        }),
      }),
    );
  });

  it("blocks ECC cert closeout with Permit Needed instead of marking certs complete when permit is blank", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForCertPermitBlocker({
      id: "job-1",
      status: "completed",
      job_type: "ecc",
      field_complete: true,
      certs_complete: false,
      invoice_complete: false,
      ops_status: "paperwork_required",
      pending_info_reason: null,
      permit_number: null,
      scheduled_date: "2026-04-10",
      window_start: "08:00",
      window_end: "10:00",
      data_entry_completed_at: null,
      service_case_id: null,
    });
    createClientMock.mockResolvedValue(supabase);
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("return_to", "/jobs/job-1?tab=ops#closeout-actions");

    const { markCertsCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markCertsCompleteFromForm(formData)).rejects.toThrow("banner=permit_needed");
    expect(jobUpdates).toEqual([
      {
        ops_status: "pending_info",
        pending_info_reason: "Permit Needed",
      },
    ]);
    expect(jobEvents).toEqual([
      expect.objectContaining({
        event_type: "ops_update",
        message: "Permit number needed",
        meta: expect.objectContaining({
          event_family: "ecc_permit",
          source_action: "markCertsCompleteFromForm",
        }),
      }),
    ]);
    expect(jobUpdates).not.toContainEqual({ certs_complete: true });
  });

  it("blocks ECC cert closeout when permit number is a placeholder", async () => {
    const { supabase, jobUpdates } = makeSupabaseForCertPermitBlocker({
      id: "job-1",
      status: "completed",
      job_type: "ecc",
      field_complete: true,
      certs_complete: false,
      invoice_complete: false,
      ops_status: "paperwork_required",
      pending_info_reason: null,
      permit_number: "PENDING",
      scheduled_date: "2026-04-10",
      window_start: "08:00",
      window_end: "10:00",
      data_entry_completed_at: null,
      service_case_id: null,
    });
    createClientMock.mockResolvedValue(supabase);
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("return_to", "/jobs/job-1?tab=ops#closeout-actions");

    const { markCertsCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markCertsCompleteFromForm(formData)).rejects.toThrow("banner=permit_needed");
    expect(jobUpdates).toEqual([
      {
        ops_status: "pending_info",
        pending_info_reason: "Permit Needed",
      },
    ]);
    expect(jobUpdates).not.toContainEqual({ certs_complete: true });
  });

  it("blocks ECC cert closeout with missing permit even when ops status already drifted closed", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForCertCloseout({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        field_complete: true,
        certs_complete: false,
        invoice_complete: true,
        billing_disposition: null,
        ops_status: "closed",
        pending_info_reason: null,
        permit_number: null,
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
        data_entry_completed_at: null,
        service_case_id: null,
      },
      internalInvoice: {
        status: "issued",
        invoice_number: "INV-100",
        issued_at: "2026-06-01T12:00:00.000Z",
      },
      recomputedOpsStatus: "closed",
    });
    createClientMock.mockResolvedValue(supabase);
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValueOnce("internal_invoicing");
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("return_to", "/jobs/job-1/tests?focus=completion_report");

    const { markCertsCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markCertsCompleteFromForm(formData)).rejects.toThrow("banner=permit_needed");
    expect(jobUpdates).toEqual([
      {
        ops_status: "pending_info",
        pending_info_reason: "Permit Needed",
      },
    ]);
    expect(jobUpdates).not.toContainEqual({ certs_complete: true });
    expect(jobEvents).toEqual([
      {
        job_id: "job-1",
        user_id: "internal-user-1",
        event_type: "ops_update",
        message: "Permit number needed",
        meta: {
          timeline_v: 2,
          event_family: "ecc_permit",
          source_action: "markCertsCompleteFromForm",
          changes: [
            { field: "ops_status", from: "closed", to: "pending_info" },
            { field: "pending_info_reason", from: null, to: "Permit Needed" },
          ],
        },
      },
    ]);
  });

  it("marks ECC certs sent and closes out when existing internal invoice truth is satisfied", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForCertCloseout({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        billing_disposition: null,
        ops_status: "paperwork_required",
        pending_info_reason: null,
        permit_number: "PERMIT-123",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
        data_entry_completed_at: null,
        service_case_id: null,
      },
      internalInvoice: {
        status: "issued",
        invoice_number: "INV-100",
        issued_at: "2026-06-01T12:00:00.000Z",
      },
      recomputedOpsStatus: "closed",
    });
    createClientMock.mockResolvedValue(supabase);
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValueOnce("internal_invoicing");
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("return_to", "/jobs/job-1?tab=ops#field-status-actions");

    const { markCertsCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markCertsCompleteFromForm(formData)).rejects.toThrow("banner=certs_closeout_closed");

    expect(jobUpdates).toContainEqual({ certs_complete: true, invoice_complete: true });
    expect(jobUpdates).toContainEqual({ ops_status: "closed" });
    expect(evaluateJobOpsStatusMock).not.toHaveBeenCalled();
    expect(healStalePaperworkOpsStatusMock).not.toHaveBeenCalled();
    expect(jobEvents).toEqual([
      expect.objectContaining({
        event_type: "ops_update",
        message: "Certs marked complete",
        meta: expect.objectContaining({
          changes: expect.arrayContaining([
            { field: "certs_complete", from: false, to: true },
            { field: "invoice_complete", from: false, to: true, source: "billing_truth_projection" },
            { field: "ops_status", from: "paperwork_required", to: "closed" },
          ]),
        }),
      }),
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/closeout-queue");
    expect(revalidatePathMock).toHaveBeenCalledWith("/reports/closeout");
  });

  it("falls back when jobs.billing_disposition is unavailable and still resolves cert closeout", async () => {
    const { supabase, jobUpdates } = makeSupabaseForCertCloseout({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        ops_status: "paperwork_required",
        pending_info_reason: null,
        permit_number: "PERMIT-123",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
        data_entry_completed_at: null,
        service_case_id: null,
      },
      internalInvoice: {
        status: "issued",
        invoice_number: "INV-100",
        issued_at: "2026-06-01T12:00:00.000Z",
      },
      recomputedOpsStatus: "closed",
      jobReadMissingBillingDisposition: true,
    });
    createClientMock.mockResolvedValue(supabase);
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValueOnce("internal_invoicing");
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("return_to", "/jobs/job-1?tab=ops#field-status-actions");

    const { markCertsCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markCertsCompleteFromForm(formData)).rejects.toThrow("banner=certs_closeout_closed");
    expect(jobUpdates).toContainEqual({ certs_complete: true, invoice_complete: true });
    expect(jobUpdates).toContainEqual({ ops_status: "closed" });
  });

  it("marks certs sent but keeps a billing blocker visible when billing truth remains pending", async () => {
    const { supabase, jobUpdates } = makeSupabaseForCertCloseout({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        billing_disposition: null,
        ops_status: "paperwork_required",
        pending_info_reason: null,
        permit_number: "PERMIT-123",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
        data_entry_completed_at: null,
        service_case_id: null,
      },
      internalInvoice: {
        status: "draft",
        invoice_number: "INV-100",
        issued_at: null,
      },
      recomputedOpsStatus: "invoice_required",
    });
    createClientMock.mockResolvedValue(supabase);
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValueOnce("internal_invoicing");
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("return_to", "/jobs/job-1?tab=ops#field-status-actions");

    const { markCertsCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markCertsCompleteFromForm(formData)).rejects.toThrow("banner=certs_closeout_saved");

    expect(jobUpdates).toContainEqual({ certs_complete: true });
    expect(jobUpdates).toContainEqual({ ops_status: "invoice_required" });
    expect(jobUpdates).not.toContainEqual({ certs_complete: true, invoice_complete: true });
    expect(evaluateJobOpsStatusMock).not.toHaveBeenCalled();
    expect(healStalePaperworkOpsStatusMock).not.toHaveBeenCalled();
  });

  it("redirects with an actionable banner when billing truth read fails", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForCertCloseout({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        billing_disposition: null,
        ops_status: "paperwork_required",
        pending_info_reason: null,
        permit_number: "PERMIT-123",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
        data_entry_completed_at: null,
        service_case_id: null,
      },
      internalInvoiceError: { message: "invoice lookup timed out" },
      recomputedOpsStatus: "paperwork_required",
    });
    createClientMock.mockResolvedValue(supabase);
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValueOnce("internal_invoicing");
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("return_to", "/jobs/job-1?tab=ops#field-status-actions");

    const { markCertsCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markCertsCompleteFromForm(formData)).rejects.toThrow("banner=certs_closeout_failed");

    expect(jobUpdates).toEqual([]);
    expect(jobEvents).toEqual([]);
    expect(evaluateJobOpsStatusMock).not.toHaveBeenCalled();
    expect(healStalePaperworkOpsStatusMock).not.toHaveBeenCalled();
  });

  it("redirects with an actionable banner when cert closeout persistence fails", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForCertCloseout({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        field_complete: true,
        certs_complete: false,
        invoice_complete: true,
        billing_disposition: null,
        ops_status: "paperwork_required",
        pending_info_reason: null,
        permit_number: "PERMIT-123",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
        data_entry_completed_at: null,
        service_case_id: null,
      },
      recomputedOpsStatus: "paperwork_required",
      certUpdateError: { message: "write failed" },
    });
    createClientMock.mockResolvedValue(supabase);
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("return_to", "/jobs/job-1?tab=ops#field-status-actions");

    const { markCertsCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markCertsCompleteFromForm(formData)).rejects.toThrow("banner=certs_closeout_failed");

    expect(jobUpdates).toEqual([{ certs_complete: true }]);
    expect(jobEvents).toEqual([]);
  });
});
