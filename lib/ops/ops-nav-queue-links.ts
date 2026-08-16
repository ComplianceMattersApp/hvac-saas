import {
  getOpsWorkspaceQueueDefinition,
  opsWorkspaceQueueHref,
  type OpsWorkspaceQueueBucket,
  type OpsWorkspaceQueueKey,
} from "@/lib/ops/ops-workspace-queues";

// Canonical Operations workspace queue destinations.
//
// The /ops board renders every queue as a bucket of the single Operations
// Workspace surface (see `opsRailQueueRows` in app/ops/page.tsx). Any other
// surface that links into an ops queue — shell nav, Today's operations
// snapshot — must route through here so the destinations cannot drift.

export { opsWorkspaceQueueHref };
export type { OpsWorkspaceQueueBucket };

const OPS_NAV_QUEUE_KEYS = [
  "need_to_schedule",
  "field_work",
  "contractor_intake",
  "waiting",
  "exceptions",
  "closeout",
  "follow_ups",
  "permits",
] as const satisfies readonly OpsWorkspaceQueueKey[];

export const OPS_NAV_QUEUE_LINKS = OPS_NAV_QUEUE_KEYS.map((key) => {
  const definition = getOpsWorkspaceQueueDefinition(key);
  return {
    label: definition.label,
    bucket: definition.bucket,
    href: opsWorkspaceQueueHref(definition.bucket),
  };
});

export type OpsNavQueueLink = (typeof OPS_NAV_QUEUE_LINKS)[number];
