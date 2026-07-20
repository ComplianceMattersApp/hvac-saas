import { firstJobMissionSteps, roleTrainingTracks } from "@/lib/training/training-room-content";
import type { HelpAssistantSafeContext } from "./help-assistant-context";
import { setupCoachChecklist, type SetupCoachItem } from "./setup-coach-knowledge";
import { buildAskCmBaselineAnswer } from "./ask-cm-baseline-knowledge";
import { findAskCmEasterEgg } from "./ask-cm-easter-eggs";

export type HelpAssistantLink = {
  label: string;
  href: string;
};

export type HelpAssistantAnswer = {
  status: "answered" | "fallback";
  title: string;
  body: string;
  links: HelpAssistantLink[];
};

export type SetupCoachAnswer = {
  title: string;
  body: string;
  items: SetupCoachItem[];
  disclaimer: string;
};

function normalizeQuestion(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function firstJobWorkflowBody() {
  return firstJobMissionSteps
    .map((step, index) => `${index + 1}. ${step.step}`)
    .join(" ");
}

function roleTrackForContext(context: HelpAssistantSafeContext) {
  if (context.internalRole === "owner" || context.internalRole === "admin") {
    return roleTrainingTracks.find((track) => track.id === "owner-admin");
  }
  if (context.internalRole === "office") {
    return roleTrainingTracks.find((track) => track.id === "dispatcher-office");
  }
  if (context.internalRole === "billing") {
    return roleTrainingTracks.find((track) => track.id === "billing-ar");
  }
  if (context.internalRole === "tech" && context.productMode === "ecc_hers") {
    return roleTrainingTracks.find((track) => track.id === "ecc-hers");
  }
  if (context.internalRole === "tech") {
    return roleTrainingTracks.find((track) => track.id === "technician-field");
  }
  return null;
}

function fallbackAnswer(): HelpAssistantAnswer {
  return {
    status: "fallback",
    title: "I don't know that yet.",
    body:
      "I don't have a good answer for that yet, but this is a useful question for us to improve. Try Training Room, or contact support if this is blocking your work.",
    links: [
      { label: "Training Room", href: "/training" },
      { label: "Admin Center", href: "/ops/admin" },
    ],
  };
}

function roleAnswer(trackTitle: string, context: HelpAssistantSafeContext): HelpAssistantAnswer {
  const track = roleTrackForContext(context);
  if (track) {
    return {
      status: "answered",
      title: track.title,
      body: [
        track.summary,
        `What you do: ${track.whatYouDo.join(" ")}`,
        `Not your responsibility: ${track.notYourResponsibility.join(" ")}`,
      ].join(" "),
      links: track.links,
    };
  }

  return {
    status: "answered",
    title: trackTitle,
    body:
      "Training Room is organized by responsibility. Choose the role you are handling today, then use that track to see what you own and what should stay with another role.",
    links: [{ label: "Open Training Room", href: "/training" }],
  };
}

export function answerAskComplianceMatters(
  question: string,
  context: HelpAssistantSafeContext,
): HelpAssistantAnswer {
  const q = normalizeQuestion(question);
  if (!q) return fallbackAnswer();

  const easterEgg = findAskCmEasterEgg(q);
  if (easterEgg) return easterEgg;

  const baselineAnswer = buildAskCmBaselineAnswer(q, context);
  if (baselineAnswer) return baselineAnswer;

  if (
    includesAny(q, [
      "ready for operations",
      "ready for operation",
      "ready to operate",
      "required now",
      "required setup",
      "setup is required",
      "what setup",
    ])
  ) {
    return {
      status: "answered",
      title: "Ready for operations",
      body:
        "Ready for operations means required setup is complete enough to run normal work. Required Now covers company basics, team access, invoice workflow, and Online Invoice Payments when Compliance Matters invoices are used.",
      links: [{ label: "Open Launch Room", href: "/ops/admin#setup" }],
    };
  }

  if (includesAny(q, ["what can wait", "can wait", "optional setup", "later setup", "park the rest"])) {
    return {
      status: "answered",
      title: "Can Wait",
      body:
        "Can Wait items should not block the first job unless your account selected a workflow that needs them. Finish Required Now first, then use Recommended Next and Can Wait as follow-up.",
      links: [{ label: "Open Launch Room", href: "/ops/admin#setup" }],
    };
  }

  if (includesAny(q, ["launch room", "launch", "admin center"])) {
    return {
      status: "answered",
      title: "Launch Room",
      body:
        "Launch Room is the Admin Center startup area: get your company ready, run your first job, and park the rest until later. I can guide you, but I cannot change settings.",
      links: [{ label: "Open Launch Room", href: "/ops/admin#setup" }],
    };
  }

  if (includesAny(q, ["today: understand your day", "why does training start with today", "training start"])) {
    return {
      status: "answered",
      title: "Today: Understand Your Day",
      body:
        "Training starts with Today because the team should understand the day before creating more work or jumping into queues. Today shows what is scheduled, assigned, waiting, urgent, or ready for follow-up.",
      links: [
        { label: "Open Today", href: "/today" },
        { label: "Training Room", href: "/training" },
      ],
    };
  }

  if (includesAny(q, ["training room", "training", "role selection", "role track"])) {
    return {
      status: "answered",
      title: "Training Room",
      body:
        "Training Room teaches daily rhythms by responsibility. Start with Your Role Today, then use cross-training only when you actually help with that work.",
      links: [{ label: "Open Training Room", href: "/training" }],
    };
  }

  if (includesAny(q, ["how do i create my first job", "create my first job", "start job intake", "job intake"])) {
    return {
      status: "answered",
      title: "Intake & Schedule",
      body:
        "Use job intake when the goal is to run work. The flow can create or select the customer, confirm the location, create the job, and schedule or assign it if appointment details are known.",
      links: [{ label: "Start job intake", href: "/jobs/new" }],
    };
  }

  if (includesAny(q, ["create a customer first", "customer first", "add customer first"])) {
    return {
      status: "answered",
      title: "Customer first or job intake",
      body:
        "You can add a customer separately when you want to build the customer list first, but first-job training should usually start from job intake so customer, location, job, and schedule stay connected.",
      links: [
        { label: "Start job intake", href: "/jobs/new" },
        { label: "Add customer", href: "/customers/new" },
      ],
    };
  }

  if (includesAny(q, ["closeout operations", "close out", "closeout", "after field work", "after field", "job closeout"])) {
    return {
      status: "answered",
      title: "Closeout Operations",
      body:
        "Closeout Operations is where office/admin decides the next step after field work: job closeout, customer follow-up, return work, waiting status, billing handoff, invoice review, or payment attention.",
      links: [{ label: "Open Operations", href: "/ops?bucket=closeout#ops-workspace" }],
    };
  }

  if (includesAny(q, ["tomorrow", "tomorrow's ops", "tomorrows ops", "check tomorrow", "review tomorrow"])) {
    return {
      status: "answered",
      title: "Tomorrow's Ops Review",
      body:
        "Use Today and Operations the next morning to see what needs action, what is waiting, and what should be closed out. This keeps yesterday's unfinished work visible.",
      links: [
        { label: "Open Today", href: "/today" },
        { label: "Open Operations", href: "/ops" },
      ],
    };
  }

  if (includesAny(q, ["field work happen", "where does field work", "finish outcome happen", "where does finish", "inside the job"])) {
    return {
      status: "answered",
      title: "Field Work and Finish Outcome",
      body:
        "Field work happens inside the job page after the job exists. The field user captures notes/photos/context there, then finishes with Work Completed, Materials Needed, Approval Needed, or Other.",
      links: [
        { label: "Open My Work", href: "/ops/field" },
        { label: "Open Ops Queue", href: "/ops" },
      ],
    };
  }

  if (includesAny(q, ["first job", "run my first job"])) {
    return {
      status: "answered",
      title: "Run Your First Job",
      body: `Use the corrected workflow phases: ${firstJobWorkflowBody()}. This assistant does not create jobs, send invoices, or record payments.`,
      links: [
        { label: "Start job intake", href: "/jobs/new" },
        { label: "Open Today", href: "/today" },
        { label: "Open Operations", href: "/ops" },
      ],
    };
  }

  if (includesAny(q, ["what should i do first", "where do i start", "start here", "what do i do first"])) {
    return {
      status: "answered",
      title: "Start Here",
      body:
        "Start with Today so you understand the day before it begins. Then use the First Job Mission as a workflow map: intake and scheduling, field work, finish outcome, closeout operations, and tomorrow's ops review.",
      links: [
        { label: "Launch Room", href: "/ops/admin" },
        { label: "Open Today", href: "/today" },
        { label: "Start job intake", href: "/jobs/new" },
        { label: "Training Room", href: "/training" },
      ],
    };
  }

  if (includesAny(q, ["today vs ops", "today, ops", "today ops", "difference between today", "operations and my work"])) {
    return {
      status: "answered",
      title: "Today, Operations, and My Work",
      body:
        "Today is the daily orientation view. Operations is the office/admin queue for scheduling, waiting, closeout, and attention. My Work is the field user's assigned work list.",
      links: [
        { label: "Open Today", href: "/today" },
        { label: "Open Operations", href: "/ops" },
        { label: "Open My Work", href: "/ops/field" },
      ],
    };
  }

  if (includesAny(q, ["what is today", "today page", "open today"])) {
    return {
      status: "answered",
      title: "Today",
      body:
        "Today is the place to understand the day before it begins. It helps each role see scheduled work, assigned work, waiting items, urgent attention, and follow-up.",
      links: [{ label: "Open Today", href: "/today" }],
    };
  }

  if (includesAny(q, ["what is operations", "what is ops", "ops queue", "needs attention", "work needs attention"])) {
    return {
      status: "answered",
      title: "Operations",
      body:
        "Operations is the office/admin queue for work that needs scheduling, assignment, waiting follow-up, closeout, billing handoff, or other attention.",
      links: [{ label: "Open Operations", href: "/ops" }],
    };
  }

  if (includesAny(q, ["what is my work", "my work", "where does a technician start", "field start"])) {
    return {
      status: "answered",
      title: "My Work",
      body:
        "My Work is the field user's assigned work view. Technicians should start from Today or My Work, open the job, capture context, and finish the outcome.",
      links: [{ label: "Open My Work", href: "/ops/field" }],
    };
  }

  if (includesAny(q, ["my role", "responsible", "responsibility", "not my responsibility"])) {
    return roleAnswer("Your Role Today", context);
  }

  if (includesAny(q, ["technician", "tech", "field user", "worker"])) {
    const track = roleTrainingTracks.find((candidate) => candidate.id === "technician-field");
    return {
      status: "answered",
      title: "Technician / Field User",
      body:
        "Technicians start from Today or My Work, open assigned jobs, capture notes/photos/context, and finish with Work Completed, Materials Needed, Approval Needed, or Other. Admin setup, team permissions, subscription billing, online payment setup, payment reports, and broad office backlog are not field-owned training.",
      links: track?.links ?? [{ label: "My Work", href: "/ops/field" }],
    };
  }

  if (includesAny(q, ["admin use", "owner use", "how should an admin", "how should owner"])) {
    const track = roleTrainingTracks.find((candidate) => candidate.id === "owner-admin");
    return {
      status: "answered",
      title: "Owner / Admin",
      body:
        "Owner/Admin users keep Launch Room readiness current, review Today and Operations, manage team and company setup, and make sure one real job can move from intake to invoice.",
      links: track?.links ?? [{ label: "Launch Room", href: "/ops/admin#setup" }],
    };
  }

  if (includesAny(q, ["office use", "dispatch use", "dispatcher", "office/dispatch", "how should office", "how should dispatch"])) {
    const track = roleTrainingTracks.find((candidate) => candidate.id === "dispatcher-office");
    return {
      status: "answered",
      title: "Dispatcher / Office",
      body:
        "Office/dispatch owns intake, scheduling, assignment, waiting follow-up, customer follow-up, and closeout handoff. Use Today and Operations as the daily board.",
      links: track?.links ?? [{ label: "Operations", href: "/ops" }],
    };
  }

  if (includesAny(q, ["billing use", "how should billing", "billing responsible", "who can issue", "review invoices"])) {
    const track = roleTrainingTracks.find((candidate) => candidate.id === "billing-ar");
    return {
      status: "answered",
      title: "Billing / AR",
      body:
        "Billing/AR owns invoice review, payment status, payment attention, and financial follow-through. Invoice and payment review are separate from field visit completion and dispatch work.",
      links: track?.links ?? [{ label: "Closeout", href: "/ops?bucket=closeout#ops-workspace" }],
    };
  }

  if (
    includesAny(q, ["ecc", "hers", "rater", "how should ecc", "how should hers"])
    && !includesAny(q, ["handoff", "connection code", "connected rater"])
  ) {
    const track = roleTrainingTracks.find((candidate) => candidate.id === "ecc-hers");
    return {
      status: "answered",
      title: "ECC / HERS Rater",
      body:
        "ECC/HERS raters open assigned ECC jobs, enter test results, use failed/correction/retest flow when test truth requires it, and keep cert closeout separate from invoice/payment status.",
      links: track?.links ?? [{ label: "My Work", href: "/ops/field" }],
    };
  }

  if (includesAny(q, ["online invoice", "online payment", "customer pay", "pay online", "take cards", "stripe", "accept online invoice payments", "set up online payments"])) {
    return {
      status: "answered",
      title: "Online Invoice Payments",
      body:
        "Online Invoice Payments let customers pay eligible Compliance Matters invoices online. Owners/admins and Billing/AR should review this when the account uses Compliance Matters invoices. Technicians do not own this setup.",
      links: [
        { label: "Payment setup", href: "/ops/admin/company-profile#accept-payments" },
        { label: "Invoice mode", href: "/ops/admin/company-profile#invoice-settings" },
      ],
    };
  }

  if (includesAny(q, ["why can't i see billing", "cant see billing", "cannot see billing", "can't see payments", "cannot see payments"])) {
    return {
      status: "answered",
      title: "Billing visibility",
      body:
        "Billing and payment views are limited to users with financial responsibility. If you need access, ask an owner/admin to review your role. This assistant cannot change permissions.",
      links: [{ label: "Training Room", href: "/training" }],
    };
  }

  if (includesAny(q, ["payment attention", "failed payment", "payment review"])) {
    return {
      status: "answered",
      title: "Payment Attention",
      body:
        "Payment attention means money follow-up is needed. Billing/AR or owner/admin users review invoice status, payment status, and next financial follow-through.",
      links: [
        { label: "Payments report", href: "/reports/payments" },
        { label: "Closeout", href: "/ops?bucket=closeout#ops-workspace" },
      ],
    };
  }

  if (includesAny(q, ["work completed", "what does work completed"])) {
    return {
      status: "answered",
      title: "Work Completed",
      body:
        "Work Completed means today's field responsibility is finished for that visit. Office/admin or billing may still need to handle closeout, invoice review, or payment attention after field work.",
      links: [{ label: "Open My Work", href: "/ops/field" }],
    };
  }

  if (includesAny(q, ["parts needed", "materials needed", "need parts", "need materials"])) {
    return {
      status: "answered",
      title: "Materials Needed",
      body:
        "Materials Needed finishes today's field visit and sends the unresolved item to office follow-up. The office decides the next operational step; it does not create payment or invoice behavior by itself.",
      links: [
        { label: "My Work", href: "/ops/field" },
        { label: "Operations", href: "/ops?bucket=pending_info#ops-workspace" },
      ],
    };
  }

  if (includesAny(q, ["approval needed", "need approval", "approval"])) {
    return {
      status: "answered",
      title: "Approval Needed",
      body:
        "Approval Needed finishes today's field visit and sends the unresolved approval item to office follow-up. The office handles customer communication or next scheduling decisions.",
      links: [
        { label: "My Work", href: "/ops/field" },
        { label: "Operations", href: "/ops?bucket=pending_info#ops-workspace" },
      ],
    };
  }

  if (includesAny(q, ["unable to complete", "can't finish", "cant finish", "other outcome"])) {
    return {
      status: "answered",
      title: "Unable to Complete / Other",
      body:
        "Unable to Complete or Other completes the field visit responsibility and sends the unresolved reason to office follow-up. No return visit, invoice, or payment is created automatically.",
      links: [
        { label: "My Work", href: "/ops/field" },
        { label: "Operations", href: "/ops?bucket=pending_info#ops-workspace" },
      ],
    };
  }

  if (includesAny(q, ["who owns the job after", "after a field outcome", "tech not manage", "whole backlog", "broad backlog"])) {
    return {
      status: "answered",
      title: "After a field outcome",
      body:
        "After Work Completed, Materials Needed, Approval Needed, or Other, the technician's visit responsibility is done. Office/admin decides the next operational step, and billing handles invoice/payment work when appropriate.",
      links: [{ label: "Open Operations", href: "/ops" }],
    };
  }

  if (includesAny(q, ["invite", "team access", "team & access", "users", "add user", "teammate"])) {
    return {
      status: "answered",
      title: "Team Access",
      body:
        "Team access lives in Admin Center. Owners/admins can invite users and review roles. Billing/AR, office, and tech users should not manage team permissions unless they are also admin.",
      links: [{ label: "Team & Access", href: "/ops/admin/users" }],
    };
  }

  if (includesAny(q, ["company info", "company information", "company profile", "business profile", "change company"])) {
    return {
      status: "answered",
      title: "Company Profile",
      body:
        "Company Profile is where owners/admins review business identity, support contact details, invoice mode, account billing, and setup details.",
      links: [{ label: "Company Profile", href: "/ops/admin/company-profile" }],
    };
  }

  if (includesAny(q, ["field setup", "device setup", "notifications", "pricebook starter", "field-ready"])) {
    return {
      status: "answered",
      title: "Field Setup",
      body:
        "Field Setup covers field-ready basics such as starter items, job defaults, device setup, notifications, and the habits field users need before assigned work starts.",
      links: [
        { label: "Field setup", href: "/ops/admin/pricebook" },
        { label: "Device setup", href: "/account" },
      ],
    };
  }

  if (includesAny(q, ["ecc/hers handoff", "hers handoff", "contractor handoff", "connection codes", "connected raters"])) {
    return {
      status: "answered",
      title: "ECC/HERS Handoff",
      body:
        "ECC/HERS Handoff is the admin setup area for raters, connection codes, contractor relationships, and handoff details when the account uses that workflow.",
      links: [{ label: "ECC/HERS setup", href: "/ops/admin/company-profile#authorized-ecc-raters" }],
    };
  }

  if (includesAny(q, ["invoice", "payment", "billing", "billing owns", "field/office"])) {
    return {
      status: "answered",
      title: "Billing / AR",
      body:
        "Billing/AR owns invoice review, payment attention, payment status, and financial follow-through. Financial authority is separate from dispatch and field work.",
      links: [
        { label: "Closeout", href: "/ops?bucket=closeout#ops-workspace" },
        { label: "Payments report", href: "/reports/payments" },
      ],
    };
  }

  if (includesAny(q, ["not helpful", "what does not helpful", "does feedback", "feedback button"])) {
    return {
      status: "answered",
      title: "Not helpful",
      body:
        "Not helpful sends a private feedback signal for review when help-gap logging is enabled. It does not create a support case, change app data, or train the model automatically.",
      links: [{ label: "Training Room", href: "/training" }],
    };
  }

  if (includesAny(q, ["support case", "create a support case", "does the assistant create", "still need help"])) {
    return {
      status: "answered",
      title: "Support cases",
      body:
        "I do not create a support case yet. If this is blocking your work, contact support through the normal owner-led support path.",
      links: [{ label: "Training Room", href: "/training" }],
    };
  }

  if (includesAny(q, ["stuck", "contact support", "support", "help", "assistant does not know", "does not know"])) {
    return {
      status: "answered",
      title: "Support",
      body:
        "If this local assistant does not know the answer, use Training Room or contact support. I can guide you, but I cannot change settings, create jobs, send invoices, record payments, or create a support case yet.",
      links: [{ label: "Training Room", href: "/training" }],
    };
  }

  return fallbackAnswer();
}

export function getSetupCoachAnswer(): SetupCoachAnswer {
  return {
    title: "Setup Coach",
    body:
      "Start with the smallest path that gets one real job moving. This assistant does not change settings or perform setup automatically.",
    items: setupCoachChecklist,
    disclaimer: "Read-only guidance only. No setup, invites, customer creation, job creation, or payment onboarding happens here.",
  };
}
