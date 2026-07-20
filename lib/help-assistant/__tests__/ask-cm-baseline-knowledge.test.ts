import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { answerAskComplianceMatters } from "../help-assistant-answer";
import { askCmBaselineIntents } from "../ask-cm-baseline-knowledge";
import { buildHelpAssistantSafeContext } from "../help-assistant-context";

const ownerContext = buildHelpAssistantSafeContext({
  pathname: "/jobs",
  internalRole: "admin",
  isAccountOwner: true,
  productMode: "hybrid",
  canViewFinancialRegister: true,
});

const techContext = buildHelpAssistantSafeContext({
  pathname: "/jobs",
  internalRole: "tech",
  productMode: "hvac_service",
  canViewFinancialRegister: false,
});

describe("Ask CM Day 1 baseline knowledge", () => {
  it.each([
    ["How do I create a new job?", "Create a New Job"],
    ["create work order", "Create a New Job"],
    ["book job", "Schedule a Job"],
    ["How do I invoice?", "Create an Invoice"],
    ["make invoice", "Create an Invoice"],
    ["bill customer", "Create an Invoice"],
    ["How do I send an invoice?", "Send an Invoice"],
    ["send bill", "Send an Invoice"],
    ["How do I record a payment?", "Record a Payment"],
    ["mark paid", "Record a Payment"],
    ["How do I close out a job?", "Close Out a Job"],
    ["finish job", "Close Out a Job"],
    ["How does an ECC retest work?", "ECC Retest"],
    ["How do I add a customer?", "Add a Customer"],
    ["How do I add equipment?", "Add Equipment"],
    ["How do I add notes or photos?", "Add Notes or Photos"],
    ["How do I find payments?", "Find Payments"],
    ["How do I use the Payments report?", "Payments Report"],
    ["How do I use the Training Room?", "Training Room"],
  ])("answers %s with the %s workflow", (question, expectedTitle) => {
    const answer = answerAskComplianceMatters(question, ownerContext);
    expect(answer.status).toBe("answered");
    expect(answer.title).toBe(expectedTitle);
    expect(answer.body.length).toBeLessThan(650);
  });

  it("gives practical invoice steps instead of a role-only answer", () => {
    const answer = answerAskComplianceMatters("How do I invoice?", ownerContext);
    expect(answer.body).toContain("Open the job");
    expect(answer.body).toContain("Work Items");
    expect(answer.body).toContain("Invoice Charges");
    expect(answer.title).not.toBe("Billing / AR");
  });

  it("explains restricted financial controls without claiming access", () => {
    const answer = answerAskComplianceMatters("How do I send an invoice?", techContext);
    expect(answer.body).toContain("Owner, admin, or billing access may be required");
    expect(answer.body).toContain("ask an owner or admin");
  });

  it("keeps links internal, concrete, and free of placeholder record ids", () => {
    for (const intent of askCmBaselineIntents) {
      for (const link of intent.links) {
        expect(link.href).toMatch(/^\/(?!portal|proposals)/);
        expect(link.href).not.toContain("[id]");
      }
    }
  });

  it("records reviewable doc and code provenance for every curated answer", () => {
    const repoRoot = resolve(__dirname, "../../..");
    for (const intent of askCmBaselineIntents) {
      expect(intent.sources.docs.length).toBeGreaterThan(0);
      expect(intent.sources.code.length).toBeGreaterThan(0);
      for (const source of [...intent.sources.docs, ...intent.sources.code]) {
        expect(existsSync(resolve(repoRoot, source)), `${intent.id}: ${source}`).toBe(true);
      }
    }
  });

  it("is guidance-only and contains no operational mutation calls", () => {
    const source = readFileSync(resolve(__dirname, "../ask-cm-baseline-knowledge.ts"), "utf8");
    expect(source).not.toContain("use server");
    expect(source).not.toContain("createClient");
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain(".delete(");
    expect(source).not.toContain("fetch(");
  });
});
