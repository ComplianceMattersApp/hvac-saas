import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: vi.fn(),
  isInternalAccessError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
  loadScopedInternalServiceCaseForMutation: vi.fn(),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: vi.fn(async () => undefined),
  healStalePaperworkOpsStatus: vi.fn(async () => true),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/job-ops-actions", () => ({
  releasePendingInfoAndRecompute: vi.fn(async () => null),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
  buildStaffingSnapshotMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

type SourceJobFixture = {
  id: string;
  job_type: string;
  status?: string | null;
  ops_status?: string | null;
  field_complete?: boolean | null;
  service_case_id?: string | null;
};

function buildFormData(overrides?: {
  callback_report_text?: string;
  tab?: string;
  return_to?: string;
}) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set(
    "callback_report_text",
    overrides?.callback_report_text ?? "Customer reported same issue after prior completion",
  );
  formData.set("tab", overrides?.tab ?? "ops");
  formData.set("return_to", overrides?.return_to ?? "/jobs/job-1?tab=ops#next-service-action");
  return formData;
}

function makeSupabaseFixture(params: {
  sourceJob: SourceJobFixture | null;
}) {
  const eventInsertValues: Array<Record<string, unknown>> = [];
  const jobMutations: Array<{ table: string; method: "insert" | "update" }> = [];

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: params.sourceJob,
                error: null,
              })),
            })),
          })),
          insert: vi.fn(() => {
            jobMutations.push({ table, method: "insert" });
            throw new Error("UNEXPECTED_JOBS_INSERT");
          }),
          update: vi.fn(() => {
            jobMutations.push({ table, method: "update" });
            throw new Error("UNEXPECTED_JOBS_UPDATE");
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: (values: Record<string, unknown>) => {
            eventInsertValues.push(values);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "event-1" },
                  error: null,
                })),
              })),
            };
          },
        };
      }

      if (table === "service_cases") {
        return {
          insert: vi.fn(() => {
            jobMutations.push({ table, method: "insert" });
            throw new Error("UNEXPECTED_SERVICE_CASE_INSERT");
          }),
          update: vi.fn(() => {
            jobMutations.push({ table, method: "update" });
            throw new Error("UNEXPECTED_SERVICE_CASE_UPDATE");
          }),
        };
      }

      throw new Error(`UNEXPECTED_TABLE:${table}`);
    },
  };

  return { supabase, eventInsertValues, jobMutations };
}

describe("callback intake action", () => {
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

  it("writes callback_reported event only and does not create/update jobs", async () => {
    const { supabase, eventInsertValues, jobMutations } = makeSupabaseFixture({
      sourceJob: {
        id: "job-1",
        job_type: "service",
        status: "completed",
        ops_status: "pending_info",
        field_complete: true,
        service_case_id: "case-1",
      },
    });

    createClientMock.mockResolvedValue(supabase);

    const { recordCallbackReportFromForm } = await import("@/lib/actions/job-actions");

    await expect(recordCallbackReportFromForm(buildFormData())).rejects.toThrow(
      /REDIRECT:\/jobs\/job-1\?tab=ops&banner=callback_report_recorded&rv=/,
    );

    expect(eventInsertValues).toHaveLength(1);
    expect(eventInsertValues[0]).toMatchObject({
      job_id: "job-1",
      event_type: "callback_reported",
      user_id: "internal-user-1",
      meta: expect.objectContaining({
        source_action: "callback_intake_reported",
        callback_report_text: "Customer reported same issue after prior completion",
        anchor_job_id: "job-1",
        service_case_id: "case-1",
        callback_reported_by_user_id: "internal-user-1",
      }),
    });
    expect(jobMutations).toHaveLength(0);
  });

  it("requires callback report text", async () => {
    const { supabase, eventInsertValues, jobMutations } = makeSupabaseFixture({
      sourceJob: {
        id: "job-1",
        job_type: "service",
        status: "completed",
        ops_status: "closed",
        field_complete: true,
        service_case_id: "case-1",
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const { recordCallbackReportFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      recordCallbackReportFromForm(buildFormData({ callback_report_text: "  " })),
    ).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=callback_report_reason_required#next-service-action",
    );

    expect(eventInsertValues).toHaveLength(0);
    expect(jobMutations).toHaveLength(0);
  });

  it("rejects non-service anchors", async () => {
    const { supabase, eventInsertValues, jobMutations } = makeSupabaseFixture({
      sourceJob: {
        id: "job-1",
        job_type: "ecc",
        status: "completed",
        ops_status: "closed",
        field_complete: true,
        service_case_id: "case-1",
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const { recordCallbackReportFromForm } = await import("@/lib/actions/job-actions");

    await expect(recordCallbackReportFromForm(buildFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=callback_report_not_service#next-service-action",
    );

    expect(eventInsertValues).toHaveLength(0);
    expect(jobMutations).toHaveLength(0);
  });

  it("rejects anchors that are not historical complete/closed", async () => {
    const { supabase, eventInsertValues, jobMutations } = makeSupabaseFixture({
      sourceJob: {
        id: "job-1",
        job_type: "service",
        status: "in_process",
        ops_status: "scheduled",
        field_complete: false,
        service_case_id: "case-1",
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const { recordCallbackReportFromForm } = await import("@/lib/actions/job-actions");

    await expect(recordCallbackReportFromForm(buildFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=callback_report_requires_historical_anchor#next-service-action",
    );

    expect(eventInsertValues).toHaveLength(0);
    expect(jobMutations).toHaveLength(0);
  });

  it("is internal scoped and entitlement gated", async () => {
    const { supabase, eventInsertValues, jobMutations } = makeSupabaseFixture({
      sourceJob: {
        id: "job-1",
        job_type: "service",
        status: "completed",
        ops_status: "closed",
        field_complete: true,
        service_case_id: "case-1",
      },
    });
    createClientMock.mockResolvedValue(supabase);

    loadScopedInternalJobForMutationMock.mockResolvedValueOnce(null);

    const { recordCallbackReportFromForm } = await import("@/lib/actions/job-actions");

    await expect(recordCallbackReportFromForm(buildFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=not_authorized#next-service-action",
    );

    expect(eventInsertValues).toHaveLength(0);
    expect(jobMutations).toHaveLength(0);

    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_missing_entitlement",
    });

    await expect(recordCallbackReportFromForm(buildFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
    );

    expect(eventInsertValues).toHaveLength(0);
    expect(jobMutations).toHaveLength(0);
  });
});

describe("callback intake job detail wiring", () => {
  it("includes office callback report copy and explicit no-create/no-schedule guidance", () => {
    const source = readFileSync(resolve(__dirname, "../../../app/jobs/[id]/page.tsx"), "utf-8");

    expect(source).toContain("Record Callback Report");
    expect(source).toContain(
      "Use when a customer reports an issue after prior work was believed complete. This records the report only; it does not create or schedule a visit.",
    );
    expect(source).toContain("recordCallbackReportFromForm");
    expect(source).toContain('name="callback_report_text"');
  });
});
