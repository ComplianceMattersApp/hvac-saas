import type { RegisterBrowserPushSubscriptionResult } from "@/lib/actions/push-subscription-actions";

type BrowserPushSubscriptionLike = {
  endpoint: string;
  toJSON(): unknown;
};

type BrowserPushRegistrationLike = {
  pushManager: {
    getSubscription(): Promise<BrowserPushSubscriptionLike | null>;
  };
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type AutoReconcileInput = {
  userId: string;
  accountOwnerUserId: string;
  permission: string | null | undefined;
  getRegistration: () => Promise<BrowserPushRegistrationLike | null>;
  onRegister: (input: {
    subscription: unknown;
    permissionState?: string | null;
  }) => Promise<RegisterBrowserPushSubscriptionResult>;
  storage?: StorageLike | null;
};

type AutoReconcileResult =
  | {
      status: "skipped";
      reason: "permission" | "missing_registration" | "missing_subscription" | "already_synced" | "inflight";
    }
  | RegisterBrowserPushSubscriptionResult;

const inflightKeys = new Set<string>();

function cleanText(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function buildInflightKey(input: Pick<AutoReconcileInput, "userId" | "accountOwnerUserId">): string {
  return ["cm:push-auto-reconcile:inflight", cleanText(input.accountOwnerUserId), cleanText(input.userId)].join(":");
}

function buildEndpointMarkerKey(
  input: Pick<AutoReconcileInput, "userId" | "accountOwnerUserId"> & { endpoint: string },
): string {
  return [
    "cm:push-auto-reconcile:last-endpoint",
    cleanText(input.accountOwnerUserId),
    cleanText(input.userId),
    cleanText(input.endpoint),
  ].join(":");
}

function readMarker(storage: StorageLike | null | undefined, key: string): string | null {
  if (!storage) return null;

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeMarker(storage: StorageLike | null | undefined, key: string, value: string): void {
  if (!storage) return;

  try {
    storage.setItem(key, value);
  } catch {
    return;
  }
}

export async function reconcileBrowserPushSubscription({
  userId,
  accountOwnerUserId,
  permission,
  getRegistration,
  onRegister,
  storage,
}: AutoReconcileInput): Promise<AutoReconcileResult> {
  if (cleanText(permission).toLowerCase() !== "granted") {
    return { status: "skipped", reason: "permission" };
  }

  const inflightKey = buildInflightKey({ userId, accountOwnerUserId });
  if (inflightKeys.has(inflightKey)) {
    return { status: "skipped", reason: "inflight" };
  }

  inflightKeys.add(inflightKey);

  try {
    const registration = await getRegistration();
    if (!registration) {
      return { status: "skipped", reason: "missing_registration" };
    }

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription?.endpoint) {
      return { status: "skipped", reason: "missing_subscription" };
    }

    const endpointMarkerKey = buildEndpointMarkerKey({
      userId,
      accountOwnerUserId,
      endpoint: subscription.endpoint,
    });

    if (readMarker(storage, endpointMarkerKey) === "1") {
      return { status: "skipped", reason: "already_synced" };
    }

    const result = await onRegister({
      subscription: subscription.toJSON(),
      permissionState: "granted",
    });

    if (result.status === "registered" || result.status === "updated") {
      writeMarker(storage, endpointMarkerKey, "1");
    }

    return result;
  } finally {
    inflightKeys.delete(inflightKey);
  }
}
