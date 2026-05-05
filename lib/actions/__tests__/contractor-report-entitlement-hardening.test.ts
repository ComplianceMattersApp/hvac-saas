import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const revalidatePathMock = vi.fn();
const extractFailureReasonsMock = vi.fn();
const finalRunPassMock = vi.fn();
const extractFailureDetailsMock = vi.fn();

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
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  findExistingContractorReportEmailDelivery: vi.fn(async () => null),
  insertContractorReportEmailDeliveryNotification: vi.fn(async () => ({ id: "notif-1" })),
  insertInternalNotificationForEvent: vi.fn(async () => ({})),
  markContractorReportEmailDeliveryNotification: vi.fn(async () => ({})),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(async () => ({
    display_name: "Test Support",
    support_phone: "555-1234",
    support_email: "support@test.com",
  })),
}));

vi.mock("@/lib/email/layout", () => ({
  resolveAppUrl: vi.fn(() => "http://localhost:3000"),
  renderSystemEmailLayout: vi.fn(() => "<html></html>"),
  escapeHtml: vi.fn((value: string) => value),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: vi.fn(async () => ({})),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/portal/resolveContractorIssues", () => ({
  extractFailureReasons: (...args: unknown[]) => extractFailureReasonsMock(...args),
  finalRunPass: (...args: unknown[]) => finalRunPassMock(...args),
  extractFailureDetails: (...args: unknown[]) => extractFailureDetailsMock(...args),
}));

function makeContractorReportFixture(options?: {
  eccRuns?: Array<Record<string, unknown>>;
}) {
  const writes: Array<{ table: string; op: string }> = [];
  const insertedJobEvents: any[] = [];
  const eccRuns = options?.eccRuns ?? [
    {
      created_at: "2026-04-20T10:00:00Z",
      test_type: "airflow",
      computed: { required_total_cfm: 900, measured_total_cfm: 840, failures: [], warnings: [] },
      computed_pass: false,
      override_pass: null,
      is_completed: true,
    },
  ];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: "job-1",
                  ops_status: "failed",
                  contractor_id: "contractor-1",
                  pending_info_reason: null,
                  follow_up_date: null,
                  next_action_note: null,
                  action_required_by: null,
                  scheduled_date: "2026-04-25",
                  window_start: "09:00",
                  window_end: "11:00",
                  customer_first_name: "Test",
                  customer_last_name: "Customer",
                  contractors: {
                    email: "contractor@test.com",
                    owner_user_id: "owner-1",
                    name: "Test Contractor",
                  },
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: any) => {
            writes.push({ table, op: "insert" });
            insertedJobEvents.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "event-1" },
                  error: null,
                })),
              })),
            };
          }),
        };
      }

      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { user_id: "user-1" },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "ecc_test_runs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: eccRuns,
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { supabase, writes, insertedJobEvents };
}

describe("contractor report entitlement hardening", () => {
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

    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });

    extractFailureReasonsMock.mockImplementation((run: any) =>
      Array.isArray(run?.__reasons) ? run.__reasons : ["Test failure reason"],
    );
    finalRunPassMock.mockImplementation((run: any) =>
      typeof run?.__pass === "boolean" ? run.__pass : true,
    );
    extractFailureDetailsMock.mockImplementation((run: any) =>
      Array.isArray(run?.__details) ? run.__details : [],
    );
  });

  describe("generateContractorReportPreview", () => {
    it("allows active account preview generation", async () => {
      const { supabase } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(preview).toBeDefined();
      expect(preview.title).toBeDefined();
    });

    it("allows valid trial preview generation", async () => {
      const { supabase } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      expect(preview).toBeDefined();
    });

    it("blocks expired trial preview generation before report resolution", async () => {
      const { supabase } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_expired",
      });

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      await expect(generateContractorReportPreview({ jobId: "job-1" })).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );
    });

    it("blocks null-ended trial preview generation before report resolution", async () => {
      const { supabase } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_missing_end",
      });

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      await expect(generateContractorReportPreview({ jobId: "job-1" })).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );
    });

    it("allows internal comped preview generation", async () => {
      const { supabase } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      expect(preview).toBeDefined();
    });

    it("blocks missing entitlement preview generation before report resolution", async () => {
      const { supabase } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_missing_entitlement",
      });

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      await expect(generateContractorReportPreview({ jobId: "job-1" })).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );
    });

    it("aggregates all failed completed ECC reasons with stable dedupe order", async () => {
      const { supabase } = makeContractorReportFixture({
        eccRuns: [
          {
            created_at: "2026-04-20T10:00:00Z",
            computed: true,
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Airflow below required (900 CFM)", "Shared duplicate reason"],
          },
          {
            created_at: "2026-04-19T10:00:00Z",
            computed: true,
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Duct leakage above threshold", "Shared duplicate reason"],
          },
          {
            created_at: "2026-04-18T10:00:00Z",
            computed: true,
            computed_pass: false,
            override_pass: true,
            is_completed: true,
            __pass: true,
            __reasons: ["Refrigerant weather exception"],
          },
        ],
      });
      createClientMock.mockResolvedValue(supabase);

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      expect(preview.reasons).toEqual([
        "Airflow below required (900 CFM)",
        "Shared duplicate reason",
        "Duct leakage above threshold",
      ]);
      expect(preview.reasons).not.toContain("Refrigerant weather exception");
      expect(preview.contractor_failure_summary_v1.what_needs_correction).toEqual(preview.reasons);
    });

    it("falls back when failed runs provide no specific reasons", async () => {
      const { supabase } = makeContractorReportFixture({
        eccRuns: [
          {
            created_at: "2026-04-20T10:00:00Z",
            computed: true,
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: [],
          },
        ],
      });
      createClientMock.mockResolvedValue(supabase);

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      expect(preview.reasons).toEqual(["Test failed. Please review and correct."]);
    });
  });

  describe("sendContractorReport", () => {
    it("allows active account report send and writes events", async () => {
      const { supabase, writes } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);

      const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

      const result = await sendContractorReport({
        jobId: "job-1",
        contractorNote: "Test note",
      });

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(result.ok).toBe(true);
      expect(writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalled();
    });

    it("uses the same aggregated reasons in preview and send paths", async () => {
      const fixture = makeContractorReportFixture({
        eccRuns: [
          {
            created_at: "2026-04-20T10:00:00Z",
            computed: true,
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Airflow below required (900 CFM)"],
          },
          {
            created_at: "2026-04-19T10:00:00Z",
            computed: true,
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Duct leakage above threshold"],
          },
          {
            created_at: "2026-04-18T10:00:00Z",
            computed: true,
            computed_pass: false,
            override_pass: true,
            is_completed: true,
            __pass: true,
            __reasons: ["Refrigerant weather exception"],
          },
        ],
      });
      createClientMock.mockResolvedValue(fixture.supabase);

      const { generateContractorReportPreview, sendContractorReport } = await import(
        "@/lib/actions/job-ops-actions"
      );

      const preview = await generateContractorReportPreview({ jobId: "job-1" });
      await sendContractorReport({ jobId: "job-1" });

      const sentEvent = fixture.insertedJobEvents.find(
        (payload) => payload?.event_type === "contractor_report_sent",
      );

      expect(preview.reasons).toEqual([
        "Airflow below required (900 CFM)",
        "Duct leakage above threshold",
      ]);
      expect(sentEvent?.meta?.reasons).toEqual(preview.reasons);
      expect(sentEvent?.meta?.report_render_version).toBe("contractor_failure_report_v2");
      expect(sentEvent?.meta?.failure_details).toEqual([]);
      expect(sentEvent?.meta?.reasons).not.toContain("Refrigerant weather exception");
    });

    it("allows valid trial report send", async () => {
      const { supabase, writes } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

      const result = await sendContractorReport({
        jobId: "job-1",
      });

      expect(result.ok).toBe(true);
      expect(writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
    });

    it("blocks expired trial report send before writes", async () => {
      const { supabase, writes } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_expired",
      });

      const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

      await expect(
        sendContractorReport({
          jobId: "job-1",
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial report send before writes", async () => {
      const { supabase, writes } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_missing_end",
      });

      const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

      await expect(
        sendContractorReport({
          jobId: "job-1",
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped report send", async () => {
      const { supabase, writes } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

      const result = await sendContractorReport({
        jobId: "job-1",
      });

      expect(result.ok).toBe(true);
      expect(writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
    });

    it("blocks missing entitlement report send before writes", async () => {
      const { supabase, writes } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_missing_entitlement",
      });

      const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

      await expect(
        sendContractorReport({
          jobId: "job-1",
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe("failure_details enrichment", () => {
    it("airflow failure detail includes baseline, measured, difference, percent below", async () => {
      const airflowDetail = {
        headline: "Airflow failed",
        detail_lines: [
          "Required minimum: 900 CFM",
          "Measured: 840 CFM",
          "Difference: 60 CFM below required (6.7% below target)",
        ],
      };
      const { supabase } = makeContractorReportFixture({
        eccRuns: [
          {
            created_at: "2026-04-20T10:00:00Z",
            test_type: "airflow",
            computed: { required_total_cfm: 900, measured_total_cfm: 840, failures: [], warnings: [] },
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Airflow below required (900 CFM)"],
            __details: [airflowDetail],
          },
        ],
      });
      createClientMock.mockResolvedValue(supabase);

      const { generateContractorReportPreview } = await import("@/lib/actions/job-ops-actions");

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      expect(preview.failure_details).toHaveLength(1);
      expect(preview.failure_details[0].headline).toBe("Airflow failed");
      expect(preview.failure_details[0].detail_lines).toContain("Required minimum: 900 CFM");
      expect(preview.failure_details[0].detail_lines).toContain("Measured: 840 CFM");
      expect(preview.failure_details[0].detail_lines[2]).toMatch(/60 CFM below required/);
    });

    it("duct leakage failure detail includes max, measured, actual leakage percent, difference", async () => {
      const ductDetail = {
        headline: "Duct leakage failed",
        detail_lines: [
          "Allowed maximum: 120 CFM (10.0%)",
          "Measured: 405 CFM",
          "Actual leakage: 33.8%",
          "Difference: 285 CFM over limit, 23.8 percentage points above the 10.0% standard",
        ],
      };
      const { supabase } = makeContractorReportFixture({
        eccRuns: [
          {
            created_at: "2026-04-20T10:00:00Z",
            test_type: "duct_leakage",
            computed: { max_leakage_cfm: 120, measured_duct_leakage_cfm: 405, failures: [], warnings: [] },
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Duct leakage above max (120 CFM)"],
            __details: [ductDetail],
          },
        ],
      });
      createClientMock.mockResolvedValue(supabase);

      const { generateContractorReportPreview } = await import("@/lib/actions/job-ops-actions");

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      expect(preview.failure_details).toHaveLength(1);
      expect(preview.failure_details[0].headline).toBe("Duct leakage failed");
      expect(preview.failure_details[0].detail_lines[0]).toMatch(/120 CFM/);
      expect(preview.failure_details[0].detail_lines[1]).toMatch(/405 CFM/);
    });

    it("airflow + duct leakage both appear in failure_details", async () => {
      const { supabase } = makeContractorReportFixture({
        eccRuns: [
          {
            created_at: "2026-04-20T10:00:00Z",
            test_type: "airflow",
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Airflow below required (900 CFM)"],
            __details: [{ headline: "Airflow failed", detail_lines: ["Required minimum: 900 CFM", "Measured: 840 CFM", "Difference: 60 CFM below required (6.7% below target)"] }],
          },
          {
            created_at: "2026-04-19T10:00:00Z",
            test_type: "duct_leakage",
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Duct leakage above max (120 CFM)"],
            __details: [{ headline: "Duct leakage failed", detail_lines: ["Allowed maximum: 120 CFM (10.0%)", "Measured: 405 CFM"] }],
          },
        ],
      });
      createClientMock.mockResolvedValue(supabase);

      const { generateContractorReportPreview } = await import("@/lib/actions/job-ops-actions");

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      const headlines = preview.failure_details.map((d) => d.headline);
      expect(headlines).toContain("Airflow failed");
      expect(headlines).toContain("Duct leakage failed");
      expect(preview.reasons).toHaveLength(2);
    });

    it("refrigerant subcool failure detail includes target, range, measured, difference", async () => {
      const subcoolDetail = {
        headline: "Refrigerant charge failed – Subcooling",
        detail_lines: [
          "Target subcooling: 10.0°F",
          "Allowed range: ±2.0°F",
          "Measured: 15.0°F",
          "Difference: 3.0°F outside allowed range",
        ],
      };
      const { supabase } = makeContractorReportFixture({
        eccRuns: [
          {
            created_at: "2026-04-20T10:00:00Z",
            test_type: "refrigerant_charge",
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Subcool not within ±2F of target"],
            __details: [subcoolDetail],
          },
        ],
      });
      createClientMock.mockResolvedValue(supabase);

      const { generateContractorReportPreview } = await import("@/lib/actions/job-ops-actions");

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      expect(preview.failure_details[0].headline).toBe("Refrigerant charge failed – Subcooling");
      expect(preview.failure_details[0].detail_lines).toContain("Target subcooling: 10.0°F");
      expect(preview.failure_details[0].detail_lines).toContain("Allowed range: ±2.0°F");
    });

    it("refrigerant superheat failure detail includes limit, measured, difference", async () => {
      const superheatDetail = {
        headline: "Refrigerant charge failed – Superheat",
        detail_lines: [
          "Maximum allowed superheat: 25.0°F",
          "Measured: 30.0°F",
          "Difference: 5.0°F over limit",
        ],
      };
      const { supabase } = makeContractorReportFixture({
        eccRuns: [
          {
            created_at: "2026-04-20T10:00:00Z",
            test_type: "refrigerant_charge",
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Superheat >= 25F"],
            __details: [superheatDetail],
          },
        ],
      });
      createClientMock.mockResolvedValue(supabase);

      const { generateContractorReportPreview } = await import("@/lib/actions/job-ops-actions");

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      expect(preview.failure_details[0].headline).toBe("Refrigerant charge failed – Superheat");
      expect(preview.failure_details[0].detail_lines[0]).toMatch(/25/);
    });

    it("pass override / weather exception run contributes no failure_details", async () => {
      const { supabase } = makeContractorReportFixture({
        eccRuns: [
          {
            created_at: "2026-04-20T10:00:00Z",
            test_type: "airflow",
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Airflow below required (900 CFM)"],
            __details: [{ headline: "Airflow failed", detail_lines: ["Required minimum: 900 CFM"] }],
          },
          {
            created_at: "2026-04-19T10:00:00Z",
            test_type: "refrigerant_charge",
            computed_pass: false,
            override_pass: true,
            is_completed: true,
            __pass: true,
            __reasons: ["Weather exception"],
            __details: [{ headline: "Refrigerant charge failed – Subcooling", detail_lines: ["Should not appear"] }],
          },
        ],
      });
      createClientMock.mockResolvedValue(supabase);

      const { generateContractorReportPreview } = await import("@/lib/actions/job-ops-actions");

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      const headlines = preview.failure_details.map((d) => d.headline);
      expect(headlines).not.toContain("Refrigerant charge failed – Subcooling");
      expect(headlines).toContain("Airflow failed");
      expect(preview.reasons).not.toContain("Weather exception");
    });

    it("preview and send share the same failure_details via the resolver", async () => {
      const fixture = makeContractorReportFixture({
        eccRuns: [
          {
            created_at: "2026-04-20T10:00:00Z",
            test_type: "airflow",
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Airflow below required (900 CFM)"],
            __details: [{ headline: "Airflow failed", detail_lines: ["Required minimum: 900 CFM", "Measured: 840 CFM"] }],
          },
          {
            created_at: "2026-04-19T10:00:00Z",
            test_type: "duct_leakage",
            computed_pass: false,
            override_pass: null,
            is_completed: true,
            __pass: false,
            __reasons: ["Duct leakage above max (120 CFM)"],
            __details: [{ headline: "Duct leakage failed", detail_lines: ["Allowed maximum: 120 CFM (10.0%)"] }],
          },
        ],
      });
      createClientMock.mockResolvedValue(fixture.supabase);

      const { generateContractorReportPreview, sendContractorReport } = await import(
        "@/lib/actions/job-ops-actions"
      );

      const preview = await generateContractorReportPreview({ jobId: "job-1" });
      await sendContractorReport({ jobId: "job-1" });

      const sentEvent = fixture.insertedJobEvents.find(
        (payload) => payload?.event_type === "contractor_report_sent",
      );

      expect(preview.failure_details).toHaveLength(2);
      expect(sentEvent?.meta?.reasons).toEqual(preview.reasons);
      expect(sentEvent?.meta?.failure_details).toEqual(preview.failure_details);
      expect(sentEvent?.meta?.report_render_version).toBe("contractor_failure_report_v2");
      expect(sentEvent?.meta?.body_text).toContain("Airflow failed");
      expect(sentEvent?.meta?.body_text).toContain("Duct leakage failed");
      expect(sentEvent?.meta?.next_step).toBe(preview.next_step);
    });
  });
});
