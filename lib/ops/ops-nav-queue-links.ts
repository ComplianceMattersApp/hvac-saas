// Canonical Operations workspace queue destinations.
//
// The /ops board renders every queue as a bucket of the single Operations
// Workspace surface (see `opsRailQueueRows` in app/ops/page.tsx). Any other
// surface that links into an ops queue — shell nav, Today's operations
// snapshot — must route through here so the destinations cannot drift.

export type OpsWorkspaceQueueBucket =
  | "pending"
  | "field_work"
  | "without_tech"
  | "waiting"
  | "exceptions"
  | "closeout"
  | "follow_ups"
  | "contractor_intake"
  | "permits";

export function opsWorkspaceQueueHref(bucket: OpsWorkspaceQueueBucket): string {
  return `/ops?bucket=${bucket}#ops-workspace`;
}

export const OPS_NAV_QUEUE_LINKS = [
  {
    label: "Needs Scheduling",
    bucket: "pending",
    href: opsWorkspaceQueueHref("pending"),
  },
  {
    label: "Field Work",
    bucket: "field_work",
    href: opsWorkspaceQueueHref("field_work"),
  },
  {
    label: "Contractor Intake",
    bucket: "contractor_intake",
    href: opsWorkspaceQueueHref("contractor_intake"),
  },
  {
    label: "Waiting / Pending Info",
    bucket: "waiting",
    href: opsWorkspaceQueueHref("waiting"),
  },
  {
    label: "Exceptions",
    bucket: "exceptions",
    href: opsWorkspaceQueueHref("exceptions"),
  },
  {
    label: "Closeout & Review",
    bucket: "closeout",
    href: opsWorkspaceQueueHref("closeout"),
  },
  {
    label: "Follow Ups",
    bucket: "follow_ups",
    href: opsWorkspaceQueueHref("follow_ups"),
  },
  {
    label: "Permits",
    bucket: "permits",
    href: opsWorkspaceQueueHref("permits"),
  },
] as const;

export type OpsNavQueueLink = (typeof OPS_NAV_QUEUE_LINKS)[number];
