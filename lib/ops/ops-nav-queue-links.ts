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
] as const;

export type OpsNavQueueLink = (typeof OPS_NAV_QUEUE_LINKS)[number];
