import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();
const reconcileServiceCaseStatusAfterJobChangeMock = vi.fn(async (_args: unknown) => undefined);

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
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

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: vi.fn(),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: vi.fn(async () => undefined),
  healStalePaperworkOpsStatus: vi.fn(async () => true),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  insertInternalNotificationForEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: vi.fn(async () => "external_billing"),
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(async () => ({
    display_name: "Compliance Matters",
    support_phone: null,
    support_email: null,
  })),
}));

vi.mock("@/lib/email/layout", () => ({
  resolveAppUrl: vi.fn(() => "http://localhost:3000"),
  renderOperationalEmailLayout: vi.fn(() => "<html></html>"),
  renderSystemEmailLayout: vi.fn(() => "<html></html>"),
  escapeHtml: vi.fn((value: string) => value),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(({ from, to, trigger, sourceAction }: Record<string, unknown>) => ({
    from,
    to,
    trigger,
    sourceAction,
  })),
}));

vi.mock("@/lib/actions/external-billing-completion", () => ({
  applyExternalBillingCompletionMutation: vi.fn(),
}));

vi.mock("@/lib/actions/service-case-reconciliation", () => ({
  reconcileServiceCaseStatusAfterJobChange: (args: unknown) =>
    reconcileServiceCaseStatusAfterJobChangeMock(args),
}));

vi.mock("@/lib/portal/resolveContractorIssues", () => ({
  extractFailureDetails: vi.fn(() => []),
  extractFailureReasons: vi.fn(() => []),
  finalRunPass: vi.fn(() => true),
}));

type PartsNeededJob = {
  id: string;
  status: string;
  job_type?: string;
  service_visit_type?: string | null;
  ops_status: string | null;
  field_complete: boolean;
  field_complete_at: string | null;
  pending_info_reason: string | null;
  on_hold_reason: string | null;
  next_action_note?: string | null;
  service_case_id?: string | null;
};

function buildPartsNeededFormData(note: string) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("current_status", "in_process");
  formData.set("tab", "info");
  formData.set("parts_note", note);
  return formData;
}

function buildApprovalNeededFormData(note: string) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("current_status", "in_process");
  formData.set("tab", "info");
  formData.set("approval_note", note);
  return formData;
}

function buildUnableToCompleteFormData(note: string) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("current_status", "in_process");
  formData.set("tab", "info");
  formData.set("unable_note", note);
  return formData;
}

function buildDifferentIssueFoundFormData(note: string) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("current_status", "in_process");
  formData.set("tab", "info");
  formData.set("different_issue_note", note);
  return formData;
}

function makeSupabaseForPartsNeeded(beforeJob: PartsNeededJob) {
  const jobUpdates: Record<string, unknown>[] = [];
  const jobEvents: Record<string, unknown>[] = [];
  const jobUpdateEqFilters: Array<[string, unknown]> = [];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "internal-user-1" } },
        error: null,
      })),
    },
    from(table: string) {
      if (table === "jobs") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          single: vi.fn(async () => ({ data: beforeJob, error: null })),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobUpdates.push(payload);
            const updateQuery: any = {
              eq: vi.fn((column: string, value: unknown) => {
                jobUpdateEqFilters.push([column, value]);
                return updateQuery;
              }),
              select: vi.fn(() => updateQuery),
              single: vi.fn(async () => ({
                data: {
                  ...beforeJob,
                  ...payload,
                },
                error: null,
              })),
            };
            return updateQuery;
          }),
        };
        return query;
      }

      if (table === "job_assignments") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: { id: "assignment-1" }, error: null })),
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

  return { supabase, jobUpdates, jobUpdateEqFilters, jobEvents };
}

describe("markJobPartsNeededFromForm", () => {
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
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("marks in-process visit complete and routes materials-needed to held follow-up", async () => {
    const { supabase, jobUpdates, jobUpdateEqFilters, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
      service_case_id: "case-1",
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobPartsNeededFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobPartsNeededFromForm(buildPartsNeededFormData("Need condenser fan motor")),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=info&banner=parts_needed_saved#field-outcome");

    expect(jobUpdates).toHaveLength(1);
    expect(jobUpdates[0]).toEqual(
      expect.objectContaining({
        status: "completed",
        field_complete: true,
        ops_status: "pending_info",
        pending_info_reason: "Materials Needed: Need condenser fan motor",
        on_hold_reason: null,
      }),
    );
    expect(jobUpdateEqFilters).toEqual([
      ["id", "job-1"],
      ["account_owner_user_id", "owner-1"],
    ]);

    expect(jobEvents).toHaveLength(2);
    expect(jobEvents[0]).toEqual(
      expect.objectContaining({
        event_type: "job_completed",
        user_id: "internal-user-1",
      }),
    );
    expect(jobEvents[1]).toEqual(
      expect.objectContaining({
        event_type: "ops_update",
        user_id: "internal-user-1",
        meta: expect.objectContaining({
          event_family: "ops_blocker",
          blocker_type: "materials_needed",
          blocker_reason: "Need condenser fan motor",
          source_action: "markJobPartsNeededFromForm",
          next: expect.objectContaining({
            ops_status: "pending_info",
            pending_info_reason: "Materials Needed: Need condenser fan motor",
          }),
        }),
      }),
    );
    expect(reconcileServiceCaseStatusAfterJobChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceCaseId: "case-1",
        triggerJobId: "job-1",
        source: "field_held_follow_up",
      }),
    );
  });

  it("rejects parts-needed transition when job is already field complete", async () => {
    const { supabase, jobUpdates, jobUpdateEqFilters, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      ops_status: "pending_info",
      field_complete: true,
      field_complete_at: "2026-06-04T01:02:03.000Z",
      pending_info_reason: "Materials Needed: Existing blocker",
      on_hold_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobPartsNeededFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobPartsNeededFromForm(buildPartsNeededFormData("Need pressure switch")),
    ).rejects.toThrow("banner=parts_needed_already_completed");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });

  it("rejects parts-needed transition when job is not in_process", async () => {
    const { supabase, jobUpdates, jobUpdateEqFilters, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "open",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobPartsNeededFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobPartsNeededFromForm(buildPartsNeededFormData("Need TXV kit")),
    ).rejects.toThrow("banner=parts_needed_invalid_status");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });

  it("requires a short parts note", async () => {
    const { supabase, jobUpdates, jobUpdateEqFilters, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobPartsNeededFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobPartsNeededFromForm(buildPartsNeededFormData("   ")),
    ).rejects.toThrow("banner=parts_needed_note_required");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });
});

describe("markJobApprovalNeededFromForm", () => {
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
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("marks in-process visit complete and routes approval-needed to held follow-up", async () => {
    const { supabase, jobUpdates, jobUpdateEqFilters, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobApprovalNeededFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobApprovalNeededFromForm(
        buildApprovalNeededFormData("Customer approval required before proceeding"),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=info&banner=approval_needed_saved#field-outcome");

    expect(jobUpdates).toHaveLength(1);
    expect(jobUpdates[0]).toEqual(
      expect.objectContaining({
        status: "completed",
        field_complete: true,
        ops_status: "pending_info",
        pending_info_reason: "Approval Needed: Customer approval required before proceeding",
        on_hold_reason: null,
      }),
    );
    expect(jobUpdateEqFilters).toEqual([
      ["id", "job-1"],
      ["account_owner_user_id", "owner-1"],
    ]);

    expect(jobEvents).toHaveLength(2);
    expect(jobEvents[0]).toEqual(
      expect.objectContaining({
        event_type: "job_completed",
        user_id: "internal-user-1",
      }),
    );
    expect(jobEvents[1]).toEqual(
      expect.objectContaining({
        event_type: "ops_update",
        user_id: "internal-user-1",
        meta: expect.objectContaining({
          event_family: "ops_blocker",
          blocker_type: "approval_needed",
          blocker_reason: "Customer approval required before proceeding",
          source_action: "markJobApprovalNeededFromForm",
          next: expect.objectContaining({
            ops_status: "pending_info",
            pending_info_reason: "Approval Needed: Customer approval required before proceeding",
          }),
        }),
      }),
    );
  });

  it("rejects approval-needed transition when job is already field complete", async () => {
    const { supabase, jobUpdates, jobUpdateEqFilters, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      ops_status: "pending_info",
      field_complete: true,
      field_complete_at: "2026-06-04T01:02:03.000Z",
      pending_info_reason: "Approval Needed: Existing blocker",
      on_hold_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobApprovalNeededFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobApprovalNeededFromForm(buildApprovalNeededFormData("Owner approval needed")),
    ).rejects.toThrow("banner=approval_needed_already_completed");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });

  it("rejects approval-needed transition when job is not in_process", async () => {
    const { supabase, jobUpdates, jobUpdateEqFilters, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "open",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobApprovalNeededFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobApprovalNeededFromForm(buildApprovalNeededFormData("Customer approval pending")),
    ).rejects.toThrow("banner=approval_needed_invalid_status");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });

  it("requires a short approval note", async () => {
    const { supabase, jobUpdates, jobUpdateEqFilters, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobApprovalNeededFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobApprovalNeededFromForm(buildApprovalNeededFormData("   ")),
    ).rejects.toThrow("banner=approval_needed_note_required");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });
});

describe("markJobUnableToCompleteFromForm", () => {
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
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("marks in-process visit complete and routes other reason to held follow-up", async () => {
    const { supabase, jobUpdates, jobUpdateEqFilters, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobUnableToCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobUnableToCompleteFromForm(
        buildUnableToCompleteFormData("Customer not home and no access to equipment room"),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=info&banner=unable_to_complete_saved#field-outcome");

    expect(jobUpdates).toHaveLength(1);
    expect(jobUpdates[0]).toEqual(
      expect.objectContaining({
        status: "completed",
        field_complete: true,
        ops_status: "pending_info",
        pending_info_reason: "Other: Customer not home and no access to equipment room",
        on_hold_reason: null,
      }),
    );
    expect(jobUpdateEqFilters).toEqual([
      ["id", "job-1"],
      ["account_owner_user_id", "owner-1"],
    ]);

    expect(jobEvents).toHaveLength(2);
    expect(jobEvents[0]).toEqual(
      expect.objectContaining({
        event_type: "job_completed",
        user_id: "internal-user-1",
      }),
    );
    expect(jobEvents[1]).toEqual(
      expect.objectContaining({
        event_type: "ops_update",
        user_id: "internal-user-1",
        meta: expect.objectContaining({
          event_family: "ops_blocker",
          blocker_type: "other",
          blocker_reason: "Customer not home and no access to equipment room",
          source_action: "markJobUnableToCompleteFromForm",
          next: expect.objectContaining({
            ops_status: "pending_info",
            pending_info_reason: "Other: Customer not home and no access to equipment room",
          }),
        }),
      }),
    );
  });

  it("rejects unable-to-complete transition when job is already field complete", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      ops_status: "pending_info",
      field_complete: true,
      field_complete_at: "2026-06-04T01:02:03.000Z",
      pending_info_reason: "Other: Existing blocker",
      on_hold_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobUnableToCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobUnableToCompleteFromForm(buildUnableToCompleteFormData("Unsafe work area today")),
    ).rejects.toThrow("banner=unable_to_complete_already_completed");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });

  it("rejects unable-to-complete transition when job is not in_process", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "open",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobUnableToCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobUnableToCompleteFromForm(buildUnableToCompleteFormData("No site access")),
    ).rejects.toThrow("banner=unable_to_complete_invalid_status");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });

  it("requires a short unable-to-complete reason", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobUnableToCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobUnableToCompleteFromForm(buildUnableToCompleteFormData("   ")),
    ).rejects.toThrow("banner=unable_to_complete_note_required");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });
});

describe("markJobDifferentIssueFoundFromForm", () => {
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
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("marks callback/revisit visit complete and routes to pending_office_review", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      job_type: "service",
      service_visit_type: "callback",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
      next_action_note: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobDifferentIssueFoundFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobDifferentIssueFoundFromForm(
        buildDifferentIssueFoundFormData("Original complaint resolved, found separate zone damper issue"),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=info&banner=different_issue_found_saved#field-outcome");

    expect(jobUpdates).toHaveLength(1);
    expect(jobUpdates[0]).toEqual(
      expect.objectContaining({
        status: "completed",
        field_complete: true,
        ops_status: "pending_office_review",
        pending_info_reason: null,
        on_hold_reason: null,
        next_action_note: "Different issue found: Original complaint resolved, found separate zone damper issue",
      }),
    );

    expect(jobEvents).toHaveLength(2);
    expect(jobEvents[0]).toEqual(
      expect.objectContaining({
        event_type: "job_completed",
        user_id: "internal-user-1",
      }),
    );
    expect(jobEvents[1]).toEqual(
      expect.objectContaining({
        event_type: "ops_update",
        user_id: "internal-user-1",
        meta: expect.objectContaining({
          event_family: "ops_exception",
          exception_outcome: "different_issue_found",
          source_action: "markJobDifferentIssueFoundFromForm",
          reason: "Original complaint resolved, found separate zone damper issue",
          next: expect.objectContaining({
            ops_status: "pending_office_review",
            next_action_note: "Different issue found: Original complaint resolved, found separate zone damper issue",
          }),
        }),
      }),
    );
  });

  it("rejects different-issue-found for non callback/revisit service visits", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      job_type: "service",
      service_visit_type: "diagnostic",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
      next_action_note: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobDifferentIssueFoundFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobDifferentIssueFoundFromForm(
        buildDifferentIssueFoundFormData("Found separate issue unrelated to callback reason"),
      ),
    ).rejects.toThrow("banner=different_issue_found_callback_revisit_only");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });

  it("rejects different-issue-found for non-service jobs", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      job_type: "ecc",
      service_visit_type: "callback",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
      next_action_note: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobDifferentIssueFoundFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobDifferentIssueFoundFromForm(
        buildDifferentIssueFoundFormData("ECC issue is outside callback/revisit path"),
      ),
    ).rejects.toThrow("banner=different_issue_found_service_only");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });

  it("requires a short different-issue note", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      job_type: "service",
      service_visit_type: "return_visit",
      ops_status: "scheduled",
      field_complete: false,
      field_complete_at: null,
      pending_info_reason: null,
      on_hold_reason: null,
      next_action_note: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { markJobDifferentIssueFoundFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobDifferentIssueFoundFromForm(buildDifferentIssueFoundFormData("   ")),
    ).rejects.toThrow("banner=different_issue_found_note_required");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });
});
