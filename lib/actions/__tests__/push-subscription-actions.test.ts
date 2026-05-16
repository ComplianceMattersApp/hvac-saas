import { beforeEach, describe, expect, it, vi } from "vitest";

const registerHelperMock = vi.fn();
const deactivateHelperMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/notifications/push-subscriptions", () => ({
  registerCurrentInternalUserPushSubscription: (...args: unknown[]) => registerHelperMock(...args),
  deactivateCurrentInternalUserPushSubscription: (...args: unknown[]) => deactivateHelperMock(...args),
}));

const validSubscription = {
  endpoint: "https://push.example/device-1",
  keys: {
    p256dh: "p256dh-key",
    auth: "auth-key",
  },
};

describe("push subscription server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    registerHelperMock.mockResolvedValue({
      status: "registered",
      subscription: {
        id: "sub-1",
        account_owner_user_id: "owner-1",
        user_id: "user-1",
        endpoint: "https://push.example/device-1",
        user_agent: "Chrome",
        device_label: "Windows Chrome",
        permission_state: "granted",
        is_active: true,
        last_seen_at: null,
        last_success_at: null,
        last_failure_at: null,
        last_failure_code: null,
        created_at: "2026-05-15T10:00:00.000Z",
        updated_at: "2026-05-15T10:00:00.000Z",
      },
    });
    deactivateHelperMock.mockResolvedValue({ deactivated: true, count: 1 });
  });

  it("registers the current internal user's browser subscription", async () => {
    const { registerBrowserPushSubscriptionAction } = await import("@/lib/actions/push-subscription-actions");

    const result = await registerBrowserPushSubscriptionAction({
      subscription: validSubscription,
      userAgent: "Chrome",
      deviceLabel: "Windows Chrome",
      permissionState: "granted",
    });

    expect(result.status).toBe("registered");
    expect(registerHelperMock).toHaveBeenCalledWith({
      endpoint: "https://push.example/device-1",
      p256dh: "p256dh-key",
      auth: "auth-key",
      userAgent: "Chrome",
      deviceLabel: "Windows Chrome",
      permissionState: "granted",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/notifications");
  });

  it("rejects invalid browser subscription payloads safely", async () => {
    const { registerBrowserPushSubscriptionAction } = await import("@/lib/actions/push-subscription-actions");

    await expect(
      registerBrowserPushSubscriptionAction({
        subscription: {
          endpoint: "https://push.example/device-1",
          keys: { p256dh: "p256dh-key" },
        },
      }),
    ).resolves.toEqual({ status: "invalid_input", subscription: null });

    expect(registerHelperMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("fails safely when internal user context is missing", async () => {
    registerHelperMock.mockResolvedValue({ status: "not_internal", subscription: null });
    const { registerBrowserPushSubscriptionAction } = await import("@/lib/actions/push-subscription-actions");

    await expect(
      registerBrowserPushSubscriptionAction({ subscription: validSubscription }),
    ).resolves.toEqual({ status: "not_internal", subscription: null });

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("deactivates only the current user's browser endpoint", async () => {
    const { deactivateBrowserPushSubscriptionAction } = await import("@/lib/actions/push-subscription-actions");

    const result = await deactivateBrowserPushSubscriptionAction({
      endpoint: "https://push.example/device-1",
    });

    expect(result).toEqual({ deactivated: true, count: 1 });
    expect(deactivateHelperMock).toHaveBeenCalledWith({
      endpoint: "https://push.example/device-1",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/notifications");
  });

  it("does not accept client-side user or account spoofing fields", async () => {
    const { registerBrowserPushSubscriptionAction } = await import("@/lib/actions/push-subscription-actions");

    await registerBrowserPushSubscriptionAction({
      subscription: {
        ...validSubscription,
        user_id: "attacker-user",
        account_owner_user_id: "attacker-owner",
      },
      userAgent: "Chrome",
      deviceLabel: "Windows Chrome",
      permissionState: "granted",
    } as any);

    expect(registerHelperMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        user_id: "attacker-user",
        account_owner_user_id: "attacker-owner",
        userId: "attacker-user",
        accountOwnerUserId: "attacker-owner",
      }),
    );
  });

  it("does not imply push sending is enabled", async () => {
    const { registerBrowserPushSubscriptionAction } = await import("@/lib/actions/push-subscription-actions");

    await registerBrowserPushSubscriptionAction({ subscription: validSubscription });

    expect(registerHelperMock).toHaveBeenCalledTimes(1);
    expect(deactivateHelperMock).not.toHaveBeenCalled();
  });
});
