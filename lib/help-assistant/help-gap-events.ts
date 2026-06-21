import type { HelpAssistantAnswer } from "./help-assistant-answer";
import type { HelpAssistantSafeContext } from "./help-assistant-context";
import {
  classifyHelpGapQuestion,
  type HelpGapCategory,
} from "./help-gap-classification";

export type HelpGapEventType = "unknown_answer" | "not_helpful" | "still_need_help";
export type HelpGapAssistantMode = "help_chat" | "setup_coach";
export type HelpGapFeedbackValue = "not_helpful" | "still_need_help";

export type HelpGapEvent = {
  eventType: HelpGapEventType;
  occurredAt: string;
  assistantMode: HelpGapAssistantMode;
  routePathname: string;
  pageFamily: HelpAssistantSafeContext["pageFamily"];
  roleLabel: string;
  roleCategory: HelpAssistantSafeContext["internalRole"];
  productMode: HelpAssistantSafeContext["productMode"];
  capabilities: {
    canViewFinancialRegister: boolean;
    canCollectFieldPayment: boolean;
  };
  questionText: string | null;
  answerKey: string;
  feedbackValue: HelpGapFeedbackValue | null;
  helpGapCategory: HelpGapCategory;
  setupStepKey: string | null;
  trainingMissionKey: string | null;
};

export type CreateUnknownAnswerHelpGapEventInput = {
  context: HelpAssistantSafeContext;
  questionText: string | null | undefined;
  answer: HelpAssistantAnswer;
  now?: () => Date;
  setupStepKey?: string | null;
  trainingMissionKey?: string | null;
};

export type CreateFeedbackHelpGapEventInput = {
  eventType: Extract<HelpGapEventType, "not_helpful" | "still_need_help">;
  context: HelpAssistantSafeContext;
  questionText: string | null | undefined;
  answer: HelpAssistantAnswer | null;
  assistantMode?: HelpGapAssistantMode;
  now?: () => Date;
  setupStepKey?: string | null;
  trainingMissionKey?: string | null;
};

const MAX_QUESTION_TEXT_LENGTH = 240;
const MAX_KEY_LENGTH = 80;

function sanitizePathname(pathname: string) {
  const withoutQuery = String(pathname ?? "").split("?")[0]?.split("#")[0] ?? "";
  if (!withoutQuery.startsWith("/")) return "/";
  return withoutQuery.replace(/\/{2,}/g, "/").slice(0, 160);
}

function keyFromText(value: string | null | undefined, fallback: string) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_KEY_LENGTH);
  return normalized || fallback;
}

function answerKeyFor(answer: HelpAssistantAnswer | null | undefined) {
  if (!answer) return "answer_unknown";
  if (answer.status === "fallback") return "fallback_unknown";
  return `answer_${keyFromText(answer.title, "local_answer")}`;
}

function categoryForQuestion(questionText: string | null, fallbackCategory?: HelpGapCategory) {
  const category = classifyHelpGapQuestion(questionText);
  if (category === "unknown" && fallbackCategory) return fallbackCategory;
  return category;
}

export function sanitizeHelpGapQuestion(
  questionText: string | null | undefined,
  maxLength = MAX_QUESTION_TEXT_LENGTH,
) {
  const trimmed = String(questionText ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, Math.max(1, maxLength));
}

function createBaseHelpGapEvent(input: {
  eventType: HelpGapEventType;
  context: HelpAssistantSafeContext;
  questionText: string | null | undefined;
  answer: HelpAssistantAnswer | null;
  assistantMode: HelpGapAssistantMode;
  feedbackValue: HelpGapFeedbackValue | null;
  fallbackCategory?: HelpGapCategory;
  now?: () => Date;
  setupStepKey?: string | null;
  trainingMissionKey?: string | null;
}): HelpGapEvent {
  const sanitizedQuestion = sanitizeHelpGapQuestion(input.questionText);
  const now = input.now ?? (() => new Date());

  return {
    eventType: input.eventType,
    occurredAt: now().toISOString(),
    assistantMode: input.assistantMode,
    routePathname: sanitizePathname(input.context.pathname),
    pageFamily: input.context.pageFamily,
    roleLabel: input.context.roleLabel,
    roleCategory: input.context.internalRole,
    productMode: input.context.productMode,
    capabilities: {
      canViewFinancialRegister: input.context.canViewFinancialRegister,
      canCollectFieldPayment: input.context.canCollectFieldPayment,
    },
    questionText: sanitizedQuestion,
    answerKey: answerKeyFor(input.answer),
    feedbackValue: input.feedbackValue,
    helpGapCategory: categoryForQuestion(sanitizedQuestion, input.fallbackCategory),
    setupStepKey: input.setupStepKey ? keyFromText(input.setupStepKey, "setup_step") : null,
    trainingMissionKey: input.trainingMissionKey
      ? keyFromText(input.trainingMissionKey, "training_mission")
      : null,
  };
}

export function createUnknownAnswerHelpGapEvent(
  input: CreateUnknownAnswerHelpGapEventInput,
): HelpGapEvent {
  return createBaseHelpGapEvent({
    eventType: "unknown_answer",
    context: input.context,
    questionText: input.questionText,
    answer: input.answer,
    assistantMode: "help_chat",
    feedbackValue: null,
    fallbackCategory: "missing_help_article",
    now: input.now,
    setupStepKey: input.setupStepKey,
    trainingMissionKey: input.trainingMissionKey,
  });
}

export function createFeedbackHelpGapEvent(input: CreateFeedbackHelpGapEventInput): HelpGapEvent {
  return createBaseHelpGapEvent({
    eventType: input.eventType,
    context: input.context,
    questionText: input.questionText,
    answer: input.answer,
    assistantMode: input.assistantMode ?? "help_chat",
    feedbackValue: input.eventType,
    fallbackCategory: input.eventType === "still_need_help" ? "ux_confusion" : undefined,
    now: input.now,
    setupStepKey: input.setupStepKey,
    trainingMissionKey: input.trainingMissionKey,
  });
}
