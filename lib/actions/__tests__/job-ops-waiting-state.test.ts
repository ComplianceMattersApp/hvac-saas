// Service Waiting State V1 — focused behavioral tests for no-schema blocker tracking
import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const evaluateEccOpsStatusMock = vi.fn();
const evaluateJobOpsStatusMock = vi.fn();
const healStalePaperworkOpsStatusMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
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

vi.mock("@/lib/actions/notification-actions", () => ({
  findExistingContractorReportEmailDelivery: vi.fn(async () => null),
  insertContractorReportEmailDeliveryNotification: vi.fn(async () => ({ id: "delivery-1" })),
  insertInternalNotificationForEvent: vi.fn(async () => undefined),
  markContractorReportEmailDeliveryNotification: vi.fn(async () => undefined),
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
  renderSystemEmailLayout: vi.fn(() => "<html></html>"),
  escapeHtml: vi.fn((value: string) => value),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/portal/resolveContractorIssues", () => ({
  extractFailureReasons: vi.fn(() => []),
  finalRunPass: vi.fn(() => true),
}));

type BeforeJob = {
  ops_status: string | null;
  pending_info_reason: string | null;
  on_hold_reason: string | null;
  follow_up_date: string | null;
  next_action_note: string | null;
  action_required_by: string | null;
  status?: string | null;
  job_type?: string | null;
  field_complete?: boolean | null;
  certs_complete?: boolean | null;
  invoice_complete?: boolean | null;
  scheduled_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  id?: string;
};

function buildPendingInfoFormData(reason: string) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("interrupt_state", "pending_info");
  formData.set("status_reason", reason);
  return formData;
}

function buildOnHoldFormData(reason: string) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("interrupt_state", "on_hold");
  formData.set("status_reason", reason);
  return formData;
}

function buildWaitingFormData(type: string, options?: { otherReason?: string; legacyOpsStatus?: "pending_info" | "on_hold" }) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("interrupt_state", "waiting");
  formData.set("waiting_state_type", type);
  if (options?.otherReason) {
    formData.set("waiting_other_reason", options.otherReason);
  }
  if (options?.legacyOpsStatus) {
    formData.set("ops_status", options.legacyOpsStatus);
  }
  return formData;
}

function makeSupabaseForUpdate(before: BeforeJob) {
  let updatedPayload: Record<string, unknown> | null = null;
  const insertedEvents: any[] = [];

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
          single: vi.fn(async () => ({ data: before, error: null })),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedPayload = payload;
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
        return query;
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async (payload: any) => {
            insertedEvents.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, getUpdatedPayload: () => updatedPayload, insertedEvents };
}

function makeSupabaseForRelease(before: Required<BeforeJob> & { id: string }) {
  const insertedEvents: any[] = [];
  let updatedPayload: Record<string, unknown> | null = null;

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          single: vi.fn(async () => ({ data: before, error: null })),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedPayload = payload;
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
        return query;
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async (payload: any) => {
            insertedEvents.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, insertedEvents, getUpdatedPayload: () => updatedPayload };
}

describe("job ops interrupt-state v2", () => {
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
    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
    evaluateJobOpsStatusMock.mockResolvedValue(undefined);
    healStalePaperworkOpsStatusMock.mockResolvedValue(true);
  });

  it("persists pending info custom reason", async () => {
    const { supabase, getUpdatedPayload, insertedEvents } = makeSupabaseForUpdate({
      ops_status: "scheduled",
      pending_info_reason: null,
      on_hold_reason: null,
      follow_up_date: "2026-05-01",
      next_action_note: "Call supplier",
      action_required_by: "rater",
    });
    createClientMock.mockResolvedValue(supabase);

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      updateJobOpsFromForm(buildPendingInfoFormData("Missing permit number")),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=ops_status_saved");

    expect(getUpdatedPayload()).toMatchObject({
      ops_status: "pending_info",
      pending_info_reason: "Missing permit number",
      on_hold_reason: null,
    });

    expect(insertedEvents[0].meta).toMatchObject({
      blocker_action: "set",
      blocker_type: "pending_info",
      blocker_reason: "Missing permit number",
      source: "job_detail",
      action_required_by: "rater",
      follow_up_date: "2026-05-01",
      next_action_note: "Call supplier",
    });
  });

  it("persists on hold custom reason", async () => {
    const { supabase, getUpdatedPayload } = makeSupabaseForUpdate({
      ops_status: "scheduled",
      pending_info_reason: null,
      on_hold_reason: null,
      follow_up_date: null,
      next_action_note: null,
      action_required_by: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      updateJobOpsFromForm(buildOnHoldFormData("Customer requested delay")),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=ops_status_saved");

    expect(getUpdatedPayload()).toMatchObject({
      ops_status: "on_hold",
      pending_info_reason: null,
      on_hold_reason: "Customer requested delay",
    });
  });

  it("persists waiting dropdown reason", async () => {
    const { supabase, getUpdatedPayload, insertedEvents } = makeSupabaseForUpdate({
      ops_status: "scheduled",
      pending_info_reason: null,
      on_hold_reason: null,
      follow_up_date: null,
      next_action_note: null,
      action_required_by: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      updateJobOpsFromForm(buildWaitingFormData("waiting_on_part")),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=ops_status_saved");

    expect(getUpdatedPayload()).toMatchObject({
      ops_status: "pending_info",
      pending_info_reason: "Waiting on part: Waiting on part",
      on_hold_reason: null,
    });

    expect(insertedEvents[0].meta).toMatchObject({
      blocker_type: "waiting_on_part",
      blocker_action: "set",
      blocker_reason: "Waiting on part",
    });
  });

  it("requires custom reason when waiting reason is other", async () => {
    const { supabase } = makeSupabaseForUpdate({
      ops_status: "scheduled",
      pending_info_reason: null,
      on_hold_reason: null,
      follow_up_date: null,
      next_action_note: null,
      action_required_by: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(
      updateJobOpsFromForm(buildWaitingFormData("other")),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=waiting_other_reason_required");
  });

  it("emits blocker_action cleared metadata on release when previous blocker is parseable", async () => {
    const { supabase, insertedEvents } = makeSupabaseForRelease({
      id: "job-1",
      status: "open",
      job_type: "service",
      ops_status: "pending_info",
      field_complete: false,
      certs_complete: false,
      invoice_complete: false,
      scheduled_date: null,
      window_start: null,
      window_end: null,
      pending_info_reason: "Waiting on information: permit packet missing",
      on_hold_reason: null,
      follow_up_date: null,
      next_action_note: null,
      action_required_by: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { releaseAndReevaluate } = await import("@/lib/actions/job-ops-actions");

    const next = await releaseAndReevaluate("job-1", "job_detail");

    expect(next).toBe("need_to_schedule");
    expect(insertedEvents[0].meta).toMatchObject({
      blocker_action: "cleared",
      previous_blocker_type: "waiting_on_information",
      previous_blocker_reason: "permit packet missing",
      source: "job_detail",
    });
  });
});
