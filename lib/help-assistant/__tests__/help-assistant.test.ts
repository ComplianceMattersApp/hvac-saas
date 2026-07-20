import { describe, expect, it } from "vitest";
import { buildHelpAssistantSafeContext } from "../help-assistant-context";
import { isAskComplianceMattersEnabled } from "../help-assistant-flags";
import { answerAskComplianceMatters, getSetupCoachAnswer } from "../help-assistant-answer";
import { createUnknownAnswerHelpGapEvent } from "../help-gap-events";

const techContext = buildHelpAssistantSafeContext({
  pathname: "/training?customer_id=secret",
  internalRole: "tech",
  productMode: "hvac_service",
  canViewFinancialRegister: false,
});

describe("ask compliance matters local shell", () => {
  it("is disabled unless the feature flag is explicitly enabled", () => {
    expect(isAskComplianceMattersEnabled({})).toBe(false);
    expect(isAskComplianceMattersEnabled({ ENABLE_ASK_COMPLIANCE_MATTERS: "false" })).toBe(false);
    expect(isAskComplianceMattersEnabled({ ENABLE_ASK_COMPLIANCE_MATTERS: "true" })).toBe(true);
  });

  it("returns curated local answers for known questions", () => {
    const answer = answerAskComplianceMatters("What is Training Room?", techContext);
    expect(answer.status).toBe("answered");
    expect(answer.title).toBe("Training Room");
    expect(answer.links).toContainEqual({ label: "Open Training Room", href: "/training" });
  });

  it("returns a safe fallback for unknown questions", () => {
    const answer = answerAskComplianceMatters("Can you solve something unrelated?", techContext);
    expect(answer.status).toBe("fallback");
    expect(answer.body).toContain("I don't have a good answer for that yet");
    expect(answer.body).toContain("contact support if this is blocking your work");
  });

  it("returns a read-only setup coach checklist", () => {
    const coach = getSetupCoachAnswer();
    expect(coach.items.map((item) => item.label)).toContain("Open Launch Room");
    expect(coach.items.map((item) => item.label)).toContain("Understand Today");
    expect(coach.items.map((item) => item.label)).toContain("Review Tomorrow in Today/Ops");
    expect(coach.items.map((item) => item.href)).toContain("/training");
    expect(coach.items.find((item) => item.label === "Run Your First Job")?.detail).toContain("workflow map");
    expect(coach.items.find((item) => item.label === "Run Your First Job")?.detail).toContain("closeout operations");
    expect(coach.disclaimer).toContain("Read-only guidance only");
  });

  it("builds safe context without query strings or sensitive identifiers", () => {
    const context = buildHelpAssistantSafeContext({
      pathname: "/jobs/123?token=secret&invoice_id=abc",
      internalRole: "billing",
      productMode: "hybrid",
      canViewFinancialRegister: true,
    });

    expect(context.pathname).toBe("/jobs/123");
    expect(JSON.stringify(context)).not.toContain("secret");
    expect(JSON.stringify(context)).not.toContain("invoice_id");
    expect(context.roleLabel).toBe("Billing / AR");
  });

  it("does not foreground billing setup as technician responsibility", () => {
    const answer = answerAskComplianceMatters("What is my role responsible for?", techContext);
    expect(answer.title).toBe("Technician / Field User");
    expect(answer.body).toContain("Start from Today or My Work");
    expect(answer.body).toContain("Do not manage account setup");
  });

  it("answers online invoice payments without processor jargon", () => {
    const answer = answerAskComplianceMatters("Can we use Stripe to take cards and let customers pay online?", techContext);
    expect(answer.body).toContain("customers pay eligible Compliance Matters invoices online");
    expect(answer.body.toLowerCase()).not.toContain("stripe");
    expect(answer.body.toLowerCase()).not.toContain("connected account");
    expect(answer.body.toLowerCase()).not.toContain("charges enabled");
    expect(answer.body.toLowerCase()).not.toContain("payouts enabled");
  });

  it("answers first-job questions as workflow phases without fake record links", () => {
    const answer = answerAskComplianceMatters("How do I run my first job?", techContext);
    expect(answer.body).toContain("Today: Understand Your Day");
    expect(answer.body).toContain("Intake & Schedule");
    expect(answer.body).toContain("Closeout Operations");
    expect(answer.links).toContainEqual({ label: "Start job intake", href: "/jobs/new" });
    expect(answer.links).toContainEqual({ label: "Open Today", href: "/today" });
    expect(answer.links).toContainEqual({ label: "Open Operations", href: "/ops" });
    expect(answer.links.map((link) => link.href)).not.toContain("/jobs/[id]");
    expect(answer.links.map((link) => link.href)).not.toContain("/jobs/[id]/invoice");
  });

  it("answers common launch and setup questions with local knowledge", () => {
    expect(answerAskComplianceMatters("What does Ready for operations mean?", techContext).title).toBe("Ready for operations");
    expect(answerAskComplianceMatters("What can wait?", techContext).title).toBe("Can Wait");
    expect(answerAskComplianceMatters("Where do I change company info?", techContext).title).toBe("Company Profile");
    expect(answerAskComplianceMatters("Where do I invite users?", techContext).title).toBe("Team Access");
    expect(answerAskComplianceMatters("What is Field Setup?", techContext).title).toBe("Field Setup");
    expect(answerAskComplianceMatters("What is ECC/HERS Handoff?", techContext).title).toBe("ECC/HERS Handoff");
  });

  it("answers daily work and first-job workflow questions", () => {
    expect(answerAskComplianceMatters("What is Today?", techContext).title).toBe("Today");
    expect(answerAskComplianceMatters("What is Operations?", techContext).title).toBe("Operations");
    expect(answerAskComplianceMatters("What is My Work?", techContext).title).toBe("My Work");
    expect(answerAskComplianceMatters("What is the difference between Today, Ops, and My Work?", techContext).body).toContain("daily orientation");
    expect(answerAskComplianceMatters("Should I create a customer first?", techContext).body).toContain("job intake");
    expect(answerAskComplianceMatters("Where does field work happen?", techContext).body).toContain("inside the job page");
    expect(answerAskComplianceMatters("What should I check tomorrow?", techContext).title).toBe("Tomorrow's Ops Review");
  });

  it("answers field outcome ownership questions without adding side effects", () => {
    expect(answerAskComplianceMatters("What does Work Completed mean?", techContext).body).toContain("field responsibility is finished");
    expect(answerAskComplianceMatters("What does Materials Needed mean?", techContext).body).toContain("office follow-up");
    expect(answerAskComplianceMatters("What does Approval Needed mean?", techContext).body).toContain("office handles");
    expect(answerAskComplianceMatters("What does Unable to Complete mean?", techContext).body).toContain("No return visit, invoice, or payment is created automatically");
    expect(answerAskComplianceMatters("Who owns the job after a field outcome?", techContext).body).toContain("Office/admin decides");
  });

  it("keeps role-aware answers focused by responsibility", () => {
    const billingContext = buildHelpAssistantSafeContext({
      pathname: "/training",
      internalRole: "billing",
      productMode: "hvac_service",
      canViewFinancialRegister: true,
    });
    const ownerContext = buildHelpAssistantSafeContext({
      pathname: "/ops/admin",
      internalRole: "admin",
      isAccountOwner: true,
      productMode: "hybrid",
      canViewFinancialRegister: true,
    });

    const techAnswer = answerAskComplianceMatters("How should a technician use the app?", techContext);
    expect(techAnswer.title).toBe("Technician / Field User");
    expect(techAnswer.links.map((link) => link.href)).not.toContain("/ops/admin/company-profile#accept-payments");

    const billingAnswer = answerAskComplianceMatters("How should billing use the app?", billingContext);
    expect(billingAnswer.title).toBe("Billing / AR");
    expect(billingAnswer.body).toContain("invoice review");
    expect(billingAnswer.body).toContain("payment status");

    const adminAnswer = answerAskComplianceMatters("How should an admin use the app?", ownerContext);
    expect(adminAnswer.title).toBe("Owner / Admin");
    expect(adminAnswer.body).toContain("Launch Room readiness");
  });

  it("answers support and feedback questions without implying automatic training or case creation", () => {
    expect(answerAskComplianceMatters("What does Not helpful do?", techContext).body).toContain("private feedback signal");
    expect(answerAskComplianceMatters("Does the assistant create a support case?", techContext).body).toContain("I do not create a support case yet");
    expect(answerAskComplianceMatters("What if I am stuck?", techContext).body).toContain("contact support");
  });

  it("keeps unknown answers fallback-compatible with local help-gap events", () => {
    const answer = answerAskComplianceMatters("Explain the purple calendar widget", techContext);
    const event = createUnknownAnswerHelpGapEvent({
      context: techContext,
      questionText: "Explain the purple calendar widget",
      answer,
      now: () => new Date("2026-06-21T12:00:00.000Z"),
    });

    expect(answer.status).toBe("fallback");
    expect(event.eventType).toBe("unknown_answer");
    expect(event.answerKey).toBe("fallback_unknown");
  });
});
