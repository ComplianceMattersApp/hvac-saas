export type SetupCoachItem = {
  label: string;
  detail: string;
  href: string;
};

export const setupCoachChecklist: SetupCoachItem[] = [
  {
    label: "Open Launch Room",
    detail: "Start in Admin Center and handle Required Now before optional setup.",
    href: "/ops/admin",
  },
  {
    label: "Understand Today",
    detail: "Open Today first so the team understands the day before creating more work.",
    href: "/today",
  },
  {
    label: "Confirm company profile",
    detail: "Check business identity, support contact details, invoice mode, and company basics.",
    href: "/ops/admin/company-profile",
  },
  {
    label: "Confirm team access",
    detail: "Invite or review the people needed to run the first job.",
    href: "/ops/admin/users",
  },
  {
    label: "Confirm invoice workflow",
    detail: "Choose how invoices are handled before the first closeout.",
    href: "/ops/admin/company-profile#invoice-settings",
  },
  {
    label: "Set up Online Invoice Payments if used",
    detail: "Use this when customers should pay Compliance Matters invoices online.",
    href: "/ops/admin/company-profile#accept-payments",
  },
  {
    label: "Open Training Room",
    detail: "Review the role track for the responsibility you are handling today.",
    href: "/training",
  },
  {
    label: "Run Your First Job",
    detail: "Use the workflow map: understand the day in Today, start job intake when needed, do field work inside the job, finish the outcome, then use closeout operations for next steps, billing, and tomorrow's review.",
    href: "/jobs/new",
  },
  {
    label: "Review Tomorrow in Today/Ops",
    detail: "Use Today and Operations the next morning to see what needs action, what is waiting, and what should be closed out.",
    href: "/today",
  },
];
