import { beforeEach, describe, expect, it, vi } from "vitest";

const registerMock = vi.fn();

function makeSubscription(endpoint = "https://push.example/device-1") {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "p256dh-key", auth: "auth-key" } }),
  };
}

describe("browser push auto reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    registerMock.mockResolvedValue({
      status: "registered",
      subscription: {
        id: "sub-1",
        account_owner_user_id: "owner-1",
        user_id: "user-1",
        endpoint: "https://push.example/device-1",
        user_agent: null,
        device_label: null,
        permission_state: "granted",
        is_active: true,
        last_seen_at: null,
        last_success_at: null,
        last_failure_at: null,
        last_failure_code: null,
        created_at: "2026-05-25T10:00:00.000Z",
        updated_at: "2026-05-25T10:00:00.000Z",
      },
    });
  });

  it("replays registration once when permission is granted and a subscription already exists", async () => {
    const storage = new Map<string, string>();
    const { reconcileBrowserPushSubscription } = await import("@/lib/notifications/browser-push-auto-reconcile");

    const result = await reconcileBrowserPushSubscription({
      userId: "user-1",
      accountOwnerUserId: "owner-1",
      permission: "granted",
      storage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
      getRegistration: async () => ({
        pushManager: {
          getSubscription: async () => makeSubscription(),
        },
      }),
      onRegister: (...args: unknown[]) => registerMock(...args),
    });

    expect(result.status).toBe("registered");
    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith({
      permissionState: "granted",
      subscription: {
        endpoint: "https://push.example/device-1",
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      },
    });
    expect([...storage.values()]).toEqual(["1"]);
  });

  it("does not re-register when the current endpoint was already synced for this user", async () => {
    const storage = new Map<string, string>();
    const { reconcileBrowserPushSubscription } = await import("@/lib/notifications/browser-push-auto-reconcile");

    await reconcileBrowserPushSubscription({
      userId: "user-1",
      accountOwnerUserId: "owner-1",
      permission: "granted",
      storage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
      getRegistration: async () => ({
        pushManager: {
          getSubscription: async () => makeSubscription(),
        },
      }),
      onRegister: (...args: unknown[]) => registerMock(...args),
    });

    await reconcileBrowserPushSubscription({
      userId: "user-1",
      accountOwnerUserId: "owner-1",
      permission: "granted",
      storage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
      getRegistration: async () => ({
        pushManager: {
          getSubscription: async () => makeSubscription(),
        },
      }),
      onRegister: (...args: unknown[]) => registerMock(...args),
    });

    expect(registerMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing for denied or default permission", async () => {
    const { reconcileBrowserPushSubscription } = await import("@/lib/notifications/browser-push-auto-reconcile");

    await expect(
      reconcileBrowserPushSubscription({
        userId: "user-1",
        accountOwnerUserId: "owner-1",
        permission: "denied",
        getRegistration: async () => {
          throw new Error("should not be called");
        },
        onRegister: (...args: unknown[]) => registerMock(...args),
      }),
    ).resolves.toEqual({ status: "skipped", reason: "permission" });

    await expect(
      reconcileBrowserPushSubscription({
        userId: "user-1",
        accountOwnerUserId: "owner-1",
        permission: "default",
        getRegistration: async () => {
          throw new Error("should not be called");
        },
        onRegister: (...args: unknown[]) => registerMock(...args),
      }),
    ).resolves.toEqual({ status: "skipped", reason: "permission" });

    expect(registerMock).not.toHaveBeenCalled();
  });

  it("does not prompt or register when no subscription exists", async () => {
    const { reconcileBrowserPushSubscription } = await import("@/lib/notifications/browser-push-auto-reconcile");

    await expect(
      reconcileBrowserPushSubscription({
        userId: "user-1",
        accountOwnerUserId: "owner-1",
        permission: "granted",
        getRegistration: async () => ({
          pushManager: {
            getSubscription: async () => null,
          },
        }),
        onRegister: (...args: unknown[]) => registerMock(...args),
      }),
    ).resolves.toEqual({ status: "skipped", reason: "missing_subscription" });

    expect(registerMock).not.toHaveBeenCalled();
  });
});
