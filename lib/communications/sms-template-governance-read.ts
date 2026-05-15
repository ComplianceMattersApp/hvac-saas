import {
  ON_THE_WAY_ALLOWED_TEMPLATE_TOKENS,
  ON_THE_WAY_PLANNING_DEFAULT_BODY,
  ON_THE_WAY_SAMPLE_TOKEN_VALUES,
  validateOnTheWayTemplateBody,
} from "@/lib/communications/sms-template-governance-validation";

type SupabaseLike = {
  from(table: string): any;
};

export const SMS_TEMPLATE_GOVERNANCE_TEMPLATE_SELECT = [
  "id",
  "account_owner_user_id",
  "template_key",
  "message_class",
  "display_name",
  "lifecycle_status",
  "current_version_id",
  "sandbox_version_id",
  "created_at",
  "updated_at",
].join(", ");

export const SMS_TEMPLATE_GOVERNANCE_VERSION_SELECT = [
  "id",
  "account_owner_user_id",
  "sms_message_template_id",
  "template_key",
  "message_class",
  "version_number",
  "version_label",
  "body_template",
  "detected_tokens",
  "unknown_tokens",
  "token_policy_version",
  "content_classification",
  "version_status",
  "internal_review_status",
  "legal_review_status",
  "provider_review_status",
  "created_at",
  "updated_at",
].join(", ");

const ON_THE_WAY_TEMPLATE_KEY = "on_the_way";

type ReviewStatus = "not_requested" | "pending" | "approved" | "rejected";
type VersionStatus =
  | "draft"
  | "pending_review"
  | "approved_for_sandbox"
  | "approved_for_activation"
  | "active"
  | "rejected"
  | "superseded"
  | "retired";
type LifecycleStatus = "draft" | "active" | "paused" | "archived";

export type SmsTemplateGovernanceStatus = {
  smsEnabled: false;
  liveSendsEnabled: false;
  statusLabel: "SMS is not enabled";
  helperText: "Template governance is readiness-only. Live sends are disabled.";
};

export type SmsTemplateGovernanceTemplateSummary = {
  hasTemplate: boolean;
  templateKey: string;
  messageClass: string;
  displayName: string;
  lifecycleStatus: string;
  lifecycleLabel: string;
  hasCurrentVersion: boolean;
  hasSandboxVersion: boolean;
};

export type SmsTemplateGovernanceVersionSummary = {
  exists: boolean;
  versionId: string;
  versionNumber: number | null;
  versionLabel: string;
  versionStatus: string;
  versionStatusLabel: string;
  internalReviewStatus: string;
  internalReviewLabel: string;
  legalReviewStatus: string;
  legalReviewLabel: string;
  providerReviewStatus: string;
  providerReviewLabel: string;
  contentClassification: string;
  tokenPolicyVersion: string;
  detectedTokens: string[];
  unknownTokens: string[];
  hasUnknownTokens: boolean;
  stopLanguagePresent: boolean;
  prohibitedContentHits: string[];
  bodyTemplate: string;
  samplePreview: string;
  characterCount: number;
  estimatedSegments: number;
  approvalReady: boolean;
  approvalReadyLabel: string;
  blockingReasons: string[];
  warnings: string[];
  canSaveDraft: boolean;
  canMarkReadyForSandbox: boolean;
  markReadyBlockingReasons: string[];
  markReadyWarnings: string[];
};

export type SmsTemplateGovernanceLatestVersionSummary = SmsTemplateGovernanceVersionSummary & {
  isCurrentPointer: boolean;
  helperText: string;
};

export type SmsTemplateGovernanceReadResult = {
  status: SmsTemplateGovernanceStatus;
  template: SmsTemplateGovernanceTemplateSummary;
  currentVersion: SmsTemplateGovernanceVersionSummary;
  sandboxVersion: SmsTemplateGovernanceVersionSummary;
  latestVersion: SmsTemplateGovernanceLatestVersionSummary;
  planningDefault: {
    bodyTemplate: string;
    samplePreview: string;
    label: "Planning sample only";
  };
  compliance: {
    stopLanguagePresent: boolean;
    unknownTokensBlockApproval: boolean;
    marketingLanguageBlocked: "deferred";
    samplePreviewOnly: true;
  };
  deferredItems: string[];
};

export type GetSmsOnTheWayTemplateGovernanceForAccountParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
};

function asTrimmed(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function uniqueTokens(tokens: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const normalized = asTrimmed(token).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizeTokenArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return uniqueTokens(value.map((item) => asTrimmed(item)));
}

function mapLifecycleLabel(value: unknown) {
  const status = asTrimmed(value).toLowerCase() as LifecycleStatus | "";

  switch (status) {
    case "draft":
      return "Draft";
    case "active":
      return "Active template container";
    case "paused":
      return "Paused";
    case "archived":
      return "Archived";
    default:
      return "Not configured";
  }
}

function mapVersionStatusLabel(value: unknown) {
  const status = asTrimmed(value).toLowerCase() as VersionStatus | "";

  switch (status) {
    case "draft":
      return "Draft";
    case "pending_review":
      return "Pending review";
    case "approved_for_sandbox":
      return "Approved for sandbox";
    case "approved_for_activation":
      return "Approved for activation";
    case "active":
      return "Active governed version";
    case "rejected":
      return "Rejected";
    case "superseded":
      return "Superseded";
    case "retired":
      return "Retired";
    default:
      return "Not configured";
  }
}

function mapReviewLabel(value: unknown) {
  const status = asTrimmed(value).toLowerCase() as ReviewStatus | "";

  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "not_requested":
    default:
      return "Not requested";
  }
}

function renderSamplePreview(bodyTemplate: string) {
  return bodyTemplate.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_full, tokenName: string) => {
    const token = asTrimmed(tokenName).toLowerCase();
    return (ON_THE_WAY_SAMPLE_TOKEN_VALUES as Record<string, string>)[token] ?? `{{${token}}}`;
  });
}

function isApprovalStatus(status: string) {
  return status === "approved_for_sandbox" || status === "approved_for_activation" || status === "active";
}

function emptyVersionSummary(): SmsTemplateGovernanceVersionSummary {
  return {
    exists: false,
    versionId: "",
    versionNumber: null,
    versionLabel: "",
    versionStatus: "",
    versionStatusLabel: "Not configured",
    internalReviewStatus: "not_requested",
    internalReviewLabel: "Not requested",
    legalReviewStatus: "not_requested",
    legalReviewLabel: "Not requested",
    providerReviewStatus: "not_requested",
    providerReviewLabel: "Not requested",
    contentClassification: "",
    tokenPolicyVersion: "",
    detectedTokens: [],
    unknownTokens: [],
    hasUnknownTokens: false,
    stopLanguagePresent: false,
    prohibitedContentHits: [],
    bodyTemplate: "",
    samplePreview: "",
    characterCount: 0,
    estimatedSegments: 1,
    approvalReady: false,
    approvalReadyLabel: "Not configured",
    blockingReasons: [],
    warnings: [],
    canSaveDraft: false,
    canMarkReadyForSandbox: false,
    markReadyBlockingReasons: [],
    markReadyWarnings: [],
  };
}

function buildVersionSummary(row: any, options?: { isLatestVersion?: boolean }): SmsTemplateGovernanceVersionSummary {
  if (!row) return emptyVersionSummary();

  const versionId = asTrimmed(row?.id);
  const versionStatus = asTrimmed(row?.version_status).toLowerCase();
  const internalReviewStatus = asTrimmed(row?.internal_review_status).toLowerCase() || "not_requested";
  const legalReviewStatus = asTrimmed(row?.legal_review_status).toLowerCase() || "not_requested";
  const providerReviewStatus = asTrimmed(row?.provider_review_status).toLowerCase() || "not_requested";
  const bodyTemplate = asTrimmed(row?.body_template);

  if (!bodyTemplate) return emptyVersionSummary();

  const validation = validateOnTheWayTemplateBody(bodyTemplate);
  const detectedTokens = uniqueTokens([...normalizeTokenArray(row?.detected_tokens), ...validation.detectedTokens]);
  const allowedTokenSet = new Set<string>(ON_THE_WAY_ALLOWED_TEMPLATE_TOKENS);
  const unknownTokens = uniqueTokens([
    ...normalizeTokenArray(row?.unknown_tokens),
    ...validation.unknownTokens,
    ...detectedTokens.filter((token) => !allowedTokenSet.has(token)),
  ]);
  const isLatestVersion = options?.isLatestVersion === true;
  const canSaveDraft = isLatestVersion && versionStatus === "draft" && validation.canSaveDraft;
  const canMarkReadyStatus = versionStatus === "draft" || versionStatus === "pending_review";
  const markReadyBlockingReasons = uniqueTokens([
    ...validation.blockingReasons,
    ...(unknownTokens.length > 0 ? ["unknown_tokens"] : []),
  ]);
  const markReadyWarnings = uniqueTokens([
    ...validation.warnings,
    ...(unknownTokens.length > 0 ? ["unknown_tokens_present"] : []),
  ]);
  // V1 admin readiness can be computed for latest drafts, but current review actions still
  // require pending_review before approve-for-sandbox; UI/actions may need a combined path later.
  const canMarkReadyForSandbox =
    isLatestVersion && canMarkReadyStatus && validation.canApproveForSandbox && markReadyBlockingReasons.length === 0;

  const approvalReady =
    isApprovalStatus(versionStatus) &&
    internalReviewStatus === "approved" &&
    legalReviewStatus === "approved" &&
    providerReviewStatus === "approved" &&
    unknownTokens.length === 0 &&
    validation.stopLanguagePresent;

  let approvalReadyLabel = "Not approval-ready";
  if (approvalReady) {
    approvalReadyLabel = "Approval-ready for governance only (send remains disabled)";
  } else if (unknownTokens.length > 0) {
    approvalReadyLabel = "Blocked: unknown tokens present";
  } else if (!validation.stopLanguagePresent) {
    approvalReadyLabel = "Blocked: STOP language missing";
  } else if (!isApprovalStatus(versionStatus)) {
    approvalReadyLabel = "Blocked: version status is not approval state";
  } else {
    approvalReadyLabel = "Blocked: required reviews are incomplete";
  }

  return {
    exists: true,
    // Safe for browser read-model use only; future server actions still re-check account scope.
    versionId,
    versionNumber: Number.isFinite(Number(row?.version_number)) ? Number(row?.version_number) : null,
    versionLabel: asTrimmed(row?.version_label),
    versionStatus,
    versionStatusLabel: mapVersionStatusLabel(versionStatus),
    internalReviewStatus,
    internalReviewLabel: mapReviewLabel(internalReviewStatus),
    legalReviewStatus,
    legalReviewLabel: mapReviewLabel(legalReviewStatus),
    providerReviewStatus,
    providerReviewLabel: mapReviewLabel(providerReviewStatus),
    contentClassification: asTrimmed(row?.content_classification),
    tokenPolicyVersion: asTrimmed(row?.token_policy_version),
    detectedTokens,
    unknownTokens,
    hasUnknownTokens: unknownTokens.length > 0,
    stopLanguagePresent: validation.stopLanguagePresent,
    prohibitedContentHits: validation.prohibitedContentHits,
    bodyTemplate,
    samplePreview: validation.samplePreview,
    characterCount: validation.characterCount,
    estimatedSegments: validation.estimatedSegments,
    approvalReady,
    approvalReadyLabel,
    blockingReasons: markReadyBlockingReasons,
    warnings: markReadyWarnings,
    canSaveDraft,
    canMarkReadyForSandbox,
    markReadyBlockingReasons,
    markReadyWarnings,
  };
}

function buildResult(accountOwnerUserId: string): SmsTemplateGovernanceReadResult {
  return {
    status: {
      smsEnabled: false,
      liveSendsEnabled: false,
      statusLabel: "SMS is not enabled",
      helperText: "Template governance is readiness-only. Live sends are disabled.",
    },
    template: {
      hasTemplate: false,
      templateKey: ON_THE_WAY_TEMPLATE_KEY,
      messageClass: ON_THE_WAY_TEMPLATE_KEY,
      displayName: "On-The-Way Notification",
      lifecycleStatus: "",
      lifecycleLabel: "Not configured",
      hasCurrentVersion: false,
      hasSandboxVersion: false,
    },
    currentVersion: emptyVersionSummary(),
    sandboxVersion: emptyVersionSummary(),
    latestVersion: {
      ...emptyVersionSummary(),
      isCurrentPointer: false,
      helperText: "No versions configured.",
    },
    planningDefault: {
      bodyTemplate: ON_THE_WAY_PLANNING_DEFAULT_BODY,
      samplePreview: renderSamplePreview(ON_THE_WAY_PLANNING_DEFAULT_BODY),
      label: "Planning sample only",
    },
    compliance: {
      stopLanguagePresent: true,
      unknownTokensBlockApproval: true,
      marketingLanguageBlocked: "deferred",
      samplePreviewOnly: true,
    },
    deferredItems: [
      "Template editor",
      "Admin readiness actions",
      "Legal/provider review workflow",
      "Token renderer for live send",
      "Send endpoint",
      "Webhook",
      "Sandbox/live SMS",
      "Activation",
    ],
  };
}

export async function getSmsOnTheWayTemplateGovernanceForAccount(
  params: GetSmsOnTheWayTemplateGovernanceForAccountParams,
): Promise<SmsTemplateGovernanceReadResult> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  const result = buildResult(accountOwnerUserId);

  if (!accountOwnerUserId) {
    return result;
  }

  const templateResult = await params.supabase
    .from("sms_message_templates")
    .select(SMS_TEMPLATE_GOVERNANCE_TEMPLATE_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("template_key", ON_THE_WAY_TEMPLATE_KEY)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (templateResult?.error) throw templateResult.error;

  const templateRow = Array.isArray(templateResult?.data) ? templateResult.data[0] : null;

  if (!templateRow) {
    return result;
  }

  const templateId = asTrimmed(templateRow?.id);
  const currentVersionPointerId = asTrimmed(templateRow?.current_version_id);
  const sandboxVersionPointerId = asTrimmed(templateRow?.sandbox_version_id);

  result.template = {
    hasTemplate: true,
    templateKey: asTrimmed(templateRow?.template_key) || ON_THE_WAY_TEMPLATE_KEY,
    messageClass: asTrimmed(templateRow?.message_class) || ON_THE_WAY_TEMPLATE_KEY,
    displayName: asTrimmed(templateRow?.display_name) || "On-The-Way Notification",
    lifecycleStatus: asTrimmed(templateRow?.lifecycle_status).toLowerCase(),
    lifecycleLabel: mapLifecycleLabel(templateRow?.lifecycle_status),
    hasCurrentVersion: currentVersionPointerId.length > 0,
    hasSandboxVersion: sandboxVersionPointerId.length > 0,
  };

  const versionsResult = await params.supabase
    .from("sms_message_template_versions")
    .select(SMS_TEMPLATE_GOVERNANCE_VERSION_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("template_key", ON_THE_WAY_TEMPLATE_KEY)
    .eq("sms_message_template_id", templateId)
    .order("version_number", { ascending: false })
    .order("updated_at", { ascending: false });

  if (versionsResult?.error) throw versionsResult.error;

  const versionRows = Array.isArray(versionsResult?.data) ? versionsResult.data : [];

  const currentRow = currentVersionPointerId
    ? versionRows.find((row: any) => asTrimmed(row?.id) === currentVersionPointerId) ?? null
    : null;
  const sandboxRow = sandboxVersionPointerId
    ? versionRows.find((row: any) => asTrimmed(row?.id) === sandboxVersionPointerId) ?? null
    : null;
  const latestRow = versionRows[0] ?? null;

  const latestRowId = asTrimmed(latestRow?.id);
  result.currentVersion = buildVersionSummary(currentRow, {
    isLatestVersion: latestRowId.length > 0 && latestRowId === asTrimmed(currentRow?.id),
  });
  result.sandboxVersion = buildVersionSummary(sandboxRow, {
    isLatestVersion: latestRowId.length > 0 && latestRowId === asTrimmed(sandboxRow?.id),
  });

  const latestSummary = buildVersionSummary(latestRow, { isLatestVersion: true });
  const latestIsCurrent = latestSummary.exists && latestRowId.length > 0 && latestRowId === currentVersionPointerId;

  result.latestVersion = {
    ...latestSummary,
    isCurrentPointer: latestIsCurrent,
    helperText: latestSummary.exists
      ? latestIsCurrent
        ? "Latest version matches current pointer."
        : "Latest version is informational only and is not current unless pointed."
      : "No versions configured.",
  };

  const complianceSource = result.currentVersion.exists ? result.currentVersion : result.latestVersion;
  result.compliance = {
    stopLanguagePresent: complianceSource.exists ? complianceSource.stopLanguagePresent : true,
    unknownTokensBlockApproval: true,
    marketingLanguageBlocked: "deferred",
    samplePreviewOnly: true,
  };

  return result;
}
