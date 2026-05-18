"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Smartphone, ChevronDown, ChevronUp } from "lucide-react";
import type { PushSubscriptionSafeRow } from "@/lib/notifications/push-subscriptions";
import type {
  DeactivateBrowserPushSubscriptionResult,
  RegisterBrowserPushSubscriptionResult,
} from "@/lib/actions/push-subscription-actions";
import { DeviceNotificationsDeviceList } from "./DeviceNotificationsDeviceList";

type DeviceNotificationsCardProps = {
  initialSubscriptions: PushSubscriptionSafeRow[];
  publicVapidKey: string | null;
  onRegister: (input: {
    subscription: unknown;
    userAgent?: string | null;
    deviceLabel?: string | null;
    permissionState?: string | null;
  }) => Promise<RegisterBrowserPushSubscriptionResult>;
  onDeactivate: (input: { endpoint?: string | null }) => Promise<DeactivateBrowserPushSubscriptionResult>;
};

type CapabilityState =
  | "checking"
  | "unsupported"
  | "missing_config"
  | "denied"
  | "enabled"
  | "needs_resync"
  | "not_enabled"
  | "saving"
  | "failed";

function urlBase64ToUint8Array(value: string): BufferSource {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

function supportsBrowserPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function deviceLabelFromUserAgent(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  const platform =
    ua.includes("iphone") || ua.includes("ipad")
      ? "iOS"
      : ua.includes("android")
      ? "Android"
      : ua.includes("mac")
      ? "Mac"
      : ua.includes("windows")
      ? "Windows"
      : "Browser";

  const browser =
    ua.includes("edg/")
      ? "Edge"
      : ua.includes("chrome/")
      ? "Chrome"
      : ua.includes("firefox/")
      ? "Firefox"
      : ua.includes("safari/")
      ? "Safari"
      : "Browser";

  return `${platform} ${browser}`;
}

export function DeviceNotificationsCard({
  initialSubscriptions,
  publicVapidKey,
  onRegister,
  onDeactivate,
}: DeviceNotificationsCardProps) {
  const [state, setState] = useState<CapabilityState>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState(initialSubscriptions.length);
  const [showDeviceList, setShowDeviceList] = useState(false);
  const savedEndpoints = useMemo(
    () => new Set(initialSubscriptions.map((subscription) => subscription.endpoint)),
    [initialSubscriptions],
  );

  useEffect(() => {
    let cancelled = false;

    async function checkCurrentDevice() {
      if (!supportsBrowserPush()) {
        setState("unsupported");
        return;
      }

      if (!publicVapidKey) {
        setState("missing_config");
        return;
      }

      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        const subscription = await registration?.pushManager.getSubscription();
        if (cancelled) return;

        if (subscription?.endpoint) {
          setCurrentEndpoint(subscription.endpoint);
          if (savedEndpoints.has(subscription.endpoint)) {
            setState("enabled");
            return;
          }

          setState("needs_resync");
          setMessage("This browser subscription needs to be re-synced with the server.");
          return;
        }

        setState("not_enabled");
      } catch {
        if (!cancelled) setState("not_enabled");
      }
    }

    void checkCurrentDevice();

    return () => {
      cancelled = true;
    };
  }, [publicVapidKey, savedEndpoints]);

  const statusText = useMemo(() => {
    switch (state) {
      case "unsupported":
        return "Device notifications are not supported in this browser.";
      case "missing_config":
        return "Device notification setup needs a public push key.";
      case "denied":
        return "Notifications are blocked in this browser.";
      case "enabled":
        return "Get notified when you are assigned to a job or mentioned in an internal note.";
      case "needs_resync":
        return message ?? "This browser subscription needs to be re-synced with the server.";
      case "saving":
        return "Saving this device...";
      case "failed":
        return message ?? "Device notification setup failed. Try again.";
      case "checking":
      case "not_enabled":
      default:
        if (activeCount > 0) {
          return "Get notified on this device when you are assigned to a job or mentioned in an internal note.";
        }
        return "Get notified when you are assigned to a job or mentioned in an internal note.";
    }
  }, [activeCount, message, state]);

  const promptTitle = useMemo(() => {
    switch (state) {
      case "unsupported":
      case "missing_config":
        return "Device Notifications Not Available";
      case "denied":
        return "Notifications Blocked";
      case "enabled":
        return "Device Notifications Enabled";
      case "saving":
        return "Saving...";
      default:
        return "Turn on job alerts for this device";
    }
  }, [state]);

  const canEnable = state === "not_enabled" || state === "failed" || state === "needs_resync";
  const canDisable = state === "enabled" && Boolean(currentEndpoint);
  const enableButtonLabel = state === "needs_resync" ? "Re-sync this device" : "Enable alerts on this device";

  async function handleEnable() {
    setMessage(null);

    if (!supportsBrowserPush()) {
      setState("unsupported");
      return;
    }

    if (!publicVapidKey) {
      setState("missing_config");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    setState("saving");

    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (permission === "denied") {
        setState("denied");
        return;
      }

      if (permission !== "granted") {
        setState("not_enabled");
        setMessage("Permission was not granted.");
        return;
      }

      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
        }));

      const result = await onRegister({
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent,
        deviceLabel: deviceLabelFromUserAgent(navigator.userAgent),
        permissionState: permission,
      });

      if (result.status !== "registered" && result.status !== "updated") {
        setState("needs_resync");
        setMessage("The subscription could not be saved. Re-sync this device.");
        return;
      }

      setCurrentEndpoint(subscription.endpoint);
      setActiveCount((count) => Math.max(count, 1));
      setState("enabled");
    } catch {
      setState("failed");
      setMessage("The browser subscription could not be completed.");
    }
  }

  async function handleDisable() {
    if (!currentEndpoint) return;

    setMessage(null);
    setState("saving");

    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();

      const result = await onDeactivate({ endpoint: currentEndpoint });
      if (!result.deactivated) {
        setState("failed");
        setMessage("The saved subscription could not be deactivated.");
        return;
      }

      setCurrentEndpoint(null);
      setActiveCount((count) => Math.max(0, count - result.count));
      setState("not_enabled");
    } catch {
      setState("failed");
      setMessage("This device could not be disabled.");
    }
  }

  // Show helpful guidance for unsupported/denied states
  const isUnsupported = state === "unsupported" || state === "missing_config";
  const isDenied = state === "denied";

  if (isUnsupported || isDenied) {
    return (
      <section className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">{promptTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{statusText}</p>
            {isDenied && (
              <p className="mt-2 text-xs text-slate-600">
                To enable notifications, go to your browser settings and allow notifications for Compliance Matters, then reload this page.
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{promptTitle}</h2>
              {state === "enabled" && (
                <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  Active
                </span>
              )}
              {state !== "enabled" && activeCount > 0 && (
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {activeCount} other {activeCount === 1 ? "device" : "devices"} active
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">{statusText}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {canDisable ? (
            <button
              type="button"
              onClick={() => void handleDisable()}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <BellOff className="h-4 w-4" aria-hidden="true" />
              Not now
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleEnable()}
              className="inline-flex items-center gap-2 rounded-md border border-blue-700 bg-blue-700 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canEnable}
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {enableButtonLabel}
            </button>
          )}
        </div>
      </div>

      {/* Device list toggle */}
      {activeCount > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setShowDeviceList(!showDeviceList)}
            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {showDeviceList ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span>
              {activeCount} enrolled {activeCount === 1 ? "device" : "devices"}
            </span>
          </button>

          {showDeviceList && (
            <div className="mt-3">
              <DeviceNotificationsDeviceList
                subscriptions={initialSubscriptions}
                currentEndpoint={currentEndpoint}
              />
            </div>
          )}
        </div>
      )}

      {/* Guidance text */}
      {state === "not_enabled" && activeCount === 0 && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            Device alerts are per browser/device. Enable alerts separately on your phone, tablet, and desktop. Turning this off only affects this browser/device.
          </p>
        </div>
      )}
    </section>
  );
}
