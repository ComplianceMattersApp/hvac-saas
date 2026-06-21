import {
  isInternalAccessError,
  requireInternalUser,
  type InternalUserRow,
} from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import { isHelpGapReviewQueueEnabled } from "./help-assistant-flags";

export type HelpGapReviewFilterOptions = {
  reviewStatus?: unknown;
  category?: unknown;
  eventType?: unknown;
  pageFamily?: unknown;
  roleCategory?: unknown;
  productMode?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  recentDays?: unknown;
  limit?: unknown;
};

export type HelpGapReviewItem = {
  id: string;
  createdAt: string;
  eventType: string;
  category: string;
  reviewStatus: string;
  pagePath: string;
  pageFamily: string;
  roleLabel: string;
  roleCategory: string;
  productMode: string;
  questionTextSanitized: string | null;
  answerKey: string;
  fallbackKey: string | null;
  feedbackValue: string | null;
  setupStepKey: string | null;
  trainingMissionKey: string | null;
  linkedSupportCaseId: string | null;
  capabilitySnapshot: {
    canViewFinancialRegister: boolean;
    canCollectFieldPayment: boolean;
  };
};

export type HelpGapReviewSummary = {
  totalNew: number;
  unknownAnswers: number;
  notHelpful: number;
  stillNeedHelp: number;
  byCategory: Record<string, number>;
  byPageFamily: Record<string, number>;
  byRoleCategory: Record<string, number>;
  byTrainingMission: Record<string, number>;
  bySetupStep: Record<string, number>;
  byEventType: Record<string, number>;
  byReviewStatus: Record<string, number>;
};

export type HelpGapReviewReadModelResult = {
  enabled: boolean;
  authorized: boolean;
  reason: "disabled" | "unauthorized" | "read_failed" | null;
  items: HelpGapReviewItem[];
  summary: HelpGapReviewSummary;
  availableFilters: {
    reviewStatuses: string[];
    categories: string[];
    eventTypes: string[];
    pageFamilies: string[];
    roleCategories: string[];
    productModes: string[];
  };
};

type RequireInternalUserFn = typeof requireInternalUser;

type HelpGapReviewReadModelOptions = {
  supabase?: any;
  env?: Pick<NodeJS.ProcessEnv, string>;
  requireInternalUserFn?: RequireInternalUserFn;
  now?: () => Date;
};

type HelpGapReviewRow = {
  id: string | null;
  created_at: string | null;
  event_type: string | null;
  help_gap_category: string | null;
  review_status: string | null;
  route_pathname: string | null;
  page_family: string | null;
  role_label: string | null;
  role_category: string | null;
  product_mode: string | null;
  question_text_sanitized: string | null;
  answer_key: string | null;
  feedback_value: string | null;
  setup_step_key: string | null;
  training_mission_key: string | null;
  linked_support_case_id: string | null;
  can_view_financial_register: boolean | null;
  can_collect_field_payment: boolean | null;
};

const REVIEW_STATUSES = [
  "new",
  "reviewed",
  "converted_to_help_article",
  "linked_to_support_case",
  "dismissed",
  "product_backlog",
  "bug_candidate",
] as const;
const EVENT_TYPES = ["unknown_answer", "not_helpful", "still_need_help"] as const;
const CATEGORIES = [
  "guidance_training",
  "setup_data_issue",
  "ux_confusion",
  "possible_product_bug",
  "future_feature_request",
  "missing_help_article",
  "unknown",
] as const;
const PAGE_FAMILIES = ["launch_room", "training_room", "operations", "today", "admin", "other"] as const;
const ROLE_CATEGORIES = ["owner", "admin", "office", "tech", "billing", "unknown"] as const;
const PRODUCT_MODES = ["hybrid", "hvac_service", "ecc_hers", "cleaning_services", "unknown"] as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const HELP_GAP_REVIEW_COLUMNS = [
  "id",
  "created_at",
  "event_type",
  "help_gap_category",
  "review_status",
  "route_pathname",
  "page_family",
  "role_label",
  "role_category",
  "product_mode",
  "question_text_sanitized",
  "answer_key",
  "feedback_value",
  "setup_step_key",
  "training_mission_key",
  "linked_support_case_id",
  "can_view_financial_register",
  "can_collect_field_payment",
].join(", ");

function emptySummary(): HelpGapReviewSummary {
  return {
    totalNew: 0,
    unknownAnswers: 0,
    notHelpful: 0,
    stillNeedHelp: 0,
    byCategory: {},
    byPageFamily: {},
    byRoleCategory: {},
    byTrainingMission: {},
    bySetupStep: {},
    byEventType: {},
    byReviewStatus: {},
  };
}

function emptyResult(params: {
  enabled: boolean;
  authorized: boolean;
  reason: HelpGapReviewReadModelResult["reason"];
}): HelpGapReviewReadModelResult {
  return {
    ...params,
    items: [],
    summary: emptySummary(),
    availableFilters: {
      reviewStatuses: [...REVIEW_STATUSES],
      categories: [...CATEGORIES],
      eventTypes: [...EVENT_TYPES],
      pageFamilies: [...PAGE_FAMILIES],
      roleCategories: [...ROLE_CATEGORIES],
      productModes: [...PRODUCT_MODES],
    },
  };
}

function isOneOf<const T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return allowed.includes(String(value ?? "").trim() as T[number]);
}

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeDate(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeRecentDays(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(Math.floor(parsed), 365);
}

function normalizeLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function isOwnerOrAdmin(actorUserId: string, internalUser: InternalUserRow) {
  return actorUserId === internalUser.account_owner_user_id || internalUser.role === "admin";
}

function increment(bucket: Record<string, number>, key: string | null | undefined) {
  const normalized = normalizeString(key) || "unknown";
  bucket[normalized] = (bucket[normalized] ?? 0) + 1;
}

function summarize(items: HelpGapReviewItem[]): HelpGapReviewSummary {
  const summary = emptySummary();

  for (const item of items) {
    if (item.reviewStatus === "new") summary.totalNew += 1;
    if (item.eventType === "unknown_answer") summary.unknownAnswers += 1;
    if (item.eventType === "not_helpful") summary.notHelpful += 1;
    if (item.eventType === "still_need_help") summary.stillNeedHelp += 1;
    increment(summary.byEventType, item.eventType);
    increment(summary.byReviewStatus, item.reviewStatus);
    increment(summary.byCategory, item.category);
    increment(summary.byPageFamily, item.pageFamily);
    increment(summary.byRoleCategory, item.roleCategory);
    if (item.trainingMissionKey) increment(summary.byTrainingMission, item.trainingMissionKey);
    if (item.setupStepKey) increment(summary.bySetupStep, item.setupStepKey);
  }

  return summary;
}

function fallbackKeyFor(answerKey: string) {
  return answerKey.startsWith("fallback_") ? answerKey : null;
}

function mapRow(row: HelpGapReviewRow): HelpGapReviewItem | null {
  const id = normalizeString(row.id);
  const createdAt = normalizeString(row.created_at);
  if (!id || !createdAt) return null;

  return {
    id,
    createdAt,
    eventType: normalizeString(row.event_type) || "unknown",
    category: normalizeString(row.help_gap_category) || "unknown",
    reviewStatus: normalizeString(row.review_status) || "new",
    pagePath: normalizeString(row.route_pathname) || "/",
    pageFamily: normalizeString(row.page_family) || "other",
    roleLabel: normalizeString(row.role_label) || "Unknown role",
    roleCategory: normalizeString(row.role_category) || "unknown",
    productMode: normalizeString(row.product_mode) || "unknown",
    questionTextSanitized: row.question_text_sanitized ? normalizeString(row.question_text_sanitized) : null,
    answerKey: normalizeString(row.answer_key) || "answer_unknown",
    fallbackKey: fallbackKeyFor(normalizeString(row.answer_key)),
    feedbackValue: row.feedback_value ? normalizeString(row.feedback_value) : null,
    setupStepKey: row.setup_step_key ? normalizeString(row.setup_step_key) : null,
    trainingMissionKey: row.training_mission_key ? normalizeString(row.training_mission_key) : null,
    linkedSupportCaseId: row.linked_support_case_id ? normalizeString(row.linked_support_case_id) : null,
    capabilitySnapshot: {
      canViewFinancialRegister: row.can_view_financial_register === true,
      canCollectFieldPayment: row.can_collect_field_payment === true,
    },
  };
}

function applyFilters(query: any, filters: HelpGapReviewFilterOptions, now: () => Date) {
  let next = query;

  if (isOneOf(filters.reviewStatus, REVIEW_STATUSES)) {
    next = next.eq("review_status", filters.reviewStatus);
  }
  if (isOneOf(filters.category, CATEGORIES)) {
    next = next.eq("help_gap_category", filters.category);
  }
  if (isOneOf(filters.eventType, EVENT_TYPES)) {
    next = next.eq("event_type", filters.eventType);
  }
  if (isOneOf(filters.pageFamily, PAGE_FAMILIES)) {
    next = next.eq("page_family", filters.pageFamily);
  }
  if (isOneOf(filters.roleCategory, ROLE_CATEGORIES)) {
    next = next.eq("role_category", filters.roleCategory);
  }
  if (isOneOf(filters.productMode, PRODUCT_MODES)) {
    next = next.eq("product_mode", filters.productMode);
  }

  const recentDays = normalizeRecentDays(filters.recentDays);
  const dateFrom = recentDays
    ? new Date(now().getTime() - recentDays * 24 * 60 * 60 * 1000).toISOString()
    : normalizeDate(filters.dateFrom);
  const dateTo = normalizeDate(filters.dateTo);

  if (dateFrom) next = next.gte("created_at", dateFrom);
  if (dateTo) next = next.lte("created_at", dateTo);

  return next;
}

export async function listHelpGapReviewQueue(
  filters: HelpGapReviewFilterOptions = {},
  options: HelpGapReviewReadModelOptions = {},
): Promise<HelpGapReviewReadModelResult> {
  if (!isHelpGapReviewQueueEnabled(options.env ?? process.env)) {
    return emptyResult({ enabled: false, authorized: false, reason: "disabled" });
  }

  const supabase = options.supabase ?? (await createClient());
  const requireInternal = options.requireInternalUserFn ?? requireInternalUser;

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternal({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      return emptyResult({ enabled: true, authorized: false, reason: "unauthorized" });
    }
    return emptyResult({ enabled: true, authorized: false, reason: "unauthorized" });
  }

  const { userId, internalUser } = authz;
  if (!internalUser.is_active || !isOwnerOrAdmin(userId, internalUser)) {
    return emptyResult({ enabled: true, authorized: false, reason: "unauthorized" });
  }

  try {
    const limit = normalizeLimit(filters.limit);
    const baseQuery = supabase
      .from("assistant_help_gap_events")
      .select(HELP_GAP_REVIEW_COLUMNS)
      .eq("account_owner_user_id", internalUser.account_owner_user_id);

    const filteredQuery = applyFilters(baseQuery, filters, options.now ?? (() => new Date()));
    const { data, error } = await filteredQuery
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return emptyResult({ enabled: true, authorized: true, reason: "read_failed" });

    const items = ((data ?? []) as HelpGapReviewRow[])
      .map(mapRow)
      .filter((item): item is HelpGapReviewItem => Boolean(item));

    return {
      ...emptyResult({ enabled: true, authorized: true, reason: null }),
      items,
      summary: summarize(items),
    };
  } catch {
    return emptyResult({ enabled: true, authorized: true, reason: "read_failed" });
  }
}
