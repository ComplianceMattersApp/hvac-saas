import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const launcherSource = readFileSync(
  resolve(__dirname, "../../../components/help-assistant/AskComplianceMattersLauncher.tsx"),
  "utf8",
);
const rootLayoutSource = readFileSync(resolve(__dirname, "../../../app/layout.tsx"), "utf8");
const adminPageSource = readFileSync(resolve(__dirname, "../../../app/ops/admin/page.tsx"), "utf8");
const trainingPageSource = readFileSync(resolve(__dirname, "../../../app/training/page.tsx"), "utf8");
const answerSource = readFileSync(resolve(__dirname, "../help-assistant-answer.ts"), "utf8");
const helpGapEventsSource = readFileSync(resolve(__dirname, "../help-gap-events.ts"), "utf8");
const helpGapCopySource = readFileSync(resolve(__dirname, "../help-gap-persistence-copy.ts"), "utf8");

describe("help assistant surface wiring", () => {
  it("mounts one globally guarded launcher for authenticated internal routes", () => {
    expect(rootLayoutSource).toContain("isAskComplianceMattersEnabled()");
    expect(rootLayoutSource).toContain("<AskComplianceMattersLauncher");
    expect(rootLayoutSource).toContain("globalInternalSurface");
    expect(launcherSource).toContain('"/today"');
    expect(launcherSource).toContain('"/estimates"');
    expect(launcherSource).toContain('"/training"');
    expect(launcherSource).not.toContain('"/portal"');
    expect(launcherSource).not.toContain('"/proposals"');
    expect(adminPageSource).not.toContain("<AskComplianceMattersLauncher");
    expect(trainingPageSource).not.toContain("<AskComplianceMattersLauncher");
  });

  it("keeps the mobile opening state compact with rotating examples", () => {
    expect(launcherSource).toContain("Ask about anything in EveryStep");
    expect(launcherSource).toContain("flag the question for review so Ask CM can keep improving");
    expect(launcherSource).toContain("quickQuestionSets");
    expect(launcherSource).toContain("setQuickQuestionSetIndex");
    expect(launcherSource).toContain("current + 1");
    expect(launcherSource).not.toContain("Examples — not the limit");
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

  it("uses curated known workflows before the optional Trainer provider", () => {
    const localAnswerIndex = launcherSource.indexOf("const localAnswer = answerAskComplianceMatters");
    const trainerIndex = launcherSource.indexOf("if (trainerAiEnabled)");
    expect(localAnswerIndex).toBeGreaterThan(-1);
    expect(trainerIndex).toBeGreaterThan(localAnswerIndex);
    expect(launcherSource).toContain('localAnswer.status === "answered"');
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
