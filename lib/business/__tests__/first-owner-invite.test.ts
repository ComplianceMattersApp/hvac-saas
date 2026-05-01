import { describe, expect, it, vi } from "vitest";
import { orchestrateFirstOwnerInvite } from "@/lib/business/first-owner-invite";

function makeDeps(overrides?: Partial<Parameters<typeof orchestrateFirstOwnerInvite>[0]["deps"]>) {
  return {
    getAuthUserById: vi.fn(async () => ({
      id: "owner-1",
      email: "owner@example.com",
      invitedAt: null,
      emailConfirmedAt: null,
    })),
    setUserMetadata: vi.fn(async () => undefined),
    sendInvite: vi.fn(async () => undefined),
    resolveInviteRedirectTo: vi.fn(() => "https://example.test/auth/callback"),
    nowIso: vi.fn(() => "2026-04-30T00:00:00.000Z"),
    ...overrides,
  };
}

describe("orchestrateFirstOwnerInvite", () => {
  it("does not mutate or send invite in dry-run", async () => {
    const deps = makeDeps();

    const result = await orchestrateFirstOwnerInvite({
      apply: false,
      email: "owner@example.com",
      resendInvite: false,
      authUserId: "owner-1",
      accountOwnerUserId: "owner-1",
      deps,
    });

    expect(result).toEqual({
      inviteSent: false,
      inviteSkippedReason: "dry_run",
      warnings: [],
      errors: [],
    });
    expect(deps.getAuthUserById).not.toHaveBeenCalled();
    expect(deps.setUserMetadata).not.toHaveBeenCalled();
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it("writes metadata before invite send", async () => {
    const order: string[] = [];
    const deps = makeDeps({
      setUserMetadata: vi.fn(async () => {
        order.push("metadata");
      }),
      sendInvite: vi.fn(async () => {
        order.push("invite");
      }),
    });

    const result = await orchestrateFirstOwnerInvite({
      apply: true,
      email: "owner@example.com",
      resendInvite: false,
      authUserId: "owner-1",
      accountOwnerUserId: "owner-1",
      deps,
    });

    expect(result.errors).toEqual([]);
    expect(result.inviteSent).toBe(true);
    expect(order).toEqual(["metadata", "invite"]);
  });

  it("returns AUTH_USER_ID_REQUIRED when provisioning auth user id is missing", async () => {
    const deps = makeDeps();

    const result = await orchestrateFirstOwnerInvite({
      apply: true,
      email: "owner@example.com",
      resendInvite: false,
      authUserId: null,
      accountOwnerUserId: "owner-1",
      deps,
    });

    expect(result.inviteSent).toBe(false);
    expect(result.errors[0]?.code).toBe("AUTH_USER_ID_REQUIRED");
    expect(deps.getAuthUserById).not.toHaveBeenCalled();
  });

  it("preserves pending invite skip behavior when resend is false", async () => {
    const deps = makeDeps({
      getAuthUserById: vi.fn(async () => ({
        id: "owner-1",
        email: "owner@example.com",
        invitedAt: "2026-04-29T01:00:00.000Z",
        emailConfirmedAt: null,
      })),
    });

    const result = await orchestrateFirstOwnerInvite({
      apply: true,
      email: "owner@example.com",
      resendInvite: false,
      authUserId: "owner-1",
      accountOwnerUserId: "owner-1",
      deps,
    });

    expect(result.inviteSent).toBe(false);
    expect(result.inviteSkippedReason).toBe("invite_already_pending");
    expect(result.warnings).toContain("Invite already pending for this user; resend skipped.");
    expect(deps.setUserMetadata).not.toHaveBeenCalled();
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it("reports INVITE_SEND_FAILED after successful metadata write", async () => {
    const deps = makeDeps({
      sendInvite: vi.fn(async () => {
        throw new Error("invite service unavailable");
      }),
    });

    const result = await orchestrateFirstOwnerInvite({
      apply: true,
      email: "owner@example.com",
      resendInvite: true,
      authUserId: "owner-1",
      accountOwnerUserId: "owner-1",
      deps,
    });

    expect(deps.setUserMetadata).toHaveBeenCalledTimes(1);
    expect(deps.sendInvite).toHaveBeenCalledTimes(1);
    expect(result.inviteSent).toBe(false);
    expect(result.errors[0]?.code).toBe("INVITE_SEND_FAILED");
  });
});
