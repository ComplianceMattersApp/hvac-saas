import type { HelpAssistantSafeContext } from "./help-assistant-context";

type BaselineLink = { label: string; href: string };

export type AskCmBaselineSource = {
  docs: string[];
  code: string[];
};

export type AskCmBaselineIntent = {
  id: string;
  phrases: string[];
  title: string;
  body: string | ((context: HelpAssistantSafeContext) => string);
  links: BaselineLink[];
  sources: AskCmBaselineSource;
};

const financialAccessNote = (context: HelpAssistantSafeContext) =>
  context.canViewFinancialRegister
    ? ""
    : " If you cannot see the invoice or payment controls, ask an owner or admin to check your financial access.";

/**
 * Curated Day 1 workflow answers. Sources are review metadata, not user-facing
 * citations. Current code behavior wins if a supporting document becomes stale.
 */
export const askCmBaselineIntents: AskCmBaselineIntent[] = [
  {
    id: "create_job",
    phrases: ["how do i create a new job", "create a new job", "new job", "add job", "create work order", "add work order"],
    title: "Create a New Job",
    body: "Open Menu and choose New Job. Select or add the customer, confirm the service location, choose the type of work, and add the reason for the visit or known work items. Add a schedule if you know it, or leave it unscheduled for dispatch, then create the job.",
    links: [{ label: "New Job", href: "/jobs/new" }, { label: "Jobs", href: "/jobs" }],
    sources: {
      docs: ["docs/PROJECT_TRUTH.md", "docs/ACTIVE/Visit_Scope_First_Model_Brief.md"],
      code: ["app/jobs/new/page.tsx", "app/jobs/new/NewJobForm.tsx"],
    },
  },
  {
    id: "schedule_job",
    phrases: ["how do i schedule a job", "schedule a job", "book job", "book a job", "schedule appointment", "book appointment"],
    title: "Schedule a Job",
    body: "Open the job and use its Schedule section to choose the date and time. You can also open Calendar to review the team schedule and move unscheduled work into an available time. Assignment can be added when the right person is known.",
    links: [{ label: "Calendar", href: "/calendar" }, { label: "Jobs", href: "/jobs" }],
    sources: {
      docs: ["docs/PROJECT_TRUTH.md", "docs/ACTIVE/Mobile_Job_Page_V2_Blueprint.md"],
      code: ["app/calendar/page.tsx", "app/jobs/[id]/v2/_components/SchedulePanel.tsx"],
    },
  },
  {
    id: "send_invoice",
    phrases: ["how do i send an invoice", "send an invoice", "send invoice", "send bill", "email invoice", "email the invoice"],
    title: "Send an Invoice",
    body: (context) => "Open the job, then open its invoice workspace. Review the customer, charges, and total. If it is still a draft, use Issue & Send Invoice. If it is already issued, use Send Invoice Email. Owner, admin, or billing access may be required." + financialAccessNote(context),
    links: [{ label: "Jobs", href: "/jobs" }, { label: "Closeout", href: "/ops?bucket=closeout#ops-workspace" }],
    sources: {
      docs: ["docs/ACTIVE/Workflow_Modernization_B8C_Work_Items_to_Invoice_Flow_Simplification_Closeout.md"],
      code: ["app/jobs/[id]/invoice/page.tsx", "lib/auth/field-billing-access.ts"],
    },
  },
  {
    id: "create_invoice",
    phrases: ["how do i invoice", "how do i create an invoice", "create an invoice", "make invoice", "make an invoice", "bill customer", "bill the customer", "build invoice"],
    title: "Create an Invoice",
    body: (context) => "Open the job and make sure the completed work is listed under Work Items. Choose Create Invoice or Build Invoice. Eligible Work Items are brought into a draft when available. Review the Invoice Charges, prices, customer, and total before issuing or sending it." + financialAccessNote(context),
    links: [{ label: "Jobs", href: "/jobs" }, { label: "Closeout", href: "/ops?bucket=closeout#ops-workspace" }],
    sources: {
      docs: ["docs/ACTIVE/Workflow_Modernization_B8C_Work_Items_to_Invoice_Flow_Simplification_Closeout.md", "docs/ACTIVE/Visit_Scope_First_Model_Brief.md"],
      code: ["app/jobs/[id]/v2/page.tsx", "app/jobs/[id]/invoice/page.tsx", "lib/jobs/job-invoice-action.ts"],
    },
  },
  {
    id: "record_payment",
    phrases: ["how do i record a payment", "record a payment", "take payment", "mark paid", "mark as paid", "record cash", "record check"],
    title: "Record a Payment",
    body: (context) => "Open the job's issued invoice and go to the payment section. Owner, admin, or billing users can record a confirmed cash, check, or other manual payment. Card payments become paid only after the payment provider confirms them; do not mark a card payment paid by hand." + financialAccessNote(context),
    links: [{ label: "Jobs", href: "/jobs" }, { label: "Payments Report", href: "/reports/payments" }],
    sources: {
      docs: ["docs/ACTIVE/Workflow_Modernization_B7_Field_Billing_Payments_Reconciliation_Closeout.md", "docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md"],
      code: ["app/jobs/[id]/invoice/page.tsx", "lib/actions/internal-invoice-payment-actions.ts"],
    },
  },
  {
    id: "close_job",
    phrases: ["how do i close out a job", "close out a job", "close job", "finish job", "complete job"],
    title: "Close Out a Job",
    body: "Open the job and finish the field outcome first. Choose the outcome that matches what happened, such as Work Completed, Materials Needed, Approval Needed, or Unable to Complete. Office or admin then reviews Closeout Operations for billing, follow-up, return work, or final closeout.",
    links: [{ label: "Jobs", href: "/jobs" }, { label: "Closeout", href: "/ops?bucket=closeout#ops-workspace" }],
    sources: {
      docs: ["docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md", "docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md"],
      code: ["app/jobs/[id]/v2/_components/FinishOutcomeCards.tsx", "app/jobs/[id]/_components/FieldOutcomePanel.tsx"],
    },
  },
  {
    id: "ecc_retest",
    phrases: ["how does an ecc retest work", "ecc retest", "hers retest", "retest work", "create retest"],
    title: "ECC Retest",
    body: "Complete and save the ECC test results on the original job. A failed result moves the work into correction or retest follow-up. Review the failure details, create or open the linked retest job, schedule it, and enter the new test results there. The original test history stays attached to the service chain.",
    links: [{ label: "Operations", href: "/ops" }, { label: "Jobs", href: "/jobs" }],
    sources: {
      docs: ["docs/ACTIVE/Guided_Workflow_Maturation_Closeout.md", "docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md"],
      code: ["app/jobs/[id]/tests/page.tsx", "app/jobs/[id]/v2/page.tsx"],
    },
  },
  {
    id: "add_customer",
    phrases: ["how do i add a customer", "add a customer", "create customer", "new customer"],
    title: "Add a Customer",
    body: "Open Customers and choose Add Customer. Enter the customer details and service location, then save. You can also add a customer during New Job intake so the customer, location, and job stay connected.",
    links: [{ label: "Add Customer", href: "/customers/new" }, { label: "New Job", href: "/jobs/new" }],
    sources: {
      docs: ["docs/PROJECT_TRUTH.md"],
      code: ["app/customers/new/page.tsx", "app/jobs/new/NewJobForm.tsx"],
    },
  },
  {
    id: "add_equipment",
    phrases: ["how do i add equipment", "add equipment", "new equipment", "add a system", "add system"],
    title: "Add Equipment",
    body: "Open the job and go to Equipment. Choose Add Equipment, enter the system details you know, and save. Add a label photo when it helps identify the unit. You can return later to fill in missing model or serial details.",
    links: [{ label: "Jobs", href: "/jobs" }],
    sources: {
      docs: ["docs/PROJECT_TRUTH.md", "docs/ACTIVE/Mobile_Job_Page_V2_Blueprint.md"],
      code: ["app/jobs/[id]/v2/page.tsx", "app/jobs/[id]/_components/EquipmentCreateForm.tsx"],
    },
  },
  {
    id: "add_notes_photos",
    phrases: ["how do i add notes or photos", "add notes or photos", "add note", "add notes", "add photo", "add photos", "upload photo"],
    title: "Add Notes or Photos",
    body: "Open the job. Use Notes for updates the team should see. Use Photos & Files to take a photo or upload from the device, then finish the upload. Keep customer-visible information in the appropriate shared area and internal details in internal notes.",
    links: [{ label: "Jobs", href: "/jobs" }],
    sources: {
      docs: ["docs/PROJECT_TRUTH.md", "docs/ACTIVE/Mobile_Job_Page_V2_Blueprint.md"],
      code: ["app/jobs/[id]/v2/_components/NoteComposer.tsx", "app/jobs/[id]/_components/JobAttachmentsInternal.tsx"],
    },
  },
  {
    id: "find_payments",
    phrases: ["how do i find payments", "find payments", "where are payments", "payment history", "see payments"],
    title: "Find Payments",
    body: (context) => "Open Reports and choose Payments to review recorded payment activity. For one customer, open the customer profile and check Payment History. For one invoice, open its job invoice workspace." + financialAccessNote(context),
    links: [{ label: "Payments Report", href: "/reports/payments" }, { label: "Customers", href: "/customers" }],
    sources: {
      docs: ["docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md"],
      code: ["app/reports/payments/page.tsx", "app/customers/[id]/_components/PaymentHistoryCard.tsx"],
    },
  },
  {
    id: "payments_report",
    phrases: ["how do i use the payments report", "use payments report", "payments report", "payment report"],
    title: "Payments Report",
    body: (context) => "Open Reports, then Payments. Use the date and status filters to review recorded payments and open the related invoice or job when follow-up is needed. The report shows payment truth; it does not create or change payments." + financialAccessNote(context),
    links: [{ label: "Payments Report", href: "/reports/payments" }],
    sources: {
      docs: ["docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md"],
      code: ["app/reports/payments/page.tsx", "lib/reports/payments-register.ts"],
    },
  },
  {
    id: "training_room",
    phrases: ["how do i use the training room", "use training room", "what is training room", "open training room"],
    title: "Training Room",
    body: "Open Training Room and choose the role you are handling today. Start with that role's daily workflow, then use the First Job Mission to practice the path from intake through closeout. Use cross-training only when you also help with another role's work.",
    links: [{ label: "Open Training Room", href: "/training" }],
    sources: {
      docs: ["docs/ACTIVE/Startup_Maturity_Lane_Model_Lock.md"],
      code: ["app/training/page.tsx", "lib/training/training-room-content.ts"],
    },
  },
];

export function findAskCmBaselineIntent(question: string) {
  const normalized = String(question ?? "").trim().toLowerCase();
  return askCmBaselineIntents.find((intent) => intent.phrases.some((phrase) => normalized.includes(phrase))) ?? null;
}

export function buildAskCmBaselineAnswer(question: string, context: HelpAssistantSafeContext) {
  const intent = findAskCmBaselineIntent(question);
  if (!intent) return null;
  return {
    status: "answered" as const,
    title: intent.title,
    body: typeof intent.body === "function" ? intent.body(context) : intent.body,
    links: intent.links,
  };
}
