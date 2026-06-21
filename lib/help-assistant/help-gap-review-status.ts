import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { isHelpGapReviewQueueEnabled } from "@/lib/help-assistant/help-assistant-flags";
import { createClient } from "@/lib/supabase/server";

export const HELP_GAP_REVIEW_ACTION_STATUSES = [
  "reviewed",
  "product_backlog",
  "bug_candidate",
  "converted_to_help_article",
  "dismissed",
] as const;

export type HelpGapReviewActionStatus = (typeof HELP_GAP_REVIEW_ACTION_STATUSES)[number];

export type UpdateHelpGapReviewStatusResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "disabled"
        | "unauthorized"
        | "invalid_status"
        | "not_found"
        | "update_failed";
    };

type UpdateHelpGapReviewStatusInput = {
  eventId: unknown;
  reviewStatus: unknown;
};

type UpdateHelpGapReviewStatusOptions = {
  supabase?: any;
  env?: Pick<NodeJS.ProcessEnv, string>;
  requireInternalUserFn?: typeof requireInternalUser;
  now?: () => Date;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseReviewActionStatus(value: unknown): HelpGapReviewActionStatus | null {
  const normalized = normalizeString(value);
  return HELP_GAP_REVIEW_ACTION_STATUSES.includes(
    normalized as HelpGapReviewActionStatus,
  )
    ? (normalized as HelpGapReviewActionStatus)
    : null;
}

function canReviewHelpGaps(userId: string, role: string, accountOwnerUserId: string) {
  return userId === accountOwnerUserId || role === "admin";
}

export async function updateHelpGapReviewStatus(
  input: UpdateHelpGapReviewStatusInput,
  options: UpdateHelpGapReviewStatusOptions = {},
): Promise<UpdateHelpGapReviewStatusResult> {
  if (!isHelpGapReviewQueueEnabled(options.env ?? process.env)) {
    return { ok: false, reason: "disabled" };
  }

  const eventId = normalizeString(input.eventId);
  const reviewStatus = parseReviewActionStatus(input.reviewStatus);
  if (!eventId || !reviewStatus) {
    return { ok: false, reason: "invalid_status" };
  }

  const supabase = options.supabase ?? (await createClient());
  const requireInternalUserFn = options.requireInternalUserFn ?? requireInternalUser;

  let actor;
  try {
    actor = await requireInternalUserFn({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) return { ok: false, reason: "unauthorized" };
    return { ok: false, reason: "unauthorized" };
  }

  const { userId, internalUser } = actor;
  if (
    !internalUser.is_active ||
    !canReviewHelpGaps(userId, internalUser.role, internalUser.account_owner_user_id)
  ) {
    return { ok: false, reason: "unauthorized" };
  }

  const reviewUpdate = {
    review_status: reviewStatus,
    reviewed_at: (options.now ?? (() => new Date()))().toISOString(),
    reviewed_by_user_id: userId,
  };

  const { data, error } = await supabase
    .from("assistant_help_gap_events")
    .update(reviewUpdate)
    .eq("id", eventId)
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, reason: "update_failed" };
  if (!data?.id) return { ok: false, reason: "not_found" };

  return { ok: true };
}
