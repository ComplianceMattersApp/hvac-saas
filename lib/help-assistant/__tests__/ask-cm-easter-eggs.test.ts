import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { answerAskComplianceMatters } from "../help-assistant-answer";
import { buildHelpAssistantSafeContext } from "../help-assistant-context";

const context = buildHelpAssistantSafeContext({
  pathname: "/training",
  internalRole: "admin",
  isAccountOwner: true,
  productMode: "hybrid",
  canViewFinancialRegister: true,
});

describe("Ask CM Easter eggs", () => {
  it.each([
    ["Who is Eddie?", "The Eddie File", "unnecessary clicks"],
    ["What is Here We Go Again?", "Here We Go Again", "father-daughter podcast"],
    ["What is a cremote?", "The Cremote", "family law"],
    ["Who is Apa?", "Grandpa Apa", "invented by grandchildren"],
    ["Tell me about the family", "The Team Behind the Team", "two beautiful girls"],
    ["Who is Nana Terry?", "Nana Terry", "center of gravity"],
    ["Who is Nana Mary?", "Nana Mary", "security perimeter"],
    ["Who is Terry?", "The Boss", "org chart"],
  ])("reveals %s only through its deliberate trigger", (question, title, expectedCopy) => {
    const answer = answerAskComplianceMatters(question, context);
    expect(answer.status).toBe("answered");
    expect(answer.title).toBe(title);
    expect(answer.body).toContain(expectedCopy);
    expect(answer.links).toEqual([]);
  });

  it("does not hijack ordinary workflow questions containing similar words", () => {
    expect(answerAskComplianceMatters("Who can create a job?", context).title).not.toBe("The Eddie File");
    expect(answerAskComplianceMatters("Where is the remote job location?", context).title).not.toBe("The Cremote");
    expect(answerAskComplianceMatters("Tell me about customer family records", context).title).not.toBe("The Team Behind the Team");
  });

  it("stays local, read-only, and provider-free", () => {
    const source = readFileSync(resolve(__dirname, "../ask-cm-easter-eggs.ts"), "utf8");
    expect(source).not.toContain("createClient");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain("OpenAI");
  });
});
