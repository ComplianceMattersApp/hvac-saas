import { canViewFinancialRegister } from "@/lib/auth/financial-access";
import { resolveFieldBillingCapabilities } from "@/lib/auth/field-billing-access";
import {
  isInternalAccessError,
  requireInternalUser,
  type InternalUserRow,
} from "@/lib/auth/internal-user";
import { normalizeProductMode, readProductModeSettingForAccountOwnerId } from "@/lib/business/product-mode-defaults";
import { createClient } from "@/lib/supabase/server";
import { isHelpGapPersistenceEnabled } from "./help-assistant-flags";

export type PersistHelpGapResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "disabled"
        | "unauthorized"
        | "invalid_input"
        | "unsupported_route"
        | "insert_failed";
    };

export type PersistHelpGapEventInput = {
  eventType?: unknown;
  assistantMode?: unknown;
  helpGapCategory?: unknown;
  routePathname?: unknown;
  pagePath?: unknown;
  questionText?: unknown;
  questionTextSanitized?: unknown;
  answerKey?: unknown;
  fallbackKey?: unknown;
  feedbackValue?: unknown;
  setupStepKey?: unknown;
  trainingMissionKey?: unknown;
};

type RequireInternalUserFn = typeof requireInternalUser;

type PersistHelpGapEventOptions = {
  supabase?: any;
  env?: Pick<NodeJS.ProcessEnv, string>;
  requireInternalUserFn?: RequireInternalUserFn;
  readProductModeFn?: typeof readProductModeSettingForAccountOwnerId;
};

type SanitizedRoute = {
  routePathname: "/ops/admin" | "/training";
  pageFamily: "launch_room" | "training_room";
};

const EVENT_TYPES = ["unknown_answer", "not_helpful", "still_need_help"] as const;
const ASSISTANT_MODES = ["help_chat", "setup_coach"] as const;
const HELP_GAP_CATEGORIES = [
  "guidance_training",
  "setup_data_issue",
  "ux_confusion",
  "possible_product_bug",
  "future_feature_request",
  "missing_help_article",
  "unknown",
] as const;
const FEEDBACK_VALUES = ["not_helpful", "still_need_help"] as const;

const MAX_PATH_LENGTH = 160;
const MAX_QUESTION_TEXT_LENGTH = 240;
const MAX_KEY_LENGTH = 80;

function cleanString(value: unknown) {
  return String(value ?? "").replace(/\0/g, "").trim();
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isOneOf<const T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return allowed.includes(String(value ?? "").trim() as T[number]);
}

function sanitizeQuestionText(value: unknown) {
  const normalized = collapseWhitespace(cleanString(value));
  if (!normalized) return null;
  return normalized.slice(0, MAX_QUESTION_TEXT_LENGTH);
}

function sanitizeKey(value: unknown, fallback: string) {
  const normalized = cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_KEY_LENGTH);
  return normalized || fallback;
}

function sanitizeOptionalKey(value: unknown) {
  const normalized = sanitizeKey(value, "");
  return normalized || null;
}

function sanitizeApprovedRoute(value: unknown): SanitizedRoute | null {
  const raw = cleanString(value);
  const withoutQuery = raw.split("?")[0]?.split("#")[0] ?? "";
  if (!withoutQuery.startsWith("/")) return null;

  const normalized = withoutQuery.replace(/\/{2,}/g, "/").slice(0, MAX_PATH_LENGTH);
  if (normalized === "/ops/admin" || normalized.startsWith("/ops/admin/")) {
    return { routePathname: "/ops/admin", pageFamily: "launch_room" };
  }
  if (normalized === "/training" || normalized.startsWith("/training/")) {
    return { routePathname: "/training", pageFamily: "training_room" };
  }

  return null;
}

function roleCategoryForActor(actorUserId: string, internalUser: InternalUserRow) {
  return actorUserId === internalUser.account_owner_user_id ? "owner" : internalUser.role;
}

function roleLabelFor(roleCategory: string) {
  if (roleCategory === "owner" || roleCategory === "admin") return "Owner / Admin";
  if (roleCategory === "office") return "Dispatcher / Office";
  if (roleCategory === "tech") return "Technician / Field User";
  if (roleCategory === "billing") return "Billing / AR";
  return "Unknown role";
}

async function resolveSafeProductMode(params: {
  supabase: any;
  accountOwnerUserId: string;
  readProductModeFn: typeof readProductModeSettingForAccountOwnerId;
}) {
  try {
    const mode = await params.readProductModeFn({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
    });
    return normalizeProductMode(mode) ?? "unknown";
  } catch {
    return "unknown";
  }
}

function getRouteInput(input: PersistHelpGapEventInput) {
  return input.routePathname ?? input.pagePath;
}

function validateEventInput(input: PersistHelpGapEventInput) {
  const eventType = cleanString(input.eventType);
  const assistantMode = cleanString(input.assistantMode);
  const helpGapCategory = cleanString(input.helpGapCategory);

  if (!isOneOf(eventType, EVENT_TYPES)) return null;
  if (!isOneOf(assistantMode, ASSISTANT_MODES)) return null;
  if (!isOneOf(helpGapCategory, HELP_GAP_CATEGORIES)) return null;

  const feedbackValueRaw = cleanString(input.feedbackValue);
  const feedbackValue = feedbackValueRaw || null;
  if (feedbackValue !== null && !isOneOf(feedbackValue, FEEDBACK_VALUES)) return null;
  if (eventType === "unknown_answer" && feedbackValue !== null) return null;
  if ((eventType === "not_helpful" || eventType === "still_need_help") && feedbackValue !== eventType) {
    return null;
  }

  return {
    eventType,
    assistantMode,
    helpGapCategory,
    feedbackValue,
  };
}

export async function persistHelpGapEvent(
  input: PersistHelpGapEventInput,
  options: PersistHelpGapEventOptions = {},
): Promise<PersistHelpGapResult> {
  if (!isHelpGapPersistenceEnabled(options.env ?? process.env)) {
    return { ok: false, reason: "disabled" };
  }

  const validated = validateEventInput(input);
  if (!validated) return { ok: false, reason: "invalid_input" };

  const route = sanitizeApprovedRoute(getRouteInput(input));
  if (!route) return { ok: false, reason: "unsupported_route" };

  const answerKey = sanitizeKey(input.answerKey ?? input.fallbackKey, "answer_unknown");
  if (!answerKey) return { ok: false, reason: "invalid_input" };

  const supabase = options.supabase ?? (await createClient());
  const requireInternal = options.requireInternalUserFn ?? requireInternalUser;

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternal({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) return { ok: false, reason: "unauthorized" };
    return { ok: false, reason: "unauthorized" };
  }

  const { userId, internalUser } = authz;
  const accountOwnerUserId = cleanString(internalUser.account_owner_user_id);
  const actorUserId = cleanString(userId || internalUser.user_id);
  if (!accountOwnerUserId || !actorUserId || !internalUser.is_active) {
    return { ok: false, reason: "unauthorized" };
  }

  const roleCategory = roleCategoryForActor(actorUserId, internalUser);
  const productMode = await resolveSafeProductMode({
    supabase,
    accountOwnerUserId,
    readProductModeFn: options.readProductModeFn ?? readProductModeSettingForAccountOwnerId,
  });
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId,
    internalUser,
    resourceAccountOwnerUserId: accountOwnerUserId,
  });

  const questionTextSanitized = sanitizeQuestionText(
    input.questionTextSanitized ?? input.questionText,
  );

  const payload = {
    account_owner_user_id: accountOwnerUserId,
    internal_user_id: actorUserId,
    event_type: validated.eventType,
    assistant_mode: validated.assistantMode,
    help_gap_category: validated.helpGapCategory,
    route_pathname: route.routePathname,
    page_family: route.pageFamily,
    role_category: roleCategory,
    role_label: roleLabelFor(roleCategory),
    product_mode: productMode,
    can_view_financial_register: canViewFinancialRegister({
      actorUserId,
      internalUser,
      resourceAccountOwnerUserId: accountOwnerUserId,
    }),
    can_collect_field_payment: fieldBillingCapabilities.can_collect_field_payment,
    question_text_sanitized: questionTextSanitized,
    question_summary: null,
    answer_key: answerKey,
    feedback_value: validated.feedbackValue,
    setup_step_key: sanitizeOptionalKey(input.setupStepKey),
    training_mission_key: sanitizeOptionalKey(input.trainingMissionKey),
    review_status: "new",
  };

  try {
    const { error } = await supabase.from("assistant_help_gap_events").insert(payload);
    if (error) return { ok: false, reason: "insert_failed" };
  } catch {
    return { ok: false, reason: "insert_failed" };
  }

  return { ok: true };
}
