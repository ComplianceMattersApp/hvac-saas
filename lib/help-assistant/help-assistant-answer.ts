import { firstJobMissionSteps, roleTrainingTracks } from "@/lib/training/training-room-content";
import type { HelpAssistantSafeContext } from "./help-assistant-context";
import { setupCoachChecklist, type SetupCoachItem } from "./setup-coach-knowledge";

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
      "I don't know that yet. Use Training Room or contact support. This would be a good help article for a future version.",
    links: [
      { label: "Training Room", href: "/training" },
      { label: "Admin Center", href: "/ops/admin" },
    ],
  };
}

export function answerAskComplianceMatters(
  question: string,
  context: HelpAssistantSafeContext,
): HelpAssistantAnswer {
  const q = normalizeQuestion(question);
  if (!q) return fallbackAnswer();

  if (q.includes("launch room") || q.includes("launch")) {
    return {
      status: "answered",
      title: "Launch Room",
      body:
        "Launch Room is the Admin Center startup area. It helps owners/admins confirm company readiness, team access, invoice workflow, and the first-job path before going deeper.",
      links: [{ label: "Open Launch Room", href: "/ops/admin" }],
    };
  }

  if (q.includes("training room") || q.includes("training")) {
    return {
      status: "answered",
      title: "Training Room",
      body:
        "Training Room teaches daily rhythms by responsibility. Start with Your Role Today, then use cross-training only when you help with that work.",
      links: [{ label: "Open Training Room", href: "/training" }],
    };
  }

  if (q.includes("first") || q.includes("start") || q.includes("what should i do")) {
    return {
      status: "answered",
      title: "Start Here",
      body:
        "Start with Launch Room, then run the First Job Mission: create a customer, create a job, schedule and assign it, finish the field outcome, close out, invoice, and review tomorrow's work.",
      links: [
        { label: "Launch Room", href: "/ops/admin" },
        { label: "Create customer", href: "/customers/new" },
        { label: "Create job", href: "/jobs/new" },
        { label: "Training Room", href: "/training" },
      ],
    };
  }

  if (q.includes("first job") || q.includes("run my first job")) {
    return {
      status: "answered",
      title: "Run Your First Job",
      body: firstJobMissionSteps
        .map((step, index) => `${index + 1}. ${step.step} (${step.responsibility})`)
        .join(" "),
      links: [
        { label: "Create customer", href: "/customers/new" },
        { label: "Create job", href: "/jobs/new" },
        { label: "Open Today", href: "/today" },
      ],
    };
  }

  if (q.includes("my role") || q.includes("responsible") || q.includes("responsibility")) {
    const track = roleTrackForContext(context);
    if (!track) return fallbackAnswer();

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

  if (q.includes("technician") || q.includes("tech") || q.includes("not my responsibility")) {
    const track = roleTrainingTracks.find((candidate) => candidate.id === "technician-field");
    return {
      status: "answered",
      title: "Technician / Field User",
      body:
        "Technicians start from Today or My Work, open assigned jobs, capture notes/photos/context, and finish with Work Completed, Materials Needed, Approval Needed, or Other. Admin setup, team permissions, subscription billing, online payment setup, payment reports, and broad office backlog are not field-owned training.",
      links: track?.links ?? [{ label: "My Work", href: "/ops/field" }],
    };
  }

  if (q.includes("online invoice") || q.includes("online payment") || q.includes("customer pay")) {
    return {
      status: "answered",
      title: "Online Invoice Payments",
      body:
        "Online Invoice Payments let customers pay eligible Compliance Matters invoices online. Owners/admins and Billing/AR should review whether this is needed for the account's invoice workflow. Technicians do not own this setup.",
      links: [
        { label: "Payment setup", href: "/ops/admin/company-profile#accept-payments" },
        { label: "Invoice mode", href: "/ops/admin/company-profile#invoice-settings" },
      ],
    };
  }

  if (q.includes("parts needed") || q.includes("materials needed")) {
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

  if (q.includes("approval needed") || q.includes("approval")) {
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

  if (q.includes("invite") || q.includes("team access") || q.includes("users")) {
    return {
      status: "answered",
      title: "Team Access",
      body:
        "Team access lives in Admin Center. Owners/admins can invite users and review roles. Billing/AR, office, and tech users should not manage team permissions unless they are also admin.",
      links: [{ label: "Team & Access", href: "/ops/admin/users" }],
    };
  }

  if (q.includes("company profile") || q.includes("business profile")) {
    return {
      status: "answered",
      title: "Company Profile",
      body:
        "Company Profile is where owners/admins review business identity, support contact details, invoice mode, account billing, and setup details.",
      links: [{ label: "Company Profile", href: "/ops/admin/company-profile" }],
    };
  }

  if (q.includes("invoice") || q.includes("payment") || q.includes("billing")) {
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

  if (q.includes("support") || q.includes("help")) {
    return {
      status: "answered",
      title: "Support",
      body:
        "If this local assistant does not know the answer, use Training Room or contact support. Early rollout support is owner-led and guided.",
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
