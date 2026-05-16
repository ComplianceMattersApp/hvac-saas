import { listContactRecipientsForEntity, type ContactRecipientRow } from "@/lib/communications/contact-recipients-read";
import { getSmsEligibilityInputsForRecipient } from "@/lib/communications/sms-eligibility-inputs-read";
import { getSmsProviderReadinessForAccount } from "@/lib/communications/sms-provider-readiness-read";
import { getSmsOnTheWayTemplateGovernanceForAccount } from "@/lib/communications/sms-template-governance-read";

type SupabaseLike = {
  from(table: string): any;
};

const ON_THE_WAY_MESSAGE_CLASS = "on_the_way" as const;
const ON_THE_WAY_TEMPLATE_KEY = "on_the_way" as const;
const ON_THE_WAY_EVENT_TYPE = "on_my_way" as const;
const ON_THE_WAY_REVERT_EVENT_TYPE = "on_the_way_reverted" as const;

export const ON_THE_WAY_INTENT_BLOCKED_REASONS = [
  "missing_account_scope",
  "missing_job_id",
  "missing_job_event_id",
  "job_not_found",
  "job_event_not_found",
  "job_event_not_on_the_way",
  "job_not_currently_on_the_way",
  "job_on_the_way_reverted",
  "recipient_missing",
  "recipient_sms_not_ready",
  "recipient_consent_blocked",
  "recipient_suppressed",
  "template_missing",
  "template_not_ready",
  "template_render_failed",
  "provider_not_ready",
  "sender_identity_not_ready",
  "quiet_hours_gate_deferred",
  "stop_help_readiness_deferred",
  "live_sms_activation_deferred",
] as const;

export type OnTheWayIntentBlockedReason = (typeof ON_THE_WAY_INTENT_BLOCKED_REASONS)[number];
export type OnTheWayIntentDecisionStatus = "ready" | "blocked" | "skipped";

export type OnTheWayIntentEligibilityResult = {
  eligibleForIntent: boolean;
  decisionStatus: OnTheWayIntentDecisionStatus;
  blockedReasons: OnTheWayIntentBlockedReason[];
  warnings: OnTheWayIntentBlockedReason[];
  messageClass: "on_the_way";
  templateKey: "on_the_way";
  templateVersion?: number;
  messageBodySnapshot?: string;
  recipientRef?: string;
  jobEventId: string;
  jobId: string;
  providerReady: boolean;
  templateReady: boolean;
  recipientReady: boolean;
  consentReady: boolean;
  quietHoursReady: boolean;
  liveSendEnabled: false;
};

export type EvaluateOnTheWayIntentEligibilityParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  jobId: string | null | undefined;
  jobEventId: string | null | undefined;
  now?: Date;
};

type ScopedJobRow = {
  id: string;
  status: string;
  customerId: string;
  serviceCaseId: string | null;
};

type JobEventRow = {
  id: string;
  jobId: string;
  eventType: string;
  createdAt: string;
};

function asTrimmed(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function asOptionalTrimmed(value: unknown) {
  const text = asTrimmed(value);
  return text || null;
}

function uniqueReasons(values: OnTheWayIntentBlockedReason[]) {
  return Array.from(new Set(values));
}

function emptyResult(input: {
  jobId: string;
  jobEventId: string;
}): OnTheWayIntentEligibilityResult {
  return {
    eligibleForIntent: false,
    decisionStatus: "blocked",
    blockedReasons: [],
    warnings: [],
    messageClass: ON_THE_WAY_MESSAGE_CLASS,
    templateKey: ON_THE_WAY_TEMPLATE_KEY,
    jobEventId: input.jobEventId,
    jobId: input.jobId,
    providerReady: false,
    templateReady: false,
    recipientReady: false,
    consentReady: false,
    quietHoursReady: false,
    liveSendEnabled: false,
  };
}

function resolveJobOwnerUserId(value: any) {
  if (Array.isArray(value)) {
    return asTrimmed(value[0]?.owner_user_id);
  }

  if (value && typeof value === "object") {
    return asTrimmed(value.owner_user_id);
  }

  return "";
}

function toScopedJobRow(row: any, accountOwnerUserId: string): ScopedJobRow | null {
  const id = asTrimmed(row?.id);
  const status = asTrimmed(row?.status).toLowerCase();
  const customerId = asTrimmed(row?.customer_id);
  const ownerUserId = resolveJobOwnerUserId(row?.customers);

  if (!id || !status || !customerId || !ownerUserId || ownerUserId !== accountOwnerUserId) {
    return null;
  }

  return {
    id,
    status,
    customerId,
    serviceCaseId: asOptionalTrimmed(row?.service_case_id),
  };
}

function toJobEventRow(row: any): JobEventRow | null {
  const id = asTrimmed(row?.id);
  const jobId = asTrimmed(row?.job_id);
  const eventType = asTrimmed(row?.event_type).toLowerCase();
  const createdAt = asTrimmed(row?.created_at);

  if (!id || !jobId || !eventType || !createdAt) {
    return null;
  }

  return { id, jobId, eventType, createdAt };
}

function choosePreferredRecipient(recipients: ContactRecipientRow[]) {
  const rolePriority = new Map<string, number>([
    ["customer_primary", 0],
    ["customer_alt", 1],
    ["homeowner", 2],
    ["tenant_or_occupant", 3],
    ["responsible_party", 4],
    ["site_access_contact", 5],
    ["billing_contact", 6],
  ]);

  return [...recipients].sort((left, right) => {
    const leftPriority = rolePriority.get(asTrimmed(left.recipient_role).toLowerCase()) ?? 99;
    const rightPriority = rolePriority.get(asTrimmed(right.recipient_role).toLowerCase()) ?? 99;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return asTrimmed(left.created_at).localeCompare(asTrimmed(right.created_at));
  })[0] ?? null;
}

function selectEligibleTemplateVersion(result: Awaited<ReturnType<typeof getSmsOnTheWayTemplateGovernanceForAccount>>) {
  const candidates = [result.currentVersion, result.sandboxVersion];
  const allowedStatuses = new Set(["approved_for_sandbox", "approved_for_activation", "active"]);

  return (
    candidates.find((candidate) => candidate.exists && allowedStatuses.has(asTrimmed(candidate.versionStatus).toLowerCase())) ??
    null
  );
}

async function readScopedJob(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  jobId: string;
}) {
  const result = await params.supabase
    .from("jobs")
    .select("id, status, customer_id, service_case_id, customers:customer_id ( owner_user_id )")
    .eq("id", params.jobId)
    .limit(1);

  if (result?.error) throw result.error;

  const row = Array.isArray(result?.data) ? result.data[0] : null;
  return toScopedJobRow(row, params.accountOwnerUserId);
}

async function readScopedJobEvent(params: {
  supabase: SupabaseLike;
  jobId: string;
  jobEventId: string;
}) {
  const result = await params.supabase
    .from("job_events")
    .select("id, job_id, event_type, created_at")
    .eq("id", params.jobEventId)
    .eq("job_id", params.jobId)
    .limit(1);

  if (result?.error) throw result.error;

  const row = Array.isArray(result?.data) ? result.data[0] : null;
  return toJobEventRow(row);
}

async function readLatestRevertEvent(params: {
  supabase: SupabaseLike;
  jobId: string;
}) {
  const result = await params.supabase
    .from("job_events")
    .select("id, job_id, event_type, created_at")
    .eq("job_id", params.jobId)
    .eq("event_type", ON_THE_WAY_REVERT_EVENT_TYPE)
    .order("created_at", { ascending: false })
    .limit(1);

  if (result?.error) throw result.error;

  const row = Array.isArray(result?.data) ? result.data[0] : null;
  return toJobEventRow(row);
}

export async function evaluateOnTheWayIntentEligibility(
  params: EvaluateOnTheWayIntentEligibilityParams,
): Promise<OnTheWayIntentEligibilityResult> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  const jobId = asTrimmed(params.jobId);
  const jobEventId = asTrimmed(params.jobEventId);
  const result = emptyResult({ jobId, jobEventId });

  if (!accountOwnerUserId) {
    result.blockedReasons = ["missing_account_scope"];
    return result;
  }

  if (!jobId) {
    result.blockedReasons = ["missing_job_id"];
    return result;
  }

  if (!jobEventId) {
    result.blockedReasons = ["missing_job_event_id"];
    return result;
  }

  const job = await readScopedJob({
    supabase: params.supabase,
    accountOwnerUserId,
    jobId,
  });

  if (!job) {
    result.blockedReasons = ["job_not_found"];
    return result;
  }

  const jobEvent = await readScopedJobEvent({
    supabase: params.supabase,
    jobId: job.id,
    jobEventId,
  });

  if (!jobEvent) {
    result.blockedReasons = ["job_event_not_found"];
    return result;
  }

  if (jobEvent.eventType !== ON_THE_WAY_EVENT_TYPE) {
    result.decisionStatus = "skipped";
    result.blockedReasons = ["job_event_not_on_the_way"];
    return result;
  }

  if (job.status !== ON_THE_WAY_MESSAGE_CLASS) {
    result.blockedReasons = ["job_not_currently_on_the_way"];
    return result;
  }

  const latestRevertEvent = await readLatestRevertEvent({
    supabase: params.supabase,
    jobId: job.id,
  });

  if (latestRevertEvent && latestRevertEvent.createdAt > jobEvent.createdAt) {
    result.blockedReasons = ["job_on_the_way_reverted"];
    return result;
  }

  const recipients = await listContactRecipientsForEntity({
    supabase: params.supabase,
    accountOwnerUserId,
    linkedEntityType: "customer",
    linkedEntityId: job.customerId,
    status: "active",
    limit: 25,
  });

  const recipient = choosePreferredRecipient(recipients);
  if (!recipient) {
    result.blockedReasons = ["recipient_missing"];
    return result;
  }

  result.recipientRef = recipient.id;

  const eligibilityInputs = await getSmsEligibilityInputsForRecipient({
    supabase: params.supabase,
    accountOwnerUserId,
    contactRecipientId: recipient.id,
    messageClass: ON_THE_WAY_MESSAGE_CLASS,
  });

  const recipientStructuralBlocks = new Set([
    "recipient_not_found",
    "recipient_inactive",
    "recipient_archived",
    "recipient_missing_phone",
  ]);
  const suppressionBlocks = new Set(["suppression_active_recipient", "suppression_active_phone"]);
  const consentBlocks = new Set(["consent_missing", "consent_unknown", "consent_opted_out", "consent_revoked"]);

  result.recipientReady = !eligibilityInputs.blockedReasons.some((reason) => recipientStructuralBlocks.has(reason));
  result.consentReady = !eligibilityInputs.blockedReasons.some(
    (reason) => suppressionBlocks.has(reason) || consentBlocks.has(reason),
  );

  const blockedReasons: OnTheWayIntentBlockedReason[] = [];

  if (!result.recipientReady) {
    blockedReasons.push("recipient_sms_not_ready");
  }

  if (eligibilityInputs.blockedReasons.some((reason) => suppressionBlocks.has(reason))) {
    blockedReasons.push("recipient_suppressed");
  }

  if (eligibilityInputs.blockedReasons.some((reason) => consentBlocks.has(reason))) {
    blockedReasons.push("recipient_consent_blocked");
  }

  const templateGovernance = await getSmsOnTheWayTemplateGovernanceForAccount({
    supabase: params.supabase,
    accountOwnerUserId,
  });

  const selectedTemplateVersion = selectEligibleTemplateVersion(templateGovernance);

  if (!templateGovernance.template.hasTemplate) {
    blockedReasons.push("template_missing");
  } else if (!selectedTemplateVersion) {
    blockedReasons.push("template_not_ready");
  } else if (!asTrimmed(selectedTemplateVersion.samplePreview)) {
    blockedReasons.push("template_render_failed");
  } else {
    result.templateReady = true;
    result.templateVersion = selectedTemplateVersion.versionNumber ?? undefined;
    result.messageBodySnapshot = selectedTemplateVersion.samplePreview;
  }

  const providerReadiness = await getSmsProviderReadinessForAccount({
    supabase: params.supabase,
    accountOwnerUserId,
  });

  const providerConfigured = providerReadiness.providerReadinessSummary.configuredCount > 0;
  const senderConfigured = providerReadiness.senderIdentitySummary.configuredCount > 0;

  if (!providerConfigured) {
    blockedReasons.push("provider_not_ready");
  }

  if (!senderConfigured) {
    blockedReasons.push("sender_identity_not_ready");
  }

  result.providerReady = providerConfigured && senderConfigured;
  result.quietHoursReady = false;
  result.warnings = [
    "quiet_hours_gate_deferred",
    "stop_help_readiness_deferred",
    "live_sms_activation_deferred",
  ];

  result.blockedReasons = uniqueReasons(blockedReasons);
  result.decisionStatus = result.blockedReasons.length > 0 ? "blocked" : "ready";
  result.eligibleForIntent = result.decisionStatus === "ready";

  return result;
}