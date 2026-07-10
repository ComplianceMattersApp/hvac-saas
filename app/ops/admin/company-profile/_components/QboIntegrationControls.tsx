"use client";

import { useActionState } from "react";

import { Disclosure } from "@/components/ui/Disclosure";
import {
  disconnectQboFromForm,
  initiateQboOAuthFromForm,
} from "@/lib/actions/qbo-connection-actions";
import {
  syncAllPendingInvoicesToQboFromForm,
  type QboSyncActionResult,
} from "@/lib/actions/qbo-sync-actions";

export interface QboConnectionSummary {
  realmId: string;
  environment: string;
  connectedAtLabel: string;
  lastSyncedLabel: string;
  tokenExpiresLabel: string;
  lastSyncError: string | null;
}

export function QboIntegrationControls({
  available,
  connection,
}: {
  available: boolean;
  connection: QboConnectionSummary | null;
}) {
  const [, connectAction] = useActionState<null, FormData>(initiateQboOAuthFromForm, null);
  const [syncResult, syncAction, syncing] = useActionState<QboSyncActionResult | null, FormData>(
    syncAllPendingInvoicesToQboFromForm,
    null,
  );
  const [disconnectResult, disconnectAction, disconnecting] = useActionState<
    { success: boolean; error?: string } | null,
    FormData
  >(disconnectQboFromForm, null);

  if (!available) {
    return (
      <p className="text-sm leading-6 text-slate-600">
        Integrations are not configured for this environment.
      </p>
    );
  }

  if (!connection) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-6 text-slate-600">
          Sync issued invoices to your QuickBooks Online company. You&rsquo;ll be redirected to Intuit
          to authorize the connection.
        </p>
        <form action={connectAction}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Connect QuickBooks
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
          &#10003; Connected
        </span>
        <span className="text-sm text-slate-600">
          Connected {connection.connectedAtLabel} &middot; {connection.environment} &middot; Last synced{" "}
          {connection.lastSyncedLabel}
        </span>
      </div>

      {syncResult ? (
        <div
          className={`rounded-xl border px-3.5 py-2.5 text-sm ${
            syncResult.errors > 0
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {syncResult.message}
        </div>
      ) : null}

      {disconnectResult && !disconnectResult.success ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
          {disconnectResult.error ?? "Failed to disconnect QuickBooks Online."}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <form action={syncAction}>
          <button
            type="submit"
            disabled={syncing}
            className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {syncing ? "Syncing…" : "Sync pending invoices"}
          </button>
        </form>
        <form
          action={disconnectAction}
          onSubmit={(event) => {
            if (!window.confirm("Disconnect QuickBooks Online? Invoices will stop syncing.")) {
              event.preventDefault();
            }
          }}
        >
          <button
            type="submit"
            disabled={disconnecting}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        </form>
      </div>

      <Disclosure title="Advanced" variant="flush">
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Realm ID</dt>
            <dd className="font-medium text-[#0f1f35]">{connection.realmId}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Environment</dt>
            <dd className="font-medium text-[#0f1f35]">{connection.environment}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Token expires</dt>
            <dd className="font-medium text-[#0f1f35]">{connection.tokenExpiresLabel}</dd>
          </div>
          {connection.lastSyncError ? (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Last sync error</dt>
              <dd className="font-medium text-red-700">{connection.lastSyncError}</dd>
            </div>
          ) : null}
        </dl>
      </Disclosure>
    </div>
  );
}
