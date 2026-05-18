"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import type { PushSubscriptionSafeRow } from "@/lib/notifications/push-subscriptions";

type DeviceNotificationsDeviceListProps = {
  subscriptions: PushSubscriptionSafeRow[];
  currentEndpoint?: string | null;
};

function formatDate(dateString?: string | null): string {
  if (!dateString) return "Unknown";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "Unknown";
  }
}

function getPermissionIcon(permissionState: string) {
  if (permissionState === "granted") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
  }
  if (permissionState === "denied") {
    return <AlertCircle className="h-4 w-4 text-red-600" aria-hidden="true" />;
  }
  return <AlertCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />;
}

export function DeviceNotificationsDeviceList({
  subscriptions,
  currentEndpoint,
}: DeviceNotificationsDeviceListProps) {
  if (subscriptions.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
        <p className="text-xs text-slate-600">No enrolled devices yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Enrolled Devices</p>

      <div className="space-y-2">
        {subscriptions.map((subscription) => {
          const isCurrent = subscription.endpoint === currentEndpoint;
          const statusColor = subscription.is_active
            ? "border-emerald-100 bg-emerald-50"
            : "border-slate-200 bg-slate-50";
          const statusLabel = subscription.is_active ? "Active" : "Inactive";

          return (
            <div
              key={subscription.id}
              className={`rounded-md border ${statusColor} p-2 text-xs`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">
                      {subscription.device_label || "Unknown Device"}
                    </span>
                    {isCurrent && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        This device
                      </span>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        subscription.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <div className="mt-1 space-y-0.5 text-slate-600">
                    <div className="flex items-center gap-1">
                      {getPermissionIcon(subscription.permission_state)}
                      <span className="capitalize">
                        {subscription.permission_state || "Unknown"} permission
                      </span>
                    </div>

                    <div className="text-slate-500">
                      Enrolled {formatDate(subscription.created_at)}
                    </div>

                    {subscription.last_seen_at && (
                      <div className="text-slate-500">
                        Last seen {formatDate(subscription.last_seen_at)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Device alerts are per browser/device. Enable alerts separately on your phone, tablet, and desktop. Turning this off only affects this browser/device.
      </p>
    </div>
  );
}
