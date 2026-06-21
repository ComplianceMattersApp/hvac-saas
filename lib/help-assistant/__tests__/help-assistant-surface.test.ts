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

describe("help assistant surface wiring", () => {
  it("mounts the launcher behind the feature flag on scoped internal pages", () => {
    expect(adminPageSource).toContain("isAskComplianceMattersEnabled()");
    expect(adminPageSource).toContain("AskComplianceMattersLauncher");
    expect(trainingPageSource).toContain("isAskComplianceMattersEnabled()");
    expect(trainingPageSource).toContain("AskComplianceMattersLauncher");
  });

  it("keeps the client shell local and non-persistent", () => {
    expect(launcherSource).toContain("answerAskComplianceMatters");
    expect(launcherSource).toContain("Marked locally for this session.");
    expect(launcherSource).toContain("Guidance only. I do not change settings or create records.");
    expect(launcherSource).toContain("No support case was created.");
    expect(launcherSource).not.toContain("fetch(");
    expect(launcherSource).not.toContain("XMLHttpRequest");
    expect(launcherSource).not.toContain("localStorage");
    expect(launcherSource).not.toContain("sessionStorage");
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
