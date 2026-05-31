import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const createClientMock = vi.fn();
const loadScopedInternalJobDetailReadBoundaryMock = vi.fn();
const listActiveWorkflowInstancesByServiceCaseMock = vi.fn();
const listWorkflowInstanceMilestonesMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/actions/internal-job-detail-read-boundary", () => ({
  loadScopedInternalJobDetailReadBoundary: (...args: unknown[]) =>
    loadScopedInternalJobDetailReadBoundaryMock(...args),
}));

vi.mock("@/lib/workflows/read-model", () => ({
  WORKFLOW_MILESTONE_STATUSES: [
    "planned",
    "ready",
    "in_progress",
    "completed",
    "skipped",
    "blocked",
    "waiting",
    "needs_attention",
    "superseded",
  ],
  listActiveWorkflowInstancesByServiceCase: (...args: unknown[]) =>
    listActiveWorkflowInstancesByServiceCaseMock(...args),
  listWorkflowInstanceMilestones: (...args: unknown[]) =>
    listWorkflowInstanceMilestonesMock(...args),
}));

vi.mock("@/lib/workflows/actions", () => ({
  updateWorkflowMilestoneStatusFromForm: vi.fn(async () => undefined),
}));

const DeferredWorkflowMilestonesPanelBody = (
  await import("@/app/jobs/[id]/_components/DeferredWorkflowMilestonesPanelBody")
).default;

describe("DeferredWorkflowMilestonesPanelBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({ from: vi.fn() });
    loadScopedInternalJobDetailReadBoundaryMock.mockResolvedValue({ id: "job-1" });
  });

  it("reads active workflow milestones for the job service_case_id and renders compact progress", async () => {
    listActiveWorkflowInstancesByServiceCaseMock.mockResolvedValue([
      {
        id: "wf-1",
        account_owner_user_id: "owner-1",
        service_case_id: "case-1",
        workflow_preset_template_id: "tpl-1",
        workflow_name_snapshot: "Install Workflow",
        workflow_status: "active",
        progress_percent: 0,
        template_snapshot_json: {},
        created_at: "",
        updated_at: "",
      },
    ]);

    listWorkflowInstanceMilestonesMock.mockResolvedValue([
      {
        id: "ms-1",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "permit",
        milestone_title: "Permit",
        milestone_description: null,
        sort_order: 0,
        milestone_status: "completed",
        status_reason: null,
        metadata_json: null,
        created_at: "",
        updated_at: "",
      },
      {
        id: "ms-2",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "install",
        milestone_title: "Install",
        milestone_description: null,
        sort_order: 1,
        milestone_status: "ready",
        status_reason: null,
        metadata_json: null,
        created_at: "",
        updated_at: "",
      },
    ]);

    const jsx = await DeferredWorkflowMilestonesPanelBody({
      accountOwnerUserId: "owner-1",
      currentJobId: "job-1",
      serviceCaseId: "case-1",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);

    expect(listActiveWorkflowInstancesByServiceCaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        serviceCaseId: "case-1",
        includeArchived: false,
      }),
    );

    expect(listWorkflowInstanceMilestonesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        workflowInstanceId: "wf-1",
      }),
    );

    expect(html).toContain("Install Workflow");
    expect(html).toContain("1 of 2 complete");
    expect(html).toContain("Permit");
    expect(html).toContain("Install");
    expect(html).toContain("Save");
  });

  it("shows empty state when no active workflow is attached", async () => {
    listActiveWorkflowInstancesByServiceCaseMock.mockResolvedValue([]);
    listWorkflowInstanceMilestonesMock.mockResolvedValue([]);

    const jsx = await DeferredWorkflowMilestonesPanelBody({
      accountOwnerUserId: "owner-1",
      currentJobId: "job-1",
      serviceCaseId: "case-1",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("No active workflow guidance is attached yet.");
  });

  it("fails open when workflow tables are not yet available in schema cache", async () => {
    listActiveWorkflowInstancesByServiceCaseMock.mockRejectedValue({
      code: "PGRST205",
      details: null,
      hint: "Perhaps you meant the table 'public.internal_invoices'",
      message: "Could not find the table 'public.workflow_instances' in the schema cache",
    });

    const jsx = await DeferredWorkflowMilestonesPanelBody({
      accountOwnerUserId: "owner-1",
      currentJobId: "job-1",
      serviceCaseId: "case-1",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Workflow guidance is not available yet for this environment.");
  });
});
