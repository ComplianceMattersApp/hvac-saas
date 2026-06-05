import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();

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
  reconcileServiceCaseStatusAfterJobChange: vi.fn(async () => undefined),
}));

vi.mock("@/lib/portal/resolveContractorIssues", () => ({
  extractFailureDetails: vi.fn(() => []),
  extractFailureReasons: vi.fn(() => []),
  finalRunPass: vi.fn(() => true),
}));

type PartsNeededJob = {
  id: string;
  status: string;
  ops_status: string | null;
  field_complete: boolean;
  field_complete_at: string | null;
  pending_info_reason: string | null;
  on_hold_reason: string | null;
};

function buildPartsNeededFormData(note: string) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("current_status", "in_process");
  formData.set("tab", "info");
  formData.set("parts_note", note);
  return formData;
}

function makeSupabaseForPartsNeeded(beforeJob: PartsNeededJob) {
  const jobUpdates: Record<string, unknown>[] = [];
  const jobEvents: Record<string, unknown>[] = [];

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
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
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

  return { supabase, jobUpdates, jobEvents };
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

  it("marks in-process visit complete and routes parts-needed to waiting_on_part", async () => {
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
        pending_info_reason: "Waiting on part: Need condenser fan motor",
        on_hold_reason: null,
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
          event_family: "ops_blocker",
          blocker_type: "waiting_on_part",
          blocker_reason: "Need condenser fan motor",
          source_action: "markJobPartsNeededFromForm",
          next: expect.objectContaining({
            ops_status: "pending_info",
            pending_info_reason: "Waiting on part: Need condenser fan motor",
          }),
        }),
      }),
    );
  });

  it("rejects parts-needed transition when job is already field complete", async () => {
    const { supabase, jobUpdates, jobEvents } = makeSupabaseForPartsNeeded({
      id: "job-1",
      status: "in_process",
      ops_status: "pending_info",
      field_complete: true,
      field_complete_at: "2026-06-04T01:02:03.000Z",
      pending_info_reason: "Waiting on part: Existing blocker",
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

    const { markJobPartsNeededFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobPartsNeededFromForm(buildPartsNeededFormData("Need TXV kit")),
    ).rejects.toThrow("banner=parts_needed_invalid_status");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });

  it("requires a short parts note", async () => {
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

    const { markJobPartsNeededFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      markJobPartsNeededFromForm(buildPartsNeededFormData("   ")),
    ).rejects.toThrow("banner=parts_needed_note_required");

    expect(jobUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
  });
});
