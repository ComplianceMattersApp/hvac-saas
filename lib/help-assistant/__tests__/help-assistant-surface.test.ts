import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const launcherSource = readFileSync(
  resolve(__dirname, "../../../components/help-assistant/AskComplianceMattersLauncher.tsx"),
  "utf8",
);
const adminPageSource = readFileSync(resolve(__dirname, "../../../app/ops/admin/page.tsx"), "utf8");
const trainingPageSource = readFileSync(resolve(__dirname, "../../../app/training/page.tsx"), "utf8");
const answerSource = readFileSync(resolve(__dirname, "../help-assistant-answer.ts"), "utf8");
const helpGapEventsSource = readFileSync(resolve(__dirname, "../help-gap-events.ts"), "utf8");
const helpGapCopySource = readFileSync(resolve(__dirname, "../help-gap-persistence-copy.ts"), "utf8");

describe("help assistant surface wiring", () => {
  it("mounts the launcher behind the feature flag on scoped internal pages", () => {
    expect(adminPageSource).toContain("isAskComplianceMattersEnabled()");
    expect(adminPageSource).toContain("AskComplianceMattersLauncher");
    expect(trainingPageSource).toContain("isAskComplianceMattersEnabled()");
    expect(trainingPageSource).toContain("AskComplianceMattersLauncher");
  });

  it("wires help-gap persistence through the sanctioned server action only", () => {
    expect(launcherSource).toContain("answerAskComplianceMatters");
    expect(launcherSource).toContain("persistHelpGapEventFromAssistantAction");
    expect(launcherSource).toContain("createUnknownAnswerHelpGapEvent");
    expect(launcherSource).toContain("createFeedbackHelpGapEvent");
    expect(launcherSource).toContain("eventType: event.eventType");
    expect(launcherSource).toContain("assistantMode: event.assistantMode");
    expect(launcherSource).toContain("helpGapCategory: event.helpGapCategory");
    expect(launcherSource).toContain("routePathname: event.routePathname");
    expect(launcherSource).toContain("questionText: event.questionText");
    expect(launcherSource).toContain("answerKey: event.answerKey");
    expect(launcherSource).toContain("feedbackValue: event.feedbackValue");
    expect(launcherSource).toContain("Saving feedback...");
    expect(launcherSource).toContain("Guidance only. I do not change settings or create records.");
    expect(helpGapCopySource).toContain("No support case was created.");
    expect(launcherSource).not.toContain("fetch(");
    expect(launcherSource).not.toContain("XMLHttpRequest");
    expect(launcherSource).not.toContain("localStorage");
    expect(launcherSource).not.toContain("sessionStorage");
    expect(launcherSource).not.toContain("support_cases");
    expect(launcherSource).not.toContain("support_case_notes");
    expect(launcherSource).not.toContain("OpenAI");
    expect(launcherSource).not.toContain("openai");
    expect(launcherSource).not.toContain("analytics");
  });

  it("does not wire provider calls or mutation paths into the local answer engine", () => {
    expect(answerSource).not.toContain("OpenAI");
    expect(answerSource).not.toContain("openai");
    expect(answerSource).not.toContain("fetch(");
    expect(answerSource).not.toContain(".insert(");
    expect(answerSource).not.toContain(".upsert(");
    expect(answerSource).not.toContain(".update(");
    expect(answerSource).not.toContain("service_role");
  });

  it("keeps help-gap events as pure local contract objects", () => {
    expect(helpGapEventsSource).toContain("createUnknownAnswerHelpGapEvent");
    expect(helpGapEventsSource).toContain("createFeedbackHelpGapEvent");
    expect(helpGapEventsSource).not.toContain("fetch(");
    expect(helpGapEventsSource).not.toContain(".insert(");
    expect(helpGapEventsSource).not.toContain(".upsert(");
    expect(helpGapEventsSource).not.toContain(".update(");
    expect(helpGapEventsSource).not.toContain("support_cases");
    expect(helpGapEventsSource).not.toContain("OpenAI");
    expect(helpGapEventsSource).not.toContain("openai");
    expect(helpGapEventsSource).not.toContain("service_role");
  });
});
