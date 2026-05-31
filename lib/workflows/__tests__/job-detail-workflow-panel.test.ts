import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const createClientMock = vi.fn();
const loadScopedInternalJobDetailReadBoundaryMock = vi.fn();
const listActiveWorkflowInstancesByServiceCaseMock = vi.fn();
const listLinkedJobsForWorkflowMock = vi.fn();
const listWorkflowInstanceMilestonesMock = vi.fn();
const resolveActiveAuthorizedHandoffRecipientSelectionMock = vi.fn();

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
  listLinkedJobsForWorkflow: (...args: unknown[]) =>
    listLinkedJobsForWorkflowMock(...args),
  listWorkflowInstanceMilestones: (...args: unknown[]) =>
    listWorkflowInstanceMilestonesMock(...args),
}));

vi.mock("@/lib/workflows/authorized-handoff-recipients-read", () => ({
  resolveActiveAuthorizedHandoffRecipientSelection: (...args: unknown[]) =>
    resolveActiveAuthorizedHandoffRecipientSelectionMock(...args),
}));

vi.mock("@/lib/workflows/actions", () => ({
  updateWorkflowMilestoneStatusFromForm: vi.fn(async () => undefined),
  assignInstallWithPermitWorkflowForJobFromForm: vi.fn(async () => undefined),
  linkInternalEccJobToWorkflowMilestoneFromForm: vi.fn(async () => undefined),
  confirmLinkedInternalEccCompletionForWorkflowMilestoneFromForm: vi.fn(async () => undefined),
  recordExternalEccCompletionForWorkflowMilestoneFromForm: vi.fn(async () => undefined),
  sendWorkflowEccMilestoneToAuthorizedRaterFromForm: vi.fn(async () => undefined),
}));

const DeferredWorkflowMilestonesPanelBody = (
  await import("@/app/jobs/[id]/_components/DeferredWorkflowMilestonesPanelBody")
).default;

describe("DeferredWorkflowMilestonesPanelBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== "jobs") {
          throw new Error(`Unexpected table ${table}`);
        }

        const query: any = {
          select: () => query,
          eq: () => query,
          is: () => query,
          order: () => query,
          limit: () => query,
          then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve, reject),
        };

        return query;
      }),
    });
    loadScopedInternalJobDetailReadBoundaryMock.mockResolvedValue({ id: "job-1" });
    listLinkedJobsForWorkflowMock.mockResolvedValue([]);
    resolveActiveAuthorizedHandoffRecipientSelectionMock.mockResolvedValue({
      mode: "none",
      recipients: [],
      defaultRecipientId: null,
      preselectedRecipientId: null,
    });
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
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
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

    expect(listLinkedJobsForWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        workflowInstanceId: "wf-1",
      }),
    );

    expect(html).toContain("Install Workflow");
    expect(html).toContain("1 of 2 complete");
    expect(html).toContain("Permit");
    expect(html).toContain("Install");
    expect(html).toContain("More actions");
    expect(html).toContain("Update milestone status");
    expect(html).toContain("Save");
  });

  it("shows ECC external completion action for incomplete ECC milestone", async () => {
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
        id: "ms-ecc",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "ecc_handoff_completion",
        milestone_title: "ECC handoff/completion",
        milestone_description: null,
        sort_order: 0,
        milestone_status: "in_progress",
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
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("No authorized ECC rater is set up yet.");
    expect(html).toContain("Set up authorized raters");
    expect(html).toContain("Record external ECC completion");
    expect(html).toContain("name=\"completion_note\"");
    expect(html).toContain("required");
    expect(html).toContain("name=\"evidence_reference\"");
  });

  it("shows one-click send action when exactly one active authorized ECC rater exists", async () => {
    resolveActiveAuthorizedHandoffRecipientSelectionMock.mockResolvedValue({
      mode: "single",
      recipients: [
        {
          id: "ahr-1",
          recipient_type: "external_manual",
          display_name: "Acme Ratings",
          is_default: true,
          is_active: true,
        },
      ],
      defaultRecipientId: "ahr-1",
      preselectedRecipientId: "ahr-1",
    });

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
        id: "ms-ecc",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "ecc_handoff_completion",
        milestone_title: "ECC handoff/completion",
        milestone_description: null,
        sort_order: 0,
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
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Send to Acme Ratings");
    expect(html).toContain("name=\"authorized_recipient_id\"");
    expect(html).toContain("Record external ECC completion");
  });

  it("shows recipient selector when multiple active authorized ECC raters exist", async () => {
    resolveActiveAuthorizedHandoffRecipientSelectionMock.mockResolvedValue({
      mode: "multiple",
      recipients: [
        {
          id: "ahr-1",
          recipient_type: "external_manual",
          display_name: "Acme Ratings",
          is_default: true,
          is_active: true,
        },
        {
          id: "ahr-2",
          recipient_type: "external_manual",
          display_name: "Golden State Rater",
          is_default: false,
          is_active: true,
        },
      ],
      defaultRecipientId: "ahr-1",
      preselectedRecipientId: "ahr-1",
    });

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
        id: "ms-ecc",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "ecc_handoff_completion",
        milestone_title: "ECC handoff/completion",
        milestone_description: null,
        sort_order: 0,
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
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Choose authorized rater");
    expect(html).toContain("Send to rater");
    expect(html).toContain("Acme Ratings");
    expect(html).toContain("Golden State Rater");
  });

  it("shows Link internal ECC job when eligible ECC jobs exist for the service case", async () => {
    createClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== "jobs") throw new Error(`Unexpected table ${table}`);

        const query: any = {
          select: () => query,
          eq: () => query,
          is: () => query,
          order: () => query,
          limit: () => query,
          then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({
              data: [
                {
                  id: "job-ecc-1",
                  job_display_number: "2042",
                  title: "ECC Alteration Test",
                  ops_status: "need_to_schedule",
                },
              ],
              error: null,
            }).then(resolve, reject),
        };

        return query;
      }),
    });

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
        id: "ms-ecc",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "ecc_handoff_completion",
        milestone_title: "ECC handoff/completion",
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
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Link internal ECC job");
    expect(html).toContain("Select ECC job");
    expect(html).toContain("Job #2042");
  });

  it("renders linked ECC job reference after link exists", async () => {
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
        id: "ms-ecc",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "ecc_handoff_completion",
        milestone_title: "ECC handoff/completion",
        milestone_description: null,
        sort_order: 1,
        milestone_status: "ready",
        status_reason: null,
        metadata_json: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    listLinkedJobsForWorkflowMock.mockResolvedValue([
      {
        id: "lnk-1",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        workflow_instance_milestone_id: "ms-ecc",
        job_id: "job-ecc-1",
        link_role: "supporting",
        is_primary: false,
        notes: null,
        created_at: "",
        job: {
          id: "job-ecc-1",
          job_display_number: "2042",
          service_case_id: "case-1",
          title: "ECC Alteration Test",
          status: "open",
          ops_status: "need_to_schedule",
          field_complete: false,
          scheduled_date: null,
          created_at: "",
        },
      },
    ]);

    const jsx = await DeferredWorkflowMilestonesPanelBody({
      accountOwnerUserId: "owner-1",
      currentJobId: "job-1",
      serviceCaseId: "case-1",
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Linked ECC job:");
    expect(html).toContain("Job #2042");
    expect(html).toContain("ECC Alteration Test");
    expect(html).not.toContain("No internal ECC job found in this service case yet.");
  });

  it("renders no-eligible-ECC-job helper when none exist", async () => {
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
        id: "ms-ecc",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "ecc_handoff_completion",
        milestone_title: "ECC handoff/completion",
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
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("No internal ECC job found in this service case yet. Create the ECC job through the normal job flow, then link it here.");
  });

  it("shows not-complete-yet helper when linked ECC job is not complete", async () => {
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
        id: "ms-ecc",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "ecc_handoff_completion",
        milestone_title: "ECC handoff/completion",
        milestone_description: null,
        sort_order: 1,
        milestone_status: "ready",
        status_reason: null,
        metadata_json: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    listLinkedJobsForWorkflowMock.mockResolvedValue([
      {
        id: "lnk-1",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        workflow_instance_milestone_id: "ms-ecc",
        job_id: "job-ecc-1",
        link_role: "supporting",
        is_primary: false,
        notes: null,
        created_at: "",
        job: {
          id: "job-ecc-1",
          job_display_number: "2042",
          service_case_id: "case-1",
          title: "ECC Alteration Test",
          status: "open",
          ops_status: "need_to_schedule",
          field_complete: false,
          scheduled_date: null,
          created_at: "",
        },
      },
    ]);

    const jsx = await DeferredWorkflowMilestonesPanelBody({
      accountOwnerUserId: "owner-1",
      currentJobId: "job-1",
      serviceCaseId: "case-1",
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Linked ECC job is not complete yet.");
    expect(html).not.toContain("Review and complete ECC milestone");
  });

  it("shows review helper when linked ECC job is complete and milestone is not completed", async () => {
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
        id: "ms-ecc",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "ecc_handoff_completion",
        milestone_title: "ECC handoff/completion",
        milestone_description: null,
        sort_order: 1,
        milestone_status: "ready",
        status_reason: null,
        metadata_json: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    listLinkedJobsForWorkflowMock.mockResolvedValue([
      {
        id: "lnk-1",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        workflow_instance_milestone_id: "ms-ecc",
        job_id: "job-ecc-1",
        link_role: "supporting",
        is_primary: false,
        notes: null,
        created_at: "",
        job: {
          id: "job-ecc-1",
          job_display_number: "2042",
          service_case_id: "case-1",
          title: "ECC Alteration Test",
          status: "completed",
          ops_status: "invoice_required",
          field_complete: true,
          scheduled_date: null,
          created_at: "",
        },
      },
    ]);

    const jsx = await DeferredWorkflowMilestonesPanelBody({
      accountOwnerUserId: "owner-1",
      currentJobId: "job-1",
      serviceCaseId: "case-1",
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Linked ECC job appears complete. Review and complete ECC milestone.");
    expect(html).toContain("name=\"review_note\"");
    expect(html).toContain("Review and complete ECC milestone");
    expect(html).toContain("Record external ECC completion");
  });

  it("hides review helper when ECC milestone is already completed", async () => {
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
        id: "ms-ecc",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "ecc_handoff_completion",
        milestone_title: "ECC handoff/completion",
        milestone_description: null,
        sort_order: 1,
        milestone_status: "completed",
        status_reason: "Job #2042: Linked internal ECC job reviewed and completed.",
        metadata_json: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    listLinkedJobsForWorkflowMock.mockResolvedValue([
      {
        id: "lnk-1",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        workflow_instance_milestone_id: "ms-ecc",
        job_id: "job-ecc-1",
        link_role: "supporting",
        is_primary: false,
        notes: null,
        created_at: "",
        job: {
          id: "job-ecc-1",
          job_display_number: "2042",
          service_case_id: "case-1",
          title: "ECC Alteration Test",
          status: "completed",
          ops_status: "invoice_required",
          field_complete: true,
          scheduled_date: null,
          created_at: "",
        },
      },
    ]);

    const jsx = await DeferredWorkflowMilestonesPanelBody({
      accountOwnerUserId: "owner-1",
      currentJobId: "job-1",
      serviceCaseId: "case-1",
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).not.toContain("Linked ECC job is not complete yet.");
    expect(html).not.toContain("Review and complete ECC milestone");
    expect(html).toContain("Reason: Job #2042: Linked internal ECC job reviewed and completed.");
  });

  it("keeps external/manual and linked-job controls visible while waiting after send", async () => {
    resolveActiveAuthorizedHandoffRecipientSelectionMock.mockResolvedValue({
      mode: "single",
      recipients: [
        {
          id: "ahr-1",
          recipient_type: "external_manual",
          display_name: "Acme Ratings",
          is_default: true,
          is_active: true,
        },
      ],
      defaultRecipientId: "ahr-1",
      preselectedRecipientId: "ahr-1",
    });

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
        id: "ms-ecc",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "ecc_handoff_completion",
        milestone_title: "ECC handoff/completion",
        milestone_description: null,
        sort_order: 1,
        milestone_status: "waiting",
        status_reason: "Sent to authorized rater: Acme Ratings",
        metadata_json: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    listLinkedJobsForWorkflowMock.mockResolvedValue([
      {
        id: "lnk-1",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        workflow_instance_milestone_id: "ms-ecc",
        job_id: "job-ecc-1",
        link_role: "supporting",
        is_primary: false,
        notes: null,
        created_at: "",
        job: {
          id: "job-ecc-1",
          job_display_number: "2042",
          service_case_id: "case-1",
          title: "ECC Alteration Test",
          status: "completed",
          ops_status: "invoice_required",
          field_complete: true,
          scheduled_date: null,
          created_at: "",
        },
      },
    ]);

    const jsx = await DeferredWorkflowMilestonesPanelBody({
      accountOwnerUserId: "owner-1",
      currentJobId: "job-1",
      serviceCaseId: "case-1",
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Reason: Sent to authorized rater: Acme Ratings");
    expect(html).toContain("Sent to rater. Use linked-job review or external completion when the result is ready.");
    expect(html).toContain("Record external ECC completion");
    expect(html).toContain("Linked ECC job appears complete. Review and complete ECC milestone.");
    expect(html).not.toContain("Send to Acme Ratings");
  });

  it("does not show ECC external completion action for non-ECC milestones", async () => {
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
        id: "ms-install",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "install_work",
        milestone_title: "Install work",
        milestone_description: null,
        sort_order: 0,
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
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).not.toContain("Record external ECC completion");
  });

  it("hides ECC external completion action once ECC milestone is completed", async () => {
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
        id: "ms-ecc",
        account_owner_user_id: "owner-1",
        workflow_instance_id: "wf-1",
        milestone_key: "ecc_handoff_completion",
        milestone_title: "ECC handoff/completion",
        milestone_description: null,
        sort_order: 0,
        milestone_status: "completed",
        status_reason: "External ECC completion smoke test",
        metadata_json: null,
        created_at: "",
        updated_at: "",
      },
    ]);

    const jsx = await DeferredWorkflowMilestonesPanelBody({
      accountOwnerUserId: "owner-1",
      currentJobId: "job-1",
      serviceCaseId: "case-1",
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Reason: External ECC completion smoke test");
    expect(html).not.toContain("Record external ECC completion");
  });

  it("shows empty state when no active workflow is attached", async () => {
    listActiveWorkflowInstancesByServiceCaseMock.mockResolvedValue([]);
    listWorkflowInstanceMilestonesMock.mockResolvedValue([]);

    const jsx = await DeferredWorkflowMilestonesPanelBody({
      accountOwnerUserId: "owner-1",
      currentJobId: "job-1",
      serviceCaseId: "case-1",
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("No active workflow guidance is attached yet.");
    expect(html).toContain("Add Install with Permit workflow");
  });

  it("hides assignment action for non-owner/admin viewers", async () => {
    listActiveWorkflowInstancesByServiceCaseMock.mockResolvedValue([]);
    listWorkflowInstanceMilestonesMock.mockResolvedValue([]);

    const jsx = await DeferredWorkflowMilestonesPanelBody({
      accountOwnerUserId: "owner-1",
      currentJobId: "job-1",
      serviceCaseId: "case-1",
      canManageWorkflowGuidance: false,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("No active workflow guidance is attached yet.");
    expect(html).not.toContain("Add Install with Permit workflow");
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
      canManageWorkflowGuidance: true,
      returnToPath: "/jobs/job-1?tab=info#service-chain",
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Workflow guidance is not available yet for this environment.");
  });
});
