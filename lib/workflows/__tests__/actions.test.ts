import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (error: unknown) =>
    Boolean(error)
      && typeof error === "object"
      && (error as any).name === "InternalAccessError",
}));

type MockServiceCase = {
  id: string;
  customer_id: string;
};

type MockCustomer = {
  id: string;
  owner_user_id: string;
};

type MockPreset = {
  id: string;
  account_owner_user_id: string;
  template_name: string;
  lifecycle_status: string;
  milestone_definition_json: unknown;
  updated_at?: string | null;
};

type MockWorkflowInstance = {
  id: string;
  account_owner_user_id: string;
  service_case_id: string;
  workflow_preset_template_id: string | null;
  workflow_status: string;
};

type MockWorkflowMilestone = {
  id: string;
  account_owner_user_id: string;
  workflow_instance_id: string;
};

type MockWorkflowJobLink = {
  id: string;
  account_owner_user_id: string;
  workflow_instance_id: string;
};

type MockJob = {
  id: string;
  customer_id: string;
  service_case_id: string | null;
  deleted_at?: string | null;
};

function makeThenable<T>(
  resolver: () => T,
  chainMethods: Record<string, (...args: unknown[]) => any>,
) {
  const query: any = {
    ...chainMethods,
    then: (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(resolver()).then(resolve, reject),
  };
  return query;
}

function makeAdminFixture(input?: {
  serviceCases?: MockServiceCase[];
  customers?: MockCustomer[];
  presets?: MockPreset[];
  workflowInstances?: MockWorkflowInstance[];
  workflowMilestones?: MockWorkflowMilestone[];
  workflowJobLinks?: MockWorkflowJobLink[];
  jobs?: MockJob[];
}) {
  const serviceCases = [...(input?.serviceCases ?? [])];
  const customers = [...(input?.customers ?? [])];
  const presets = [...(input?.presets ?? [])];
  const workflowInstances = [...(input?.workflowInstances ?? [])];
  const workflowMilestones = [...(input?.workflowMilestones ?? [])];
  const workflowJobLinks = [...(input?.workflowJobLinks ?? [])];
  const jobs = [...(input?.jobs ?? [])];

  const tableCalls: string[] = [];
  const workflowInstanceInsertCalls: Array<Record<string, unknown>> = [];
  const workflowMilestoneInsertCalls: Array<Array<Record<string, unknown>>> = [];
  const workflowJobLinkInsertCalls: Array<Array<Record<string, unknown>>> = [];

  const admin = {
    from: vi.fn((table: string) => {
      tableCalls.push(table);

      if (table === "service_cases") {
        let whereId = "";
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              if (column === "id") whereId = String(value ?? "").trim();
              return {
                maybeSingle: vi.fn(async () => ({
                  data: serviceCases.find((row) => row.id === whereId) ?? null,
                  error: null,
                })),
              };
            }),
          })),
        };
      }

      if (table === "customers") {
        let whereId = "";
        let whereOwnerId = "";

        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              if (column === "id") whereId = String(value ?? "").trim();
              if (column === "owner_user_id") whereOwnerId = String(value ?? "").trim();
              return {
                eq: vi.fn((nextColumn: string, nextValue: unknown) => {
                  if (nextColumn === "owner_user_id") {
                    whereOwnerId = String(nextValue ?? "").trim();
                  }
                  return {
                    maybeSingle: vi.fn(async () => ({
                      data:
                        customers.find(
                          (row) => row.id === whereId && row.owner_user_id === whereOwnerId,
                        ) ?? null,
                      error: null,
                    })),
                  };
                }),
                maybeSingle: vi.fn(async () => ({
                  data:
                    customers.find(
                      (row) => row.id === whereId && row.owner_user_id === whereOwnerId,
                    ) ?? null,
                  error: null,
                })),
              };
            }),
          })),
        };
      }

      if (table === "workflow_preset_templates") {
        let whereId = "";

        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              if (column === "id") whereId = String(value ?? "").trim();
              return {
                maybeSingle: vi.fn(async () => ({
                  data: presets.find((row) => row.id === whereId) ?? null,
                  error: null,
                })),
              };
            }),
          })),
        };
      }

      if (table === "workflow_instances") {
        const select = vi.fn(() => {
          let ownerId = "";
          let serviceCaseId = "";
          let templateId = "";
          let statuses: string[] = [];
          let limit = 100;

          const query: any = {
            eq: (column: unknown, value: unknown) => {
              if (column === "account_owner_user_id") {
                ownerId = String(value ?? "").trim();
              }
              if (column === "service_case_id") {
                serviceCaseId = String(value ?? "").trim();
              }
              if (column === "workflow_preset_template_id") {
                templateId = String(value ?? "").trim();
              }
              return query;
            },
            in: (column: unknown, value: unknown) => {
              if (column === "workflow_status" && Array.isArray(value)) {
                statuses = value.map((entry) => String(entry ?? "").trim());
              }
              return query;
            },
            order: () => query,
            limit: (value: unknown) => {
              limit = Number(value ?? 100);
              return query;
            },
            then: (resolve: (value: { data: Array<{ id: string }>; error: null }) => unknown, reject?: (reason: unknown) => unknown) => {
              const rows = workflowInstances
                .filter((row) => (ownerId ? row.account_owner_user_id === ownerId : true))
                .filter((row) => (serviceCaseId ? row.service_case_id === serviceCaseId : true))
                .filter((row) => (templateId ? row.workflow_preset_template_id === templateId : true))
                .filter((row) => (statuses.length > 0 ? statuses.includes(row.workflow_status) : true))
                .slice(0, limit)
                .map((row) => ({ id: row.id }));

              return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
            },
          };

          return query;
        });

        const insert = vi.fn((payload: Record<string, unknown>) => {
          workflowInstanceInsertCalls.push(payload);

          const id = `wf-${workflowInstances.length + 1}`;
          workflowInstances.push({
            id,
            account_owner_user_id: String(payload.account_owner_user_id ?? "").trim(),
            service_case_id: String(payload.service_case_id ?? "").trim(),
            workflow_preset_template_id: String(payload.workflow_preset_template_id ?? "").trim() || null,
            workflow_status: String(payload.workflow_status ?? "active").trim(),
          });

          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id }, error: null })),
            })),
          };
        });

        return {
          select,
          insert,
        };
      }

      if (table === "workflow_instance_milestones") {
        const select = vi.fn((_columns: string, options?: { count?: string; head?: boolean }) => {
          let ownerId = "";
          let workflowInstanceId = "";

          const query = makeThenable(
            () => {
              const scoped = workflowMilestones.filter(
                (row) =>
                  (!ownerId || row.account_owner_user_id === ownerId)
                  && (!workflowInstanceId || row.workflow_instance_id === workflowInstanceId),
              );

              if (options?.head) {
                return { data: null, error: null, count: scoped.length };
              }

              return { data: scoped, error: null };
            },
            {
              eq: (column: unknown, value: unknown) => {
                if (column === "account_owner_user_id") {
                  ownerId = String(value ?? "").trim();
                }
                if (column === "workflow_instance_id") {
                  workflowInstanceId = String(value ?? "").trim();
                }
                return query;
              },
            },
          );

          return query;
        });

        const insert = vi.fn((payload: Array<Record<string, unknown>>) => {
          workflowMilestoneInsertCalls.push(payload);
          for (const row of payload) {
            workflowMilestones.push({
              id: `ms-${workflowMilestones.length + 1}`,
              account_owner_user_id: String(row.account_owner_user_id ?? "").trim(),
              workflow_instance_id: String(row.workflow_instance_id ?? "").trim(),
            });
          }

          return Promise.resolve({ error: null });
        });

        return {
          select,
          insert,
        };
      }

      if (table === "workflow_instance_job_links") {
        const select = vi.fn((_columns: string, options?: { count?: string; head?: boolean }) => {
          let ownerId = "";
          let workflowInstanceId = "";

          const query = makeThenable(
            () => {
              const scoped = workflowJobLinks.filter(
                (row) =>
                  (!ownerId || row.account_owner_user_id === ownerId)
                  && (!workflowInstanceId || row.workflow_instance_id === workflowInstanceId),
              );

              if (options?.head) {
                return { data: null, error: null, count: scoped.length };
              }

              return { data: scoped, error: null };
            },
            {
              eq: (column: unknown, value: unknown) => {
                if (column === "account_owner_user_id") {
                  ownerId = String(value ?? "").trim();
                }
                if (column === "workflow_instance_id") {
                  workflowInstanceId = String(value ?? "").trim();
                }
                return query;
              },
            },
          );

          return query;
        });

        const insert = vi.fn((payload: Array<Record<string, unknown>>) => {
          workflowJobLinkInsertCalls.push(payload);
          for (const row of payload) {
            workflowJobLinks.push({
              id: `lnk-${workflowJobLinks.length + 1}`,
              account_owner_user_id: String(row.account_owner_user_id ?? "").trim(),
              workflow_instance_id: String(row.workflow_instance_id ?? "").trim(),
            });
          }

          return Promise.resolve({ error: null });
        });

        return {
          select,
          insert,
        };
      }

      if (table === "jobs") {
        let jobId = "";
        let includeDeleted = false;

        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              if (column === "id") {
                jobId = String(value ?? "").trim();
              }

              return {
                is: vi.fn((isColumn: string, isValue: unknown) => {
                  if (isColumn === "deleted_at" && isValue === null) {
                    includeDeleted = false;
                  }

                  return {
                    maybeSingle: vi.fn(async () => {
                      const row = jobs.find((candidate) => {
                        if (candidate.id !== jobId) return false;
                        if (!includeDeleted && candidate.deleted_at != null) return false;
                        return true;
                      });

                      return { data: row ?? null, error: null };
                    }),
                  };
                }),
              };
            }),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),

    _tableCalls: tableCalls,
    _workflowInstanceInsertCalls: workflowInstanceInsertCalls,
    _workflowMilestoneInsertCalls: workflowMilestoneInsertCalls,
    _workflowJobLinkInsertCalls: workflowJobLinkInsertCalls,
    _workflowInstances: workflowInstances,
    _presets: presets,
  };

  return admin;
}

const { assignWorkflowPresetToServiceCase } = await import("@/lib/workflows/actions");

describe("assignWorkflowPresetToServiceCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  it("creates one workflow instance and milestone rows from preset snapshot", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [
            { key: "install", display_name: "Install work", sort_order: 20 },
            { key: "permit", display_name: "Permit", sort_order: 10 },
          ],
          updated_at: "2026-05-30T00:00:00.000Z",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      created: true,
      milestoneCount: 2,
      linkedJobCount: 0,
    });

    expect(admin._workflowInstanceInsertCalls).toHaveLength(1);
    expect(admin._workflowMilestoneInsertCalls).toHaveLength(1);

    const insertedInstance = admin._workflowInstanceInsertCalls[0];
    expect(insertedInstance).toMatchObject({
      account_owner_user_id: "owner-1",
      service_case_id: "case-1",
      workflow_preset_template_id: "tpl-1",
      workflow_name_snapshot: "Install with Permit",
      workflow_status: "active",
      progress_percent: 0,
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
    });

    expect((insertedInstance.template_snapshot_json as any)).toMatchObject({
      template_id: "tpl-1",
      template_name: "Install with Permit",
      template_lifecycle_status: "active",
      template_updated_at: "2026-05-30T00:00:00.000Z",
      milestone_definitions: [
        {
          milestone_key: "permit",
          display_name: "Permit",
          sort_order: 0,
        },
        {
          milestone_key: "install",
          display_name: "Install work",
          sort_order: 1,
        },
      ],
    });

    const insertedMilestones = admin._workflowMilestoneInsertCalls[0];
    expect(insertedMilestones).toHaveLength(2);
    expect(insertedMilestones[0]).toMatchObject({
      milestone_key: "permit",
      milestone_title: "Permit",
      sort_order: 0,
      milestone_status: "ready",
    });
    expect(insertedMilestones[1]).toMatchObject({
      milestone_key: "install",
      milestone_title: "Install work",
      sort_order: 1,
      milestone_status: "planned",
    });
  });

  it("is idempotent for existing active service_case + preset assignment", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [{ key: "permit", display_name: "Permit" }],
        },
      ],
      workflowInstances: [
        {
          id: "wf-existing",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-existing",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-existing",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-existing",
      created: false,
      milestoneCount: 1,
      linkedJobCount: 0,
    });
    expect(admin._workflowInstanceInsertCalls).toHaveLength(0);
    expect(admin._workflowMilestoneInsertCalls).toHaveLength(0);
  });

  it("keeps snapshot frozen by refusing duplicate re-assignment after preset edits", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Original Template Name",
          lifecycle_status: "active",
          milestone_definition_json: [{ key: "permit", display_name: "Original Permit" }],
          updated_at: "2026-05-30T10:00:00.000Z",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const first = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });
    expect(first.success).toBe(true);
    expect(first.success && first.created).toBe(true);

    admin._presets[0] = {
      ...admin._presets[0],
      template_name: "Edited Template Name",
      milestone_definition_json: [{ key: "permit", display_name: "Edited Permit" }],
      updated_at: "2026-05-30T11:00:00.000Z",
    };

    const second = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(second).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      created: false,
      milestoneCount: 1,
      linkedJobCount: 0,
    });

    expect(admin._workflowInstanceInsertCalls).toHaveLength(1);
    expect(admin._workflowMilestoneInsertCalls).toHaveLength(1);
  });

  it("rejects cross-account service_case", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-2" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [],
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(result).toEqual({
      success: false,
      error: "service_case_id not found in this account.",
    });
  });

  it("rejects cross-account preset", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-2",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [],
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(result).toEqual({
      success: false,
      error: "workflow_preset_template_id is out of account scope.",
    });
  });

  it("rejects inactive or archived preset", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "archived",
          milestone_definition_json: [],
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(result).toEqual({
      success: false,
      error: "workflow preset template must be active.",
    });
  });

  it("links explicit jobs when all jobs match account + service case scope", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [],
        },
      ],
      jobs: [
        { id: "job-1", customer_id: "cust-1", service_case_id: "case-1", deleted_at: null },
        { id: "job-2", customer_id: "cust-1", service_case_id: "case-1", deleted_at: null },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
      explicitJobIds: ["job-1", "job-2", "job-2"],
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      created: true,
      milestoneCount: 0,
      linkedJobCount: 2,
    });

    expect(admin._workflowJobLinkInsertCalls).toHaveLength(1);
    expect(admin._workflowJobLinkInsertCalls[0]).toHaveLength(2);
    expect(admin._workflowJobLinkInsertCalls[0][0]).toMatchObject({
      workflow_instance_id: "wf-1",
      job_id: "job-1",
      link_role: "supporting",
      is_primary: false,
    });
  });

  it("rejects explicit job ids that do not belong to the service case", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [],
        },
      ],
      jobs: [
        { id: "job-1", customer_id: "cust-1", service_case_id: "case-2", deleted_at: null },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
      explicitJobIds: ["job-1"],
    });

    expect(result).toEqual({
      success: false,
      error: "job_id job-1 must belong to service_case_id case-1.",
    });
  });

  it("does not touch job/service-case status, job_events, or billing/sms/qbo/portal dependencies", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [{ key: "permit", display_name: "Permit" }],
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(result.success).toBe(true);

    const forbiddenTables = [
      "job_events",
      "internal_invoices",
      "internal_invoice_payments",
      "internal_invoice_payment_allocations",
      "customer_saved_payment_methods",
      "stripe_webhook_events",
      "outbound_sms_messages",
      "qbo_sync_events",
      "portal_notifications",
    ];

    for (const table of forbiddenTables) {
      expect(admin._tableCalls).not.toContain(table);
    }
  });
});
