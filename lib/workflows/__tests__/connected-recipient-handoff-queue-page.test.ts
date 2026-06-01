import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const getRequestActorContextMock = vi.fn();
const listActiveConnectedRecipientHandoffProjectionsForAccountMock = vi.fn();
const respondToConnectedRecipientHandoffRequestFromFormMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: Record<string, unknown>) =>
    createElement("a", { href, ...props }, children as any),
}));

vi.mock("@/lib/auth/request-actor-context", () => ({
  getRequestActorContext: (...args: unknown[]) => getRequestActorContextMock(...args),
}));

vi.mock("@/lib/workflows/connected-recipient-handoff-projection-read", () => ({
  listActiveConnectedRecipientHandoffProjectionsForAccount: (...args: unknown[]) =>
    listActiveConnectedRecipientHandoffProjectionsForAccountMock(...args),
}));

vi.mock("@/lib/workflows/connected-recipient-handoff-response-actions", () => ({
  respondToConnectedRecipientHandoffRequestFromForm: (...args: unknown[]) =>
    respondToConnectedRecipientHandoffRequestFromFormMock(...args),
}));

describe("Connected recipient handoff queue page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getRequestActorContextMock.mockResolvedValue({
      supabase: {},
      user: { id: "user-1" },
      kind: "internal",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "recipient-owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  it("uses safe projection helper and renders status-gated connected response controls", async () => {
    listActiveConnectedRecipientHandoffProjectionsForAccountMock.mockResolvedValue([
      {
        grant_id: "grant-1",
        workflow_handoff_request_id: "request-1",
        handoff_kind: "ecc",
        handoff_status: "sent",
        recipient_account_owner_user_id: "recipient-owner-1",
        installer_account_owner_user_id: "installer-owner-1",
        recipient_display_name_snapshot: "Smoke Rater A",
        recipient_type_snapshot: "connected_account_future",
        sent_at: "2026-05-31T18:00:00.000Z",
        responded_at: "2026-05-31T18:15:00.000Z",
        response_note: "Waiting on coordination.",
        evidence_reference: "evidence-ref-1",
        grant_status: "active",
        granted_at: "2026-05-31T18:01:00.000Z",
        shared_scope: "handoff_request_only",
      },
      {
        grant_id: "grant-2",
        workflow_handoff_request_id: "request-2",
        handoff_kind: "ecc",
        handoff_status: "accepted",
        recipient_account_owner_user_id: "recipient-owner-1",
        installer_account_owner_user_id: "installer-owner-1",
        recipient_display_name_snapshot: "Smoke Rater B",
        recipient_type_snapshot: "connected_account_future",
        sent_at: "2026-05-31T18:00:00.000Z",
        responded_at: "2026-05-31T18:15:00.000Z",
        response_note: "Accepted.",
        evidence_reference: null,
        grant_status: "active",
        granted_at: "2026-05-31T18:01:00.000Z",
        shared_scope: "handoff_request_only",
      },
      {
        grant_id: "grant-3",
        workflow_handoff_request_id: "request-3",
        handoff_kind: "ecc",
        handoff_status: "completed",
        recipient_account_owner_user_id: "recipient-owner-1",
        installer_account_owner_user_id: "installer-owner-1",
        recipient_display_name_snapshot: "Smoke Rater C",
        recipient_type_snapshot: "connected_account_future",
        sent_at: "2026-05-31T18:00:00.000Z",
        responded_at: "2026-05-31T18:30:00.000Z",
        response_note: "Done.",
        evidence_reference: "evidence-c",
        grant_status: "active",
        granted_at: "2026-05-31T18:01:00.000Z",
        shared_scope: "handoff_request_only",
      },
      {
        grant_id: "grant-4",
        workflow_handoff_request_id: "request-4",
        handoff_kind: "ecc",
        handoff_status: "rejected",
        recipient_account_owner_user_id: "recipient-owner-1",
        installer_account_owner_user_id: "installer-owner-1",
        recipient_display_name_snapshot: "Smoke Rater D",
        recipient_type_snapshot: "connected_account_future",
        sent_at: "2026-05-31T18:00:00.000Z",
        responded_at: "2026-05-31T18:30:00.000Z",
        response_note: "Rejected.",
        evidence_reference: null,
        grant_status: "active",
        granted_at: "2026-05-31T18:01:00.000Z",
        shared_scope: "handoff_request_only",
      },
      {
        grant_id: "grant-5",
        workflow_handoff_request_id: "request-5",
        handoff_kind: "ecc",
        handoff_status: "cancelled",
        recipient_account_owner_user_id: "recipient-owner-1",
        installer_account_owner_user_id: "installer-owner-1",
        recipient_display_name_snapshot: "Smoke Rater E",
        recipient_type_snapshot: "connected_account_future",
        sent_at: "2026-05-31T18:00:00.000Z",
        responded_at: "2026-05-31T18:30:00.000Z",
        response_note: "Cancelled.",
        evidence_reference: null,
        grant_status: "active",
        granted_at: "2026-05-31T18:01:00.000Z",
        shared_scope: "handoff_request_only",
      },
    ]);

    const pageModule = await import("@/app/ops/connected-handoffs/page");
    const markup = renderToStaticMarkup(await pageModule.default({ searchParams: Promise.resolve({}) }));

    expect(listActiveConnectedRecipientHandoffProjectionsForAccountMock).toHaveBeenCalledWith({}, "recipient-owner-1");
    expect(markup).toContain("Connected Handoff Requests");
    expect(markup).toContain("Smoke Rater A");
    expect(markup).toContain("ECC");
    expect(markup).toContain("sent");
    expect(markup).toContain("Responded");
    expect(markup).toContain("Waiting on coordination.");
    expect(markup).toContain("evidence-ref-1");
    expect(markup).toContain("active");
    expect(markup).toContain("handoff_request_only");
    expect(markup).toContain("Accept");
    expect(markup).toContain("Mark complete");
    expect(markup).toContain("Reject");
    expect(markup).toContain('name="grant_id" value="grant-1"');
    expect(markup).toContain('name="response_status" value="accepted"');
    expect(markup).toContain('name="response_status" value="completed"');
    expect(markup).toContain('name="response_status" value="rejected"');
    expect(markup).toContain('name="response_note" required=""');
    expect(markup).toContain("This handoff is in a terminal state. Response controls are no longer available.");
    expect(markup).not.toContain("/jobs/");
    expect(markup).not.toContain("service_case");
    expect(markup).not.toContain("workflow_instance");
    expect(markup).not.toContain("/customers/");
    expect(markup).not.toContain("address");
  });

  it("renders success and error banners from safe query params", async () => {
    listActiveConnectedRecipientHandoffProjectionsForAccountMock.mockResolvedValue([]);

    const pageModule = await import("@/app/ops/connected-handoffs/page");

    const acceptedMarkup = renderToStaticMarkup(await pageModule.default({
      searchParams: Promise.resolve({ banner: "connected_handoff_accepted" }),
    }));
    expect(acceptedMarkup).toContain("Handoff request accepted.");

    const errorMarkup = renderToStaticMarkup(await pageModule.default({
      searchParams: Promise.resolve({ banner: "connected_handoff_response_error" }),
    }));
    expect(errorMarkup).toContain("Could not update the connected handoff request.");
  });

  it("renders the empty state when no granted handoffs exist", async () => {
    listActiveConnectedRecipientHandoffProjectionsForAccountMock.mockResolvedValue([]);

    const pageModule = await import("@/app/ops/connected-handoffs/page");
    const markup = renderToStaticMarkup(await pageModule.default({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("No connected handoff requests are available yet.");
  });

  it("redirects unauthenticated users to login", async () => {
    getRequestActorContextMock.mockResolvedValue({
      supabase: {},
      user: null,
      kind: "unauthenticated",
      internalUser: null,
    });

    const pageModule = await import("@/app/ops/connected-handoffs/page");

    await expect(pageModule.default({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects contractor users to portal", async () => {
    getRequestActorContextMock.mockResolvedValue({
      supabase: {},
      user: { id: "contractor-1" },
      kind: "contractor",
      internalUser: null,
    });

    const pageModule = await import("@/app/ops/connected-handoffs/page");

    await expect(pageModule.default({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/portal");
  });
});