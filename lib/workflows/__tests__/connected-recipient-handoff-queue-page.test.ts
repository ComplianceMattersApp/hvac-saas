import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const getRequestActorContextMock = vi.fn();
const listActiveConnectedRecipientHandoffProjectionsForAccountMock = vi.fn();

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

  it("uses only the safe projection helper and renders read-only metadata", async () => {
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
    ]);

    const pageModule = await import("@/app/ops/connected-handoffs/page");
    const markup = renderToStaticMarkup(await pageModule.default({ searchParams: Promise.resolve({}) }));

    expect(listActiveConnectedRecipientHandoffProjectionsForAccountMock).toHaveBeenCalledWith({}, "recipient-owner-1");
    expect(markup).toContain("Connected Handoff Requests");
    expect(markup).toContain("This view is read-only");
    expect(markup).toContain("Smoke Rater A");
    expect(markup).toContain("installer-owner-1");
    expect(markup).toContain("ECC");
    expect(markup).toContain("sent");
    expect(markup).toContain("Responded");
    expect(markup).toContain("Waiting on coordination.");
    expect(markup).toContain("evidence-ref-1");
    expect(markup).toContain("active");
    expect(markup).toContain("handoff_request_only");
    expect(markup).not.toContain("Accept");
    expect(markup).not.toContain("Complete");
    expect(markup).not.toContain("Reject");
    expect(markup).not.toContain("/jobs/");
    expect(markup).not.toContain("customer");
    expect(markup).not.toContain("service case");
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