import { describe, expect, it } from "vitest";
import { buildHelpAssistantSafeContext } from "../help-assistant-context";
import { isAskComplianceMattersEnabled } from "../help-assistant-flags";
import { answerAskComplianceMatters, getSetupCoachAnswer } from "../help-assistant-answer";

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
    expect(answer.body).toContain("I don't know that yet.");
    expect(answer.body).toContain("Use Training Room or contact support.");
  });

  it("returns a read-only setup coach checklist", () => {
    const coach = getSetupCoachAnswer();
    expect(coach.items.map((item) => item.label)).toContain("Review Launch Room");
    expect(coach.items.map((item) => item.href)).toContain("/training");
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
    const answer = answerAskComplianceMatters("What are online invoice payments?", techContext);
    expect(answer.body).toContain("customers pay eligible Compliance Matters invoices online");
    expect(answer.body.toLowerCase()).not.toContain("stripe");
    expect(answer.body.toLowerCase()).not.toContain("connected account");
  });
});
