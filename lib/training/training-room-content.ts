export type TrainingLink = {
  label: string;
  href: string;
};

export type FirstJobStep = {
  step: string;
  description: string;
  hrefs: TrainingLink[];
  responsibility: string;
};

export type RoleTrainingTrack = {
  id: string;
  title: string;
  summary: string;
  missions: string[];
  whatYouDo: string[];
  whatToUnderstand: string[];
  notYourResponsibility: string[];
  links: TrainingLink[];
};

export const firstJobMissionSteps: FirstJobStep[] = [
  {
    step: "Create first customer",
    description: "Add the customer or account you are working for.",
    hrefs: [{ label: "New customer", href: "/customers/new" }],
    responsibility: "Owner/Admin, Dispatcher/Office",
  },
  {
    step: "Create first job",
    description: "Create the work order or ECC job for that customer and service location.",
    hrefs: [{ label: "New job", href: "/jobs/new" }],
    responsibility: "Owner/Admin, Dispatcher/Office",
  },
  {
    step: "Schedule and assign",
    description: "Put the job on the calendar and assign the right field user.",
    hrefs: [
      { label: "Operations", href: "/ops?bucket=need_to_schedule#ops-workspace" },
      { label: "Calendar", href: "/calendar" },
    ],
    responsibility: "Dispatcher/Office",
  },
  {
    step: "Open job",
    description: "Field users open assigned work from Today or My Work.",
    hrefs: [
      { label: "Today", href: "/today" },
      { label: "My Work", href: "/ops/field" },
    ],
    responsibility: "Technician/Field, ECC/HERS Rater",
  },
  {
    step: "Capture notes/photos/context",
    description: "Add the field context needed to explain what happened.",
    hrefs: [{ label: "Today", href: "/today" }],
    responsibility: "Technician/Field, ECC/HERS Rater",
  },
  {
    step: "Finish outcome",
    description: "Choose Work Completed, Materials Needed, Approval Needed, or Other.",
    hrefs: [{ label: "My Work", href: "/ops/field" }],
    responsibility: "Technician/Field, ECC/HERS Rater",
  },
  {
    step: "Closeout",
    description: "Office/admin reviews what is complete or waiting and handles the next responsibility.",
    hrefs: [{ label: "Closeout queue", href: "/ops?bucket=closeout#ops-workspace" }],
    responsibility: "Dispatcher/Office, Owner/Admin",
  },
  {
    step: "Invoice",
    description: "Create, send, record, or mark external billing complete according to invoice mode.",
    hrefs: [{ label: "Operations", href: "/ops?bucket=closeout#ops-workspace" }],
    responsibility: "Billing/AR, Owner/Admin",
  },
  {
    step: "Tomorrow's Ops Review",
    description: "Use Today and Operations to see what needs action tomorrow.",
    hrefs: [
      { label: "Today", href: "/today" },
      { label: "Operations", href: "/ops" },
    ],
    responsibility: "Owner/Admin, Dispatcher/Office",
  },
];

export const roleTrainingTracks: RoleTrainingTrack[] = [
  {
    id: "owner-admin",
    title: "Owner / Admin",
    summary: "Own company readiness, team setup, daily operations, and cross-team follow-through.",
    missions: [
      "Launch Room",
      "Run Your First Job",
      "Start Your Day",
      "Tomorrow's Ops Review",
      "Account & Team Setup",
    ],
    whatYouDo: [
      "Keep Launch Room readiness current.",
      "Make sure the team can run one real job end to end.",
      "Review Today and Operations for work that needs attention.",
      "Open billing, payment, and ECC/HERS setup when your account uses those workflows.",
    ],
    whatToUnderstand: [
      "Setup gets the company ready; Training Room teaches the daily rhythm.",
      "Online invoice payments matter when Compliance Matters invoices are used.",
      "Office, field, billing, and ECC responsibilities should stay separate even when one person wears multiple hats.",
    ],
    notYourResponsibility: [
      "Do not turn every future feature into launch setup.",
      "Do not treat training completion as certification yet.",
      "Do not bypass role boundaries just to move faster.",
    ],
    links: [
      { label: "Launch Room", href: "/ops/admin#setup" },
      { label: "Admin workspaces", href: "/ops/admin#workspaces" },
      { label: "Today", href: "/today" },
      { label: "Operations", href: "/ops" },
    ],
  },
  {
    id: "dispatcher-office",
    title: "Dispatcher / Office",
    summary: "Run the daily board: intake, scheduling, assignment, waiting work, and closeout handoff.",
    missions: [
      "Start Your Day",
      "Office Daily Rhythm",
      "Schedule and Assign",
      "Handle Waiting / Parts Needed / Approval Needed",
      "Closeout Handoff",
    ],
    whatYouDo: [
      "Use Today and Operations to see what needs scheduling, assignment, or follow-up.",
      "Create customers and jobs when office intake owns the work.",
      "Move waiting work forward after Materials Needed, Approval Needed, or Other outcomes.",
      "Hand completed work to billing or owner/admin when invoice decisions are needed.",
    ],
    whatToUnderstand: [
      "Field users finish the visit; office owns the next operational step after waiting outcomes.",
      "Closeout is a handoff point, not a place to hide unresolved work.",
      "Customer contact attempts help the team see what has already been tried.",
    ],
    notYourResponsibility: [
      "Account subscription setup is not office daily rhythm unless you are also admin.",
      "Online payment setup is not dispatcher work.",
      "Final payment verification belongs to authorized billing/admin users.",
    ],
    links: [
      { label: "Today", href: "/today" },
      { label: "Operations", href: "/ops" },
      { label: "Needs scheduling", href: "/ops?bucket=need_to_schedule#ops-workspace" },
      { label: "Closeout", href: "/ops?bucket=closeout#ops-workspace" },
    ],
  },
  {
    id: "technician-field",
    title: "Technician / Field User",
    summary: "Open assigned work, capture field context, and finish the outcome for today's visit.",
    missions: [
      "Field User Rhythm",
      "Open Assigned Job",
      "Capture Notes / Photos / Context",
      "Finish Outcome",
      "Device Setup",
    ],
    whatYouDo: [
      "Start from Today or My Work.",
      "Open the assigned job and review customer, location, and work context.",
      "Add notes, photos, and the details office needs.",
      "Finish with Work Completed, Materials Needed, Approval Needed, or Other.",
    ],
    whatToUnderstand: [
      "Materials Needed, Approval Needed, and Other complete your visit and send follow-up to office.",
      "The field finish outcome is not the same as billing closeout.",
      "Use device notifications so assigned work and mentions are visible.",
    ],
    notYourResponsibility: [
      "Do not manage account setup, team permissions, subscription billing, or online payment setup.",
      "Do not treat payment reports or financial registers as field work.",
      "Do not own broad office backlog after you finish the visit.",
    ],
    links: [
      { label: "Today", href: "/today" },
      { label: "My Work", href: "/ops/field" },
      { label: "Device setup", href: "/account" },
      { label: "Notifications", href: "/ops/notifications" },
    ],
  },
  {
    id: "billing-ar",
    title: "Billing / AR",
    summary: "Own invoice review, payment status, payment attention, and financial follow-through.",
    missions: [
      "Billing Rhythm",
      "Closeout and Invoice",
      "Payment Review",
      "Payment Attention",
      "Customer Payment History",
    ],
    whatYouDo: [
      "Review completed work that is ready for invoice handling.",
      "Create, send, record, or review invoices according to account billing posture.",
      "Use payment status and payment reports to find money attention.",
      "Verify field-reported non-card collections only when you have that authority.",
    ],
    whatToUnderstand: [
      "Invoice truth and payment truth are separate from field visit completion.",
      "Failed payment attempts create attention; they do not count as collected money.",
      "Financial authority is intentionally separate from dispatch and field work.",
    ],
    notYourResponsibility: [
      "Do not change team permissions unless you are also admin.",
      "Do not manage technician field outcomes.",
      "Do not treat future payment add-ons as current behavior.",
    ],
    links: [
      { label: "Closeout", href: "/ops?bucket=closeout#ops-workspace" },
      { label: "Payments report", href: "/reports/payments" },
      { label: "Operations", href: "/ops" },
    ],
  },
  {
    id: "ecc-hers",
    title: "ECC / HERS Rater",
    summary: "Run ECC jobs, enter tests, handle failed/correction/retest flow, and protect cert closeout.",
    missions: [
      "ECC/HERS Rhythm",
      "Run ECC Job",
      "Test Entry",
      "Failed / Correction / Retest",
      "Cert Closeout",
      "Contractor Handoff",
    ],
    whatYouDo: [
      "Open assigned ECC jobs from Today or My Work.",
      "Enter test results in the correct ECC test area.",
      "Use failed/correction/retest flow when test truth requires it.",
      "Keep cert closeout separate from invoice/payment status.",
      "Use contractor handoff only when the workflow calls for it.",
    ],
    whatToUnderstand: [
      "ECC failed/retest comes from ECC test truth, not a generic manual field outcome.",
      "Retest work continues through the correct linked job when created.",
      "Invoice payment does not clear ECC permit, correction, retest, handoff, or cert blockers.",
    ],
    notYourResponsibility: [
      "Do not manage subscription setup or online payment setup.",
      "Do not use service follow-up outcomes as ECC failed/retest substitutes.",
      "Do not treat connected rater setup as ordinary technician training.",
    ],
    links: [
      { label: "Today", href: "/today" },
      { label: "My Work", href: "/ops/field" },
      { label: "ECC/HERS setup", href: "/ops/admin/company-profile#authorized-ecc-raters" },
      { label: "Operations", href: "/ops" },
    ],
  },
];
