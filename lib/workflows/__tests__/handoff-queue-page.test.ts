import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const getRequestActorContextMock = vi.fn();
const listOpenWorkflowHandoffRequestsForInstallerAccountMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: Record<string, unknown>) =>
    createElement("a", { href, ...props }, children as any),
}));

vi.mock("@/components/SubmitButton", () => ({
  default: ({ children, loadingText: _loadingText, ...props }: Record<string, unknown>) =>
    createElement("button", props, children as any),
}));

vi.mock("@/lib/auth/request-actor-context", () => ({
  getRequestActorContext: (...args: unknown[]) => getRequestActorContextMock(...args),
}));

vi.mock("@/lib/workflows/workflow-handoff-requests-read", () => ({
  listOpenWorkflowHandoffRequestsForInstallerAccount: (...args: unknown[]) =>
    listOpenWorkflowHandoffRequestsForInstallerAccountMock(...args),
}));

vi.mock("@/lib/workflows/actions", () => ({
  respondToWorkflowHandoffRequestFromForm: vi.fn(),
}));

describe("Ops handoff queue page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getRequestActorContextMock.mockResolvedValue({
      supabase: {},
      user: { id: "user-1" },
      kind: "internal",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  it("renders sent request actions Accept Mark complete and Reject", async () => {
    listOpenWorkflowHandoffRequestsForInstallerAccountMock.mockResolvedValue([
      {
        id: "request-1",
        installer_account_owner_user_id: "owner-1",
        workflow_instance_id: "workflow-1",
        workflow_instance_milestone_id: "milestone-1",
        service_case_id: "service-case-1",
        source_job_id: "job-1",
        authorized_handoff_recipient_id: "recipient-1",
        recipient_type_snapshot: "external_manual",
        recipient_display_name_snapshot: "Smoke Rater A",
        handoff_kind: "ecc",
        handoff_status: "sent",
        sent_by_user_id: "user-2",
        sent_at: "2026-05-31T18:00:00.000Z",
        responded_by_user_id: null,
        responded_at: null,
        response_note: null,
        evidence_reference: null,
        created_at: "2026-05-31T18:00:00.000Z",
        updated_at: "2026-05-31T18:00:00.000Z",
      },
    ]);

    const pageModule = await import("@/app/ops/handoffs/page");
    const markup = renderToStaticMarkup(await pageModule.default({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("Smoke Rater A");
    expect(markup).toContain("Accept");
    expect(markup).toContain("Mark complete");
    expect(markup).toContain("Reject");
    expect(markup).toContain("Job job-1");
  });

  it("renders accepted request without Accept and keeps Mark complete and Reject", async () => {
    listOpenWorkflowHandoffRequestsForInstallerAccountMock.mockResolvedValue([
      {
        id: "request-2",
        installer_account_owner_user_id: "owner-1",
        workflow_instance_id: "workflow-1",
        workflow_instance_milestone_id: "milestone-1",
        service_case_id: "service-case-1",
        source_job_id: "job-1",
        authorized_handoff_recipient_id: "recipient-1",
        recipient_type_snapshot: "external_manual",
        recipient_display_name_snapshot: "Smoke Rater B",
        handoff_kind: "ecc",
        handoff_status: "accepted",
        sent_by_user_id: "user-2",
        sent_at: "2026-05-31T18:00:00.000Z",
        responded_by_user_id: "user-3",
        responded_at: "2026-05-31T18:10:00.000Z",
        response_note: "Accepted for review.",
        evidence_reference: null,
        created_at: "2026-05-31T18:00:00.000Z",
        updated_at: "2026-05-31T18:10:00.000Z",
      },
    ]);

    const pageModule = await import("@/app/ops/handoffs/page");
    const markup = renderToStaticMarkup(await pageModule.default({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("Smoke Rater B");
    expect(markup).not.toContain("Accept</button>");
    expect(markup).toContain("Mark complete");
    expect(markup).toContain("Reject");
    expect(markup).toContain("Response note: Accepted for review.");
  });

  it("renders empty state when no open requests exist", async () => {
    listOpenWorkflowHandoffRequestsForInstallerAccountMock.mockResolvedValue([]);

    const pageModule = await import("@/app/ops/handoffs/page");
    const markup = renderToStaticMarkup(await pageModule.default({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("No open handoff requests.");
  });

  it("redirects unauthenticated users to login", async () => {
    getRequestActorContextMock.mockResolvedValue({
      supabase: {},
      user: null,
      kind: "unauthenticated",
      internalUser: null,
    });

    const pageModule = await import("@/app/ops/handoffs/page");

    await expect(
      pageModule.default({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects contractor users to portal", async () => {
    getRequestActorContextMock.mockResolvedValue({
      supabase: {},
      user: { id: "contractor-1" },
      kind: "contractor",
      internalUser: null,
    });

    const pageModule = await import("@/app/ops/handoffs/page");

    await expect(
      pageModule.default({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/portal");
  });
});