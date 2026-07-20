"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { canViewFinancialRegister } from "@/lib/auth/financial-access";
import { resolveFieldBillingCapabilities } from "@/lib/auth/field-billing-access";
import { resolveProductModeForAccountOwnerId } from "@/lib/business/product-mode-defaults";
import { reserveAiUsage, releaseAiUsage, settleAiUsage } from "@/lib/ai/usage-budget";
import { buildHelpAssistantSafeContext, type HelpAssistantSafeContext } from "@/lib/help-assistant/help-assistant-context";
import { isAskComplianceMattersEnabled, isTrainerAiEnabled } from "@/lib/help-assistant/help-assistant-flags";
import { retrieveTrainerKnowledge } from "@/lib/help-assistant/trainer-knowledge";
import { generateTrainerAnswer, TRAINER_MODEL, trainerReservationMicrousd, type TrainerAiAnswer } from "@/lib/help-assistant/trainer-provider";

export type AskTrainerResult =
  | { ok: true; answer: TrainerAiAnswer; knowledgeGapLogged: boolean }
  | { ok: false; reason: "disabled" | "invalid_input" | "budget" | "unavailable"; message: string };

function safeQuestion(value: unknown) {
  return String(value ?? "").replace(/\0/g, "").replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function askTrainerAiAction(input: {
  question: unknown;
  context: HelpAssistantSafeContext;
}): Promise<AskTrainerResult> {
  if (!isAskComplianceMattersEnabled() || !isTrainerAiEnabled()) {
    return { ok: false, reason: "disabled", message: "Trainer AI is currently unavailable." };
  }
  const question = safeQuestion(input.question);
  if (question.length < 3) return { ok: false, reason: "invalid_input", message: "Enter a question first." };
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });
  const accountOwnerUserId = internalUser.account_owner_user_id;
  const fieldCapabilities = resolveFieldBillingCapabilities({
    actorUserId: userId,
    internalUser,
    resourceAccountOwnerUserId: accountOwnerUserId,
  });
  const context = buildHelpAssistantSafeContext({
    pathname: input.context.pathname,
    internalRole: internalUser.role,
    isAccountOwner: userId === accountOwnerUserId,
    productMode: await resolveProductModeForAccountOwnerId({ supabase, accountOwnerUserId }),
    canViewFinancialRegister: canViewFinancialRegister({ actorUserId: userId, internalUser, resourceAccountOwnerUserId: accountOwnerUserId }),
    canCollectFieldPayment: fieldCapabilities.can_collect_field_payment,
  });
  const admin = createAdminClient();
  let sources;
  try {
    sources = await retrieveTrainerKnowledge({ admin, question, context });
  } catch {
    return { ok: false, reason: "unavailable", message: "Published trainer knowledge is unavailable." };
  }
  const requestId = `trainer:${crypto.randomUUID()}`;
  let reservation;
  try {
    reservation = await reserveAiUsage({
      admin,
      requestId,
      featureKey: "trainer",
      accountOwnerUserId: internalUser.account_owner_user_id,
      actorUserId: userId,
      model: TRAINER_MODEL,
      estimatedCostMicrousd: trainerReservationMicrousd(question, sources),
      metadata: { page_family: context.pageFamily, source_count: sources.length },
    });
  } catch {
    return { ok: false, reason: "budget", message: "AI budget controls are unavailable. No provider request was made." };
  }
  if (!reservation.accepted) {
    return { ok: false, reason: "budget", message: reservation.reason === "monthly_cap_reached" ? "The monthly AI budget has been reached." : "Trainer AI is paused by the Platform Owner." };
  }
  let providerCompleted = false;
  try {
    const result = await generateTrainerAnswer({ question, context, sources });
    providerCompleted = true;
    await settleAiUsage({ admin, requestId, actualCostMicrousd: result.usage.actualCostMicrousd, inputTokens: result.usage.inputTokens, cachedInputTokens: result.usage.cachedInputTokens, outputTokens: result.usage.outputTokens });
    let knowledgeGapLogged = false;
    if (!result.answer.supported) {
      const { error: gapError } = await admin.from("assistant_help_gap_events").insert({
        account_owner_user_id: internalUser.account_owner_user_id,
        internal_user_id: userId,
        event_type: "unknown_answer",
        assistant_mode: "help_chat",
        help_gap_category: "missing_help_article",
        route_pathname: context.pageFamily === "training_room" ? "/training" : "/ops/admin",
        page_family: context.pageFamily === "training_room" ? "training_room" : "launch_room",
        role_category: context.internalRole,
        role_label: context.roleLabel,
        product_mode: context.productMode,
        can_view_financial_register: context.canViewFinancialRegister,
        can_collect_field_payment: context.canCollectFieldPayment,
        question_text_sanitized: question.slice(0, 240),
        answer_key: "trainer_knowledge_gap",
        review_status: "new",
        knowledge_sources: result.answer.citations,
        draft_answer: result.answer.answer,
        draft_article_title: result.answer.draftArticle?.title ?? null,
        draft_article_body: result.answer.draftArticle?.body ?? null,
        provider_model: TRAINER_MODEL,
      });
      knowledgeGapLogged = !gapError;
    }
    return { ok: true, answer: result.answer, knowledgeGapLogged };
  } catch {
    if (!providerCompleted) await releaseAiUsage({ admin, requestId }).catch(() => undefined);
    return { ok: false, reason: "unavailable", message: "The trainer could not answer right now." };
  }
}
