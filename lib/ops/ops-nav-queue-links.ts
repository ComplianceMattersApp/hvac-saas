export const OPS_NAV_QUEUE_LINKS = [
  {
    label: "Needs Scheduling",
    bucket: "pending",
    href: "/ops?bucket=pending#ops-workspace",
  },
  {
    label: "Field Work",
    bucket: "field_work",
    href: "/ops?bucket=field_work#ops-workspace",
  },
  {
    label: "Contractor Intake",
    bucket: "contractor_intake",
    href: "/ops?bucket=contractor_intake#ops-workspace",
  },
  {
    label: "Waiting / Pending Info",
    bucket: "waiting",
    href: "/ops?bucket=waiting#ops-workspace",
  },
  {
    label: "Exceptions",
    bucket: "exceptions",
    href: "/ops?bucket=exceptions#ops-workspace",
  },
  {
    label: "Closeout & Review",
    bucket: "closeout",
    href: "/ops?bucket=closeout#ops-workspace",
  },
  {
    label: "Follow Ups",
    bucket: "follow_ups",
    href: "/ops?bucket=follow_ups#ops-workspace",
  },
  {
    label: "Permits",
    bucket: "permits",
    href: "/ops?bucket=permits#ops-workspace",
  },
] as const;

export type OpsNavQueueLink = (typeof OPS_NAV_QUEUE_LINKS)[number];
