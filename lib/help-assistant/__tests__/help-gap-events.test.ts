import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { answerAskComplianceMatters } from "../help-assistant-answer";
import { buildHelpAssistantSafeContext } from "../help-assistant-context";
import { classifyHelpGapQuestion } from "../help-gap-classification";
import {
  createFeedbackHelpGapEvent,
  createUnknownAnswerHelpGapEvent,
  sanitizeHelpGapQuestion,
} from "../help-gap-events";

const context = buildHelpAssistantSafeContext({
  pathname: "/training?token=secret#frag",
  internalRole: "billing",
  productMode: "hvac_service",
  canViewFinancialRegister: true,
  canCollectFieldPayment: false,
});

const fixedNow = () => new Date("2026-06-21T12:00:00.000Z");

describe("help gap event contract", () => {
  it("creates a local unknown-answer help-gap event from fallback answers", () => {
    const answer = answerAskComplianceMatters("Can this explain the mystery screen?", context);
    const event = createUnknownAnswerHelpGapEvent({
      context,
      questionText: "  Can this explain the mystery screen?  ",
      answer,
      now: fixedNow,
    });

    expect(answer.status).toBe("fallback");
    expect(event).toMatchObject({
      eventType: "unknown_answer",
      occurredAt: "2026-06-21T12:00:00.000Z",
      assistantMode: "help_chat",
      routePathname: "/training",
      pageFamily: "training_room",
      roleLabel: "Billing / AR",
      roleCategory: "billing",
      productMode: "hvac_service",
      questionText: "Can this explain the mystery screen?",
      answerKey: "fallback_unknown",
      feedbackValue: null,
      helpGapCategory: "missing_help_article",
      setupStepKey: null,
      trainingMissionKey: null,
    });
    expect(JSON.stringify(event)).not.toContain("secret");
    expect(JSON.stringify(event)).not.toContain("#frag");
  });

  it("creates a not-helpful feedback event object without persistence", () => {
    const answer = answerAskComplianceMatters("What is Training Room?", context);
    const event = createFeedbackHelpGapEvent({
      eventType: "not_helpful",
      context,
      questionText: "What is Training Room?",
      answer,
      now: fixedNow,
      trainingMissionKey: "Run Your First Job",
    });

    expect(event.eventType).toBe("not_helpful");
    expect(event.feedbackValue).toBe("not_helpful");
    expect(event.answerKey).toBe("answer_training_room");
    expect(event.helpGapCategory).toBe("guidance_training");
    expect(event.trainingMissionKey).toBe("run_your_first_job");
  });

  it("creates a still-need-help support-intent event object without creating a case", () => {
    const answer = answerAskComplianceMatters("Where do I find payment setup?", context);
    const event = createFeedbackHelpGapEvent({
      eventType: "still_need_help",
      context,
      questionText: "Where do I find payment setup?",
      answer,
      assistantMode: "setup_coach",
      now: fixedNow,
      setupStepKey: "Accept Online Invoice Payments",
    });

    expect(event.eventType).toBe("still_need_help");
    expect(event.feedbackValue).toBe("still_need_help");
    expect(event.assistantMode).toBe("setup_coach");
    expect(event.helpGapCategory).toBe("setup_data_issue");
    expect(event.setupStepKey).toBe("accept_online_invoice_payments");
  });

  it("classifies common setup, payment, training, bug, and feature wording", () => {
    expect(classifyHelpGapQuestion("How do I finish payment setup?")).toBe("setup_data_issue");
    expect(classifyHelpGapQuestion("What training mission should a tech do first?")).toBe("guidance_training");
    expect(classifyHelpGapQuestion("The ops queue is broken and not working")).toBe("possible_product_bug");
    expect(classifyHelpGapQuestion("Can we add a QuickBooks integration later?")).toBe("future_feature_request");
    expect(classifyHelpGapQuestion("Where do I find this button?")).toBe("ux_confusion");
  });

  it("sanitizes and length-limits question text", () => {
    expect(sanitizeHelpGapQuestion("   what\n\nnow\t?   ")).toBe("what now ?");
    expect(sanitizeHelpGapQuestion("")).toBeNull();
    expect(sanitizeHelpGapQuestion("a".repeat(500))?.length).toBe(240);
  });

  it("keeps event helpers free of persistence, support-case, and provider paths", () => {
    const source = readFileSync(resolve(__dirname, "../help-gap-events.ts"), "utf8");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".upsert(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain("support_cases");
    expect(source).not.toContain("support_case_notes");
    expect(source).not.toContain("OpenAI");
    expect(source).not.toContain("openai");
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });
});
