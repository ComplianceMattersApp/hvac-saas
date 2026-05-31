import { describe, expect, it } from "vitest";

import {
  getWorkflowInstanceWithMilestones,
  listActiveWorkflowInstancesByServiceCase,
  listLinkedJobsForWorkflow,
  listWorkflowInstanceMilestones,
} from "@/lib/workflows/read-model";

const ACCOUNT_OWNER = "owner-1";

type MockRow = Record<string, any>;

function makeSupabaseMock(rowsByTable: Record<string, MockRow[]>) {
  const calls: Array<{ table: string; op: string; column?: string; value?: unknown }> = [];

  const disallowedTables = new Set([
    "internal_invoices",
    "internal_invoice_payments",
    "internal_invoice_payment_allocations",
    "sms_message_intents",
    "sms_provider_deliveries",
    "tenant_customer_payment_methods",
    "tenant_stripe_customers",
    "qbo_sync_events",
    "portal_tokens",
  ]);

  const supabase = {
    from(table: string) {
      calls.push({ table, op: "from" });
      if (disallowedTables.has(table)) {
        throw new Error(`workflow read model must not query ${table}`);
      }

      const rows = rowsByTable[table] ?? [];
      const eqFilters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      const orderings: Array<[string, boolean]> = [];
      let limitValue: number | null = null;

      const exec = () => {
        let data = [...rows];

        for (const [column, value] of eqFilters) {
          data = data.filter((row) => row[column] === value);
        }

        for (const [column, values] of inFilters) {
          data = data.filter((row) => values.includes(row[column]));
        }

        if (orderings.length > 0) {
          data.sort((a, b) => {
            for (const [column, ascending] of orderings) {
              const av = a[column];
              const bv = b[column];
              if (av === bv) continue;
              if (av == null) return ascending ? -1 : 1;
              if (bv == null) return ascending ? 1 : -1;
              if (typeof av === "boolean" && typeof bv === "boolean") {
                return ascending ? Number(av) - Number(bv) : Number(bv) - Number(av);
              }
              if (av < bv) return ascending ? -1 : 1;
              return ascending ? 1 : -1;
            }
            return 0;
          });
        }

        if (limitValue !== null) {
          data = data.slice(0, limitValue);
        }

        return { data, error: null };
      };

      const build = (): any => ({
        select: (value: string) => {
          calls.push({ table, op: "select", value });
          return build();
        },
        eq: (column: string, value: unknown) => {
          calls.push({ table, op: "eq", column, value });
          eqFilters.push([column, value]);
          return build();
        },
        in: (column: string, values: unknown[]) => {
          calls.push({ table, op: "in", column, value: values });
          inFilters.push([column, values]);
          return build();
        },
        order: (column: string, value?: { ascending?: boolean }) => {
          calls.push({ table, op: "order", column, value });
          orderings.push([column, value?.ascending !== false]);
          return build();
        },
        limit: (value: number) => {
          calls.push({ table, op: "limit", value });
          limitValue = value;
          return build();
        },
        maybeSingle: async () => {
          const result = exec();
          return { data: result.data[0] ?? null, error: result.error };
        },
        then: (resolve: any, reject?: any) => Promise.resolve(exec()).then(resolve, reject),
      });

      return build();
    },
  };

  return { supabase, calls };
}

function makeInstance(input: Partial<MockRow> & { id: string }): MockRow {
  return {
    account_owner_user_id: ACCOUNT_OWNER,
    service_case_id: "case-1",
    workflow_preset_template_id: "tpl-1",
    workflow_name_snapshot: "Install with Permit",
    workflow_status: "active",
    progress_percent: 0,
    template_snapshot_json: {
      template_name: "Install with Permit",
      version: 1,
      milestones: [{ key: "install", title: "Install work" }],
    },
    created_at: "2026-05-30T10:00:00Z",
    updated_at: "2026-05-30T10:00:00Z",
    ...input,
  };
}

function makeMilestone(input: Partial<MockRow> & { id: string }): MockRow {
  return {
    account_owner_user_id: ACCOUNT_OWNER,
    workflow_instance_id: "wf-1",
    milestone_key: null,
    milestone_title: `Milestone ${input.id}`,
    milestone_description: null,
    sort_order: 0,
    milestone_status: "planned",
    status_reason: null,
    metadata_json: null,
    created_at: "2026-05-30T10:00:00Z",
    updated_at: "2026-05-30T10:00:00Z",
    ...input,
  };
}

function makeLink(input: Partial<MockRow> & { id: string }): MockRow {
  return {
    account_owner_user_id: ACCOUNT_OWNER,
    workflow_instance_id: "wf-1",
    workflow_instance_milestone_id: "ms-1",
    job_id: "job-1",
    link_role: "primary",
    is_primary: true,
    notes: null,
    created_at: "2026-05-30T10:00:00Z",
    jobs: {
      id: "job-1",
      service_case_id: "case-1",
      title: "Install Day 1",
      status: "open",
      ops_status: "scheduled",
      scheduled_date: "2026-06-02",
      created_at: "2026-05-30T10:00:00Z",
    },
    ...input,
  };
}

describe("workflow read model", () => {
  it("returns safe-empty results when scope inputs are missing", async () => {
    const { supabase, calls } = makeSupabaseMock({
      workflow_instances: [makeInstance({ id: "wf-1" })],
      workflow_instance_milestones: [makeMilestone({ id: "ms-1" })],
      workflow_instance_job_links: [makeLink({ id: "lnk-1" })],
    });

    await expect(
      listActiveWorkflowInstancesByServiceCase({
        supabase,
        accountOwnerUserId: "",
        serviceCaseId: "case-1",
      }),
    ).resolves.toEqual([]);

    await expect(
      listWorkflowInstanceMilestones({
        supabase,
        accountOwnerUserId: ACCOUNT_OWNER,
        workflowInstanceId: "",
      }),
    ).resolves.toEqual([]);

    await expect(
      listLinkedJobsForWorkflow({
        supabase,
        accountOwnerUserId: null,
        workflowInstanceId: "wf-1",
      }),
    ).resolves.toEqual([]);

    await expect(
      getWorkflowInstanceWithMilestones({
        supabase,
        accountOwnerUserId: undefined,
        workflowInstanceId: "wf-1",
      }),
    ).resolves.toEqual({ instance: null, milestones: [] });

    expect(calls).toEqual([]);
  });

  it("applies account + service case scope when listing active workflow instances", async () => {
    const { supabase } = makeSupabaseMock({
      workflow_instances: [
        makeInstance({
          id: "wf-1",
          service_case_id: "case-1",
          workflow_status: "active",
          created_at: "2026-05-30T10:00:00Z",
        }),
        makeInstance({
          id: "wf-2",
          service_case_id: "case-1",
          workflow_status: "paused",
          created_at: "2026-05-30T11:00:00Z",
        }),
        makeInstance({ id: "wf-3", service_case_id: "case-1", workflow_status: "archived" }),
        makeInstance({ id: "wf-4", service_case_id: "case-2", workflow_status: "active" }),
        makeInstance({ id: "wf-5", account_owner_user_id: "owner-2", service_case_id: "case-1" }),
      ],
    });

    const rows = await listActiveWorkflowInstancesByServiceCase({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      serviceCaseId: "case-1",
    });

    expect(rows.map((row) => row.id)).toEqual(["wf-2", "wf-1"]);
  });

  it("orders milestones by sort_order then created_at", async () => {
    const { supabase } = makeSupabaseMock({
      workflow_instance_milestones: [
        makeMilestone({ id: "ms-3", sort_order: 2, created_at: "2026-05-30T10:03:00Z" }),
        makeMilestone({ id: "ms-1", sort_order: 1, created_at: "2026-05-30T10:05:00Z" }),
        makeMilestone({ id: "ms-2", sort_order: 1, created_at: "2026-05-30T10:04:00Z" }),
        makeMilestone({ id: "ms-out", account_owner_user_id: "owner-2" }),
      ],
    });

    const rows = await listWorkflowInstanceMilestones({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      workflowInstanceId: "wf-1",
    });

    expect(rows.map((row) => row.id)).toEqual(["ms-2", "ms-1", "ms-3"]);
  });

  it("lists linked jobs for workflow instance and optional milestone filter", async () => {
    const { supabase } = makeSupabaseMock({
      workflow_instance_job_links: [
        makeLink({ id: "lnk-1", workflow_instance_milestone_id: "ms-1", is_primary: true }),
        makeLink({
          id: "lnk-2",
          workflow_instance_milestone_id: "ms-2",
          is_primary: false,
          job_id: "job-2",
          jobs: {
            id: "job-2",
            service_case_id: "case-1",
            title: "Final inspection",
            status: "open",
            ops_status: "need_to_schedule",
            scheduled_date: null,
            created_at: "2026-05-30T11:00:00Z",
          },
        }),
      ],
    });

    const allRows = await listLinkedJobsForWorkflow({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      workflowInstanceId: "wf-1",
    });

    const milestoneRows = await listLinkedJobsForWorkflow({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      workflowInstanceId: "wf-1",
      milestoneId: "ms-2",
    });

    expect(allRows.map((row) => row.id)).toEqual(["lnk-1", "lnk-2"]);
    expect(milestoneRows.map((row) => row.id)).toEqual(["lnk-2"]);
    expect(milestoneRows[0]?.job).toMatchObject({
      id: "job-2",
      title: "Final inspection",
      ops_status: "need_to_schedule",
    });
  });

  it("returns frozen template snapshot from assigned workflow instance metadata", async () => {
    const { supabase, calls } = makeSupabaseMock({
      workflow_instances: [
        makeInstance({
          id: "wf-1",
          template_snapshot_json: {
            template_name: "Install with Permit",
            version: 3,
            milestones: [
              { key: "install", title: "Install work" },
              { key: "inspection", title: "Final inspection" },
            ],
          },
        }),
      ],
      workflow_instance_milestones: [makeMilestone({ id: "ms-1" })],
      workflow_preset_templates: [
        {
          id: "tpl-1",
          account_owner_user_id: ACCOUNT_OWNER,
          template_name: "Install with Permit (renamed later)",
          lifecycle_status: "active",
          milestone_definition_json: [{ key: "different" }],
        },
      ],
    });

    const result = await getWorkflowInstanceWithMilestones({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      workflowInstanceId: "wf-1",
    });

    expect(result.instance?.template_snapshot_json).toMatchObject({
      template_name: "Install with Permit",
      version: 3,
    });
    expect(calls.some((call) => call.table === "workflow_preset_templates")).toBe(false);
  });

  it("does not imply job status changes from workflow records", async () => {
    const { supabase } = makeSupabaseMock({
      workflow_instances: [
        makeInstance({ id: "wf-1", workflow_status: "active" }),
      ],
      workflow_instance_milestones: [
        makeMilestone({ id: "ms-1", milestone_status: "completed" }),
      ],
      workflow_instance_job_links: [
        makeLink({
          id: "lnk-1",
          workflow_instance_milestone_id: "ms-1",
          jobs: {
            id: "job-1",
            service_case_id: "case-1",
            title: "Install work",
            status: "open",
            ops_status: "failed",
            scheduled_date: "2026-06-02",
            created_at: "2026-05-30T10:00:00Z",
          },
        }),
      ],
      jobs: [
        {
          id: "job-1",
          service_case_id: "case-1",
          status: "open",
          ops_status: "failed",
        },
      ],
    });

    const [workflowResult, linkedJobs] = await Promise.all([
      getWorkflowInstanceWithMilestones({
        supabase,
        accountOwnerUserId: ACCOUNT_OWNER,
        workflowInstanceId: "wf-1",
      }),
      listLinkedJobsForWorkflow({
        supabase,
        accountOwnerUserId: ACCOUNT_OWNER,
        workflowInstanceId: "wf-1",
      }),
    ]);

    expect(workflowResult.instance?.workflow_status).toBe("active");
    expect(workflowResult.milestones[0]?.milestone_status).toBe("completed");
    expect(linkedJobs[0]?.job.status).toBe("open");
    expect(linkedJobs[0]?.job.ops_status).toBe("failed");
  });

  it("returns null instance + empty milestones for missing workflow within scope", async () => {
    const { supabase } = makeSupabaseMock({
      workflow_instances: [makeInstance({ id: "wf-1" })],
      workflow_instance_milestones: [makeMilestone({ id: "ms-1" })],
    });

    const result = await getWorkflowInstanceWithMilestones({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      workflowInstanceId: "wf-unknown",
    });

    expect(result).toEqual({ instance: null, milestones: [] });
  });
});