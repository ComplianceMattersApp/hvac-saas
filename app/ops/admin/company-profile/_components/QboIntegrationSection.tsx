import {
  formatTimestampDateDisplayLA,
  formatTimestampDateTimeDisplayLA,
} from "@/lib/utils/schedule-la";
import { saveDefaultQboItemFromForm } from "@/lib/actions/qbo-connection-actions";
import type { QboConnection } from "@/lib/qbo/qbo-connection";
import type { QboItemCatalog } from "@/lib/qbo/qbo-item-catalog";
import type { QboItemMapping } from "@/lib/qbo/qbo-item-mapping";
import { SettingsSection } from "./SettingsSection";
import { QboIntegrationControls, type QboConnectionSummary } from "./QboIntegrationControls";

/**
 * Company Profile → Integrations → QuickBooks Online.
 * Server component: formats the connection labels and delegates the interactive
 * connect / sync / disconnect controls (with their result banners) to a client child.
 */
export function QboIntegrationSection({
  qboConnection,
  qboAvailable,
  itemCatalog,
  defaultQboItem,
}: {
  qboConnection: QboConnection | null;
  qboAvailable: boolean;
  itemCatalog: QboItemCatalog;
  defaultQboItem: QboItemMapping | null;
}) {
  const summary: QboConnectionSummary | null = qboConnection
    ? {
        realmId: qboConnection.realmId,
        status: qboConnection.status,
        environment: qboConnection.environment,
        connectedAtLabel: formatTimestampDateDisplayLA(qboConnection.connectedAt),
        lastSyncedLabel: qboConnection.lastSyncedAt
          ? formatTimestampDateTimeDisplayLA(qboConnection.lastSyncedAt)
          : "Never",
        tokenExpiresLabel: formatTimestampDateTimeDisplayLA(qboConnection.tokenExpiresAt),
        lastSyncError: qboConnection.lastSyncError,
      }
    : null;

  return (
    <SettingsSection
      id="integrations"
      eyebrow="Integrations"
      title="QuickBooks Online"
      description="Sync issued invoices to your QuickBooks Online company. QuickBooks is downstream accounting only — EveryStep stays your source of truth."
    >
      <QboIntegrationControls available={qboAvailable} connection={summary} />
      {qboAvailable && qboConnection?.status === "active" ? (
        <QboDefaultItemForm catalog={itemCatalog} defaultQboItem={defaultQboItem} />
      ) : null}
    </SettingsSection>
  );
}

/**
 * Account-level default QuickBooks item.
 *
 * Invoice lines resolve their QuickBooks item in this order: the line's
 * pricebook mapping, then this default, then the app-owned "EveryStep Services"
 * item. When the item list can't be loaded the selector is disabled and says so
 * — it never blocks the rest of the Integrations panel.
 */
function QboDefaultItemForm({
  catalog,
  defaultQboItem,
}: {
  catalog: QboItemCatalog;
  defaultQboItem: QboItemMapping | null;
}) {
  const listUnavailable = catalog.items.length === 0;
  // Options are keyed by QuickBooks item id alone, so a rename in QuickBooks
  // still matches the stored mapping. A mapping pointing at an item the catalog
  // no longer returns (deactivated, deleted) gets its own option so opening this
  // form cannot silently reset it.
  const knownIds = new Set(catalog.items.map((item) => item.id));
  const staleSelection =
    defaultQboItem && !knownIds.has(defaultQboItem.qboItemId) ? defaultQboItem : null;
  const selectedValue = defaultQboItem?.qboItemId ?? "";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-sm font-semibold text-[#0f1f35]">Default QuickBooks item</div>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Invoice lines post against the QuickBooks item mapped on their Pricebook item. Anything
        unmapped uses this default; with no default, EveryStep uses its own
        &ldquo;EveryStep Services&rdquo; item.
      </p>

      {catalog.error ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-amber-900">
          {catalog.error}
        </p>
      ) : null}

      <form action={saveDefaultQboItemFromForm} className="mt-3 space-y-3">
        <label className="block space-y-1.5 text-sm text-slate-700">
          <span className="font-medium text-slate-800">QuickBooks item</span>
          <select
            name="default_qbo_item"
            defaultValue={selectedValue}
            disabled={listUnavailable}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-[#0f1f35] shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100 disabled:text-slate-500"
          >
            <option value="">None (use EveryStep Services)</option>
            {staleSelection ? (
              <option value={staleSelection.qboItemId}>
                {staleSelection.qboItemName ?? `QuickBooks item ${staleSelection.qboItemId}`} (not in
                the current QuickBooks list)
              </option>
            ) : null}
            {catalog.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={listUnavailable}
          className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          Save default item
        </button>
      </form>
    </div>
  );
}
