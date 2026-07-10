import {
  formatTimestampDateDisplayLA,
  formatTimestampDateTimeDisplayLA,
} from "@/lib/utils/schedule-la";
import type { QboConnection } from "@/lib/qbo/qbo-connection";
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
}: {
  qboConnection: QboConnection | null;
  qboAvailable: boolean;
}) {
  const summary: QboConnectionSummary | null = qboConnection
    ? {
        realmId: qboConnection.realmId,
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
    </SettingsSection>
  );
}
