"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireInternalRole } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  ON_THE_WAY_PLANNING_DEFAULT_BODY,
  ON_THE_WAY_TEMPLATE_POLICY_VERSION,
  validateOnTheWayTemplateBody,
} from "@/lib/communications/sms-template-governance-validation";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ON_THE_WAY_TEMPLATE_KEY = "on_the_way";
const ON_THE_WAY_DISPLAY_NAME = "On-The-Way Notification";

// Version statuses that are not mutable (cannot be edited in place).
// Draft is the only mutable status.
const IMMUTABLE_VERSION_STATUSES = new Set([
  "pending_review",
  "approved_for_sandbox",
  "approved_for_activation",
  "active",
  "rejected",
  "superseded",
  "retired",
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function withNotice(path: string, notice: string): string {
  return `${path}?notice=${encodeURIComponent(notice)}`;
}

function revalidateCommunications() {
  revalidatePath("/ops/admin/communications");
  revalidatePath("/ops/admin");
}

/**
 * Resolve the parent template row for the On-The-Way key in this account.
 * Returns the existing row if found, otherwise creates a new draft container.
 * All writes use the admin client because F4B intentionally has no
 * authenticated INSERT policies.
 */
async function resolveOrCreateTemplateContainer(params: {
  admin: ReturnType<typeof createAdminClient>;
  accountOwnerUserId: string;
  actorUserId: string;
}): Promise<{ templateId: string }> {
  const { admin, accountOwnerUserId, actorUserId } = params;

  // Try to read an existing template container for this account.
  const { data: existing, error: existingErr } = await admin
    .from("sms_message_templates")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("template_key", ON_THE_WAY_TEMPLATE_KEY)
    .maybeSingle();

  if (existingErr) throw existingErr;

  if (existing?.id) {
    return { templateId: String(existing.id) };
  }

  // Create a new draft container.
  const { data: created, error: createErr } = await admin
    .from("sms_message_templates")
    .insert({
      account_owner_user_id: accountOwnerUserId,
      template_key: ON_THE_WAY_TEMPLATE_KEY,
      message_class: ON_THE_WAY_TEMPLATE_KEY,
      display_name: ON_THE_WAY_DISPLAY_NAME,
      lifecycle_status: "draft",
      created_by_user_id: actorUserId,
      updated_by_user_id: actorUserId,
    })
    .select("id")
    .single();

  if (createErr) throw createErr;
  if (!created?.id) throw new Error("TEMPLATE_CREATE_FAILED");

  return { templateId: String(created.id) };
}

/**
 * Resolve the version payload for a new draft based on the validated body.
 * Returns only the validated fields — does not write.
 */
function buildVersionPayload(params: {
  accountOwnerUserId: string;
  templateId: string;
  actorUserId: string;
  versionNumber: number;
  normalizedBody: string;
  bodyHash: string;
  detectedTokens: string[];
  unknownTokens: string[];
}) {
  return {
    account_owner_user_id: params.accountOwnerUserId,
    sms_message_template_id: params.templateId,
    template_key: ON_THE_WAY_TEMPLATE_KEY,
    message_class: ON_THE_WAY_TEMPLATE_KEY,
    version_number: params.versionNumber,
    body_template: params.normalizedBody,
    body_hash: params.bodyHash,
    detected_tokens: params.detectedTokens,
    unknown_tokens: params.unknownTokens,
    token_policy_version: ON_THE_WAY_TEMPLATE_POLICY_VERSION,
    content_classification: "operational",
    version_status: "draft",
    internal_review_status: "not_requested",
    legal_review_status: "not_requested",
    provider_review_status: "not_requested",
    created_by_user_id: params.actorUserId,
    updated_by_user_id: params.actorUserId,
  };
}

/**
 * Returns the latest version row (highest version_number) for the given
 * template + account, or null if no versions exist.
 */
async function fetchLatestVersionRow(params: {
  admin: ReturnType<typeof createAdminClient>;
  accountOwnerUserId: string;
  templateId: string;
}): Promise<{
  id: string;
  version_number: number;
  version_status: string;
} | null> {
  const { data, error } = await params.admin
    .from("sms_message_template_versions")
    .select("id, version_number, version_status")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("sms_message_template_id", params.templateId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;

  return {
    id: String(data.id),
    version_number: Number(data.version_number),
    version_status: String(data.version_status ?? "").toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Exported helpers (testable pure logic)
// ---------------------------------------------------------------------------

/**
 * Determine the next version number given the latest existing row, if any.
 * Exported for unit-testing without a full action harness.
 */
export function resolveNextVersionNumber(
  latestVersionRow: { version_number: number; version_status: string } | null,
): number {
  if (!latestVersionRow) return 1;
  return latestVersionRow.version_number + 1;
}

/**
 * Return true when the version status means the body can be edited in place.
 * Exported for unit-testing.
 */
export function isVersionMutable(versionStatus: string): boolean {
  return !IMMUTABLE_VERSION_STATUSES.has(String(versionStatus).toLowerCase());
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

/**
 * Create an On-The-Way notification draft from the planning default body.
 *
 * - Admin only.
 * - Creates the parent template container if one does not exist.
 * - Reuses an existing mutable draft instead of creating a duplicate.
 * - Creates a new version only if the latest is immutable.
 * - Does NOT set current_version_id or sandbox_version_id.
 * - Does NOT enable SMS, does NOT call provider APIs.
 * - Revalidates /ops/admin/communications on success.
 */
export async function createOnTheWayTemplateDraftFromDefaultFromForm(
  _formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  let userId: string;
  let accountOwnerUserId: string;

  try {
    const ctx = await requireInternalRole("admin", { supabase });
    userId = ctx.userId;
    accountOwnerUserId = ctx.internalUser.account_owner_user_id;
  } catch {
    redirect(withNotice("/ops/admin/communications", "admin_required"));
  }

  const admin = createAdminClient();

  // Validate the planning default body.
  const validation = validateOnTheWayTemplateBody(ON_THE_WAY_PLANNING_DEFAULT_BODY);

  // The planning default always passes; guard defensively anyway.
  if (!validation.canSaveDraft) {
    redirect(withNotice("/ops/admin/communications", "default_body_invalid"));
  }

  let templateId: string;

  try {
    ({ templateId } = await resolveOrCreateTemplateContainer({
      admin,
      accountOwnerUserId,
      actorUserId: userId,
    }));
  } catch {
    redirect(withNotice("/ops/admin/communications", "template_create_failed"));
  }

  // Fetch the latest version to decide whether to reuse or create.
  let latestRow: Awaited<ReturnType<typeof fetchLatestVersionRow>>;

  try {
    latestRow = await fetchLatestVersionRow({
      admin,
      accountOwnerUserId,
      templateId,
    });
  } catch {
    redirect(withNotice("/ops/admin/communications", "template_read_failed"));
  }

  // Reuse the existing mutable draft if one exists.
  if (latestRow && isVersionMutable(latestRow.version_status)) {
    revalidateCommunications();
    redirect(withNotice("/ops/admin/communications", "draft_available"));
  }

  // Create a new draft version.
  const versionNumber = resolveNextVersionNumber(latestRow);
  const payload = buildVersionPayload({
    accountOwnerUserId,
    templateId,
    actorUserId: userId,
    versionNumber,
    normalizedBody: validation.normalizedBodyTemplate,
    bodyHash: validation.bodyHash,
    detectedTokens: validation.detectedTokens,
    unknownTokens: validation.unknownTokens,
  });

  try {
    const { error: insertErr } = await admin
      .from("sms_message_template_versions")
      .insert(payload);

    if (insertErr) throw insertErr;
  } catch {
    redirect(withNotice("/ops/admin/communications", "draft_create_failed"));
  }

  revalidateCommunications();
  redirect(withNotice("/ops/admin/communications", "draft_created"));
}

/**
 * Save an On-The-Way notification draft from submitted form body text.
 *
 * - Admin only.
 * - Blank body is blocked.
 * - Non-blank save allows unknown tokens, missing STOP, prohibited wording
 *   warnings so the admin can iteratively edit and save before submitting.
 * - Only mutates a version_status = 'draft' version in place.
 * - If the latest version is immutable, creates a new draft version.
 * - Does NOT set current_version_id or sandbox_version_id.
 * - Does NOT enable SMS, does NOT call provider APIs.
 * - Revalidates /ops/admin/communications on success.
 */
export async function saveOnTheWayTemplateDraftFromForm(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  let userId: string;
  let accountOwnerUserId: string;

  try {
    const ctx = await requireInternalRole("admin", { supabase });
    userId = ctx.userId;
    accountOwnerUserId = ctx.internalUser.account_owner_user_id;
  } catch {
    redirect(withNotice("/ops/admin/communications", "admin_required"));
  }

  const rawBody = String(formData.get("body_template") ?? "");
  const validation = validateOnTheWayTemplateBody(rawBody);

  if (!validation.canSaveDraft) {
    redirect(withNotice("/ops/admin/communications", "body_blank"));
  }

  const admin = createAdminClient();

  let templateId: string;

  try {
    ({ templateId } = await resolveOrCreateTemplateContainer({
      admin,
      accountOwnerUserId,
      actorUserId: userId,
    }));
  } catch {
    redirect(withNotice("/ops/admin/communications", "template_create_failed"));
  }

  let latestRow: Awaited<ReturnType<typeof fetchLatestVersionRow>>;

  try {
    latestRow = await fetchLatestVersionRow({
      admin,
      accountOwnerUserId,
      templateId,
    });
  } catch {
    redirect(withNotice("/ops/admin/communications", "template_read_failed"));
  }

  if (latestRow && isVersionMutable(latestRow.version_status)) {
    // Update the existing mutable draft in place.
    try {
      const { error: updateErr } = await admin
        .from("sms_message_template_versions")
        .update({
          body_template: validation.normalizedBodyTemplate,
          body_hash: validation.bodyHash,
          detected_tokens: validation.detectedTokens,
          unknown_tokens: validation.unknownTokens,
          token_policy_version: ON_THE_WAY_TEMPLATE_POLICY_VERSION,
          content_classification: "operational",
          version_status: "draft",
          internal_review_status: "not_requested",
          legal_review_status: "not_requested",
          provider_review_status: "not_requested",
          updated_by_user_id: userId,
        })
        .eq("id", latestRow.id)
        .eq("account_owner_user_id", accountOwnerUserId);

      if (updateErr) throw updateErr;
    } catch {
      redirect(withNotice("/ops/admin/communications", "draft_save_failed"));
    }

    const notice = validation.warnings.length > 0 ? "draft_validation_warning" : "draft_saved";
    revalidateCommunications();
    redirect(withNotice("/ops/admin/communications", notice));
  }

  // Latest version is immutable — create a new draft.
  const versionNumber = resolveNextVersionNumber(latestRow);
  const payload = buildVersionPayload({
    accountOwnerUserId,
    templateId,
    actorUserId: userId,
    versionNumber,
    normalizedBody: validation.normalizedBodyTemplate,
    bodyHash: validation.bodyHash,
    detectedTokens: validation.detectedTokens,
    unknownTokens: validation.unknownTokens,
  });

  try {
    const { error: insertErr } = await admin
      .from("sms_message_template_versions")
      .insert(payload);

    if (insertErr) throw insertErr;
  } catch {
    redirect(withNotice("/ops/admin/communications", "draft_create_failed"));
  }

  const notice = validation.warnings.length > 0 ? "draft_validation_warning" : "draft_created";
  revalidateCommunications();
  redirect(withNotice("/ops/admin/communications", notice));
}
