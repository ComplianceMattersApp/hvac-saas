import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createOnTheWayTemplateDraftFromDefaultFromForm,
  markOnTheWayTemplateReadyForSandboxFromForm,
  saveOnTheWayTemplateDraftFromForm,
} from "@/lib/actions/sms-template-actions";
import {
  prepareSmsSandboxDeliveryFromForm,
  reserveSmsSandboxDeliveryDryRunFromForm,
  submitSmsSandboxDeliveryToProviderFromForm,
} from "@/lib/actions/sms-sandbox-send-actions";
import {
  addSmsSandboxTestRecipientFromForm,
  deactivateSmsSandboxTestRecipientFromForm,
  saveSmsSandboxProviderConfigFromForm,
  saveSmsSenderIdentityFromForm,
  setSmsSandboxSendGateFromForm,
} from "@/lib/actions/sms-provider-setup-actions";
import { getSmsProviderReadinessForAccount } from "@/lib/communications/sms-provider-readiness-read";
import { getSmsSandboxQueueForAccount } from "@/lib/communications/sms-sandbox-queue-read";
import { getSmsSandboxSetupForAccount } from "@/lib/communications/sms-sandbox-setup-read";
import {
  getSmsOnTheWayTemplateGovernanceForAccount,
  type SmsTemplateGovernanceVersionSummary,
} from "@/lib/communications/sms-template-governance-read";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";

type SearchParams = Promise<{ notice?: string }>;

type TemplateNoticeTone = "success" | "warn" | "error";

type TemplateNotice = {
  tone: TemplateNoticeTone;
  message: string;
};

const TEMPLATE_NOTICE_TEXT: Record<string, TemplateNotice> = {
  draft_created: { tone: "success", message: "Draft created from default wording." },
  draft_available: { tone: "success", message: "Existing draft is available." },
  draft_saved: { tone: "success", message: "Draft saved." },
  template_submitted_for_review: { tone: "success", message: "Template submitted for review." },
  template_approved_for_sandbox: {
    tone: "success",
    message: "Template approved for sandbox readiness. SMS is still disabled.",
  },
  template_rejected: { tone: "success", message: "Template version rejected." },
  draft_validation_warning: { tone: "warn", message: "Draft saved with validation warnings." },
  body_blank: { tone: "error", message: "Enter template wording before saving." },
  template_review_validation_failed: { tone: "error", message: "Resolve validation blockers before review." },
  template_review_invalid_status: { tone: "error", message: "This version is not in the required review state." },
  template_review_stale_version: {
    tone: "error",
    message: "A newer version exists. Refresh and review latest wording.",
  },
  template_reject_reason_required: { tone: "error", message: "Enter a rejection reason." },
  template_version_missing: { tone: "error", message: "Template version was missing." },
  template_version_not_found: { tone: "error", message: "Template version was not found." },
  template_submit_failed: {
    tone: "error",
    message: "Could not submit template for review. Please try again.",
  },
  template_approve_failed: {
    tone: "error",
    message: "Could not approve template for sandbox readiness. Please try again.",
  },
  template_sandbox_pointer_failed: {
    tone: "error",
    message: "Could not update sandbox readiness pointer. Please try again.",
  },
  template_reject_failed: { tone: "error", message: "Could not reject template version. Please try again." },
  admin_required: { tone: "error", message: "Admin access is required." },
  template_marked_ready_for_sandbox: {
    tone: "success",
    message: "Wording marked ready for future SMS testing. SMS is still disabled.",
  },
  template_ready_validation_failed: {
    tone: "error",
    message: "Resolve wording blockers before marking ready.",
  },
  template_ready_invalid_status: {
    tone: "error",
    message: "Only the latest draft or pending wording can be marked ready.",
  },
  template_ready_stale_version: {
    tone: "error",
    message: "A newer version exists. Refresh and review latest wording.",
  },
  template_ready_failed: {
    tone: "error",
    message: "Could not mark wording ready. Please try again.",
  },
  // Provider setup
  provider_config_saved: { tone: "success", message: "Sandbox provider configuration saved." },
  provider_config_invalid: {
    tone: "error",
    message: "Enter a valid Messaging Service reference (no spaces).",
  },
  provider_config_save_failed: {
    tone: "error",
    message: "Could not save provider configuration. Please try again.",
  },
  provider_config_missing: {
    tone: "error",
    message: "Save the sandbox provider configuration first.",
  },
  sandbox_gate_enabled: {
    tone: "success",
    message: "Sandbox send gate enabled. Sends remain limited to verified test recipients.",
  },
  sandbox_gate_disabled: { tone: "success", message: "Sandbox send gate disabled." },
  sandbox_gate_update_failed: {
    tone: "error",
    message: "Could not update the sandbox send gate. Please try again.",
  },
  sender_identity_saved: { tone: "success", message: "Sender identity saved." },
  sender_identity_invalid: {
    tone: "error",
    message: "Enter a sender label and a valid phone number.",
  },
  sender_identity_save_failed: {
    tone: "error",
    message: "Could not save sender identity. Please try again.",
  },
  test_recipient_added: { tone: "success", message: "Verified test recipient added." },
  test_recipient_invalid: { tone: "error", message: "Enter a valid test recipient phone number." },
  test_recipient_exists: { tone: "warn", message: "This test recipient already exists." },
  test_recipient_add_failed: {
    tone: "error",
    message: "Could not add test recipient. Please try again.",
  },
  test_recipient_deactivated: { tone: "success", message: "Test recipient deactivated." },
  test_recipient_update_failed: {
    tone: "error",
    message: "Could not update test recipient. Please try again.",
  },
  // Sandbox send queue
  sandbox_intent_missing: { tone: "error", message: "Message intent was missing." },
  sandbox_delivery_prepared: {
    tone: "success",
    message: "Delivery prepared. It can now be dry-run checked and sandbox submitted.",
  },
  sandbox_delivery_already_prepared: {
    tone: "warn",
    message: "A delivery already exists for this intent.",
  },
  sandbox_preflight_blocked: {
    tone: "error",
    message: "Intent is not ready for delivery preparation. Review its blocked reasons.",
  },
  sandbox_delivery_missing: { tone: "error", message: "Delivery id was missing." },
  sandbox_delivery_not_found: { tone: "error", message: "Delivery was not found." },
  sandbox_delivery_not_ready: { tone: "error", message: "Delivery is not ready for submission." },
  sandbox_delivery_already_submitted: {
    tone: "warn",
    message: "This delivery was already submitted to the provider.",
  },
  sandbox_intent_not_ready: {
    tone: "error",
    message: "The linked message intent is not ready for provider submission.",
  },
  sandbox_provider_not_ready: {
    tone: "error",
    message: "Sandbox provider configuration is not ready. Complete provider setup below.",
  },
  sandbox_send_gate_missing_or_disabled: {
    tone: "error",
    message: "The sandbox send gate is disabled. Enable it in provider setup to allow test submits.",
  },
  sandbox_test_recipient_required: {
    tone: "error",
    message: "The recipient phone must match an active, verified sandbox test recipient.",
  },
  sandbox_reservation_dry_run_ready: {
    tone: "success",
    message: "Dry run passed. All gates are ready for a sandbox test submit.",
  },
  sandbox_delivery_reserved: {
    tone: "warn",
    message: "This delivery was already reserved by another submit attempt.",
  },
  sandbox_provider_submit_attempted: {
    tone: "success",
    message: "Sandbox submit attempted. Delivery status will update from provider callbacks.",
  },
  sandbox_provider_immediate_failure: {
    tone: "error",
    message: "The provider rejected the sandbox submit. The failure was recorded on the delivery.",
  },
  sandbox_internal_error: {
    tone: "error",
    message: "Something went wrong processing the sandbox action. Please try again.",
  },
};

const TEMPLATE_NOTICE_FALLBACK: TemplateNotice = {
  tone: "error",
  message: "Could not update template governance. Please try again.",
};

function versionStatusTone(status: string) {
  if (status === "active" || status === "approved_for_activation" || status === "approved_for_sandbox") {
    return "bg-emerald-50 border-emerald-200 text-emerald-800";
  }
  if (status === "pending_review") {
    return "bg-amber-50 border-amber-200 text-amber-800";
  }
  if (status === "rejected") {
    return "bg-rose-50 border-rose-200 text-rose-800";
  }
  return "bg-slate-50 border-slate-200 text-slate-700";
}

function tokenList(tokens: string[], emptyText: string) {
  if (tokens.length === 0) {
    return <span className="text-slate-500">{emptyText}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tokens.map((token) => (
        <span key={token} className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
          {token}
        </span>
      ))}
    </div>
  );
}

function bannerClass(tone: TemplateNoticeTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

function resolveTemplateNotice(rawNotice: string | undefined): TemplateNotice | null {
  const noticeCode = String(rawNotice ?? "").trim().toLowerCase();
  if (!noticeCode) return null;
  return TEMPLATE_NOTICE_TEXT[noticeCode] ?? TEMPLATE_NOTICE_FALLBACK;
}

function VersionSummaryCard({
  title,
  summary,
  showInformationalLabel = false,
}: {
  title: string;
  summary: SmsTemplateGovernanceVersionSummary;
  showInformationalLabel?: boolean;
}) {
  if (!summary.exists) return null;

  const reviewSatisfactionLabel = summary.approvalReady
    ? "Template review requirements satisfied"
    : summary.approvalReadyLabel;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-xs text-slate-600">
            Version {summary.versionNumber ?? "-"}
            {summary.versionLabel ? ` • ${summary.versionLabel}` : ""}
          </p>
        </div>
        {showInformationalLabel ? (
          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800">
            Informational only
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 sm:grid-cols-3">
        <div className="text-xs">
          <div className="font-semibold text-slate-700">Version status</div>
          <div className="mt-1">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${versionStatusTone(summary.versionStatus)}`}>
              {summary.versionStatusLabel}
            </span>
          </div>
        </div>
        <div className="text-xs">
          <div className="font-semibold text-slate-700">Internal review</div>
          <div className="mt-1 text-slate-600">{summary.internalReviewLabel}</div>
        </div>
        <div className="text-xs">
          <div className="font-semibold text-slate-700">Legal review</div>
          <div className="mt-1 text-slate-600">{summary.legalReviewLabel}</div>
        </div>
        <div className="text-xs">
          <div className="font-semibold text-slate-700">Provider review</div>
          <div className="mt-1 text-slate-600">{summary.providerReviewLabel}</div>
        </div>
        <div className="text-xs">
          <div className="font-semibold text-slate-700">Content classification</div>
          <div className="mt-1 text-slate-600">{summary.contentClassification || "Not configured"}</div>
        </div>
        <div className="text-xs">
          <div className="font-semibold text-slate-700">Token policy version</div>
          <div className="mt-1 text-slate-600">{summary.tokenPolicyVersion || "Not configured"}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-2">
        <div className="text-xs">
          <div className="font-semibold text-slate-700">Detected tokens</div>
          <div className="mt-1">{tokenList(summary.detectedTokens, "No tokens detected.")}</div>
        </div>
        <div className="text-xs">
          <div className="font-semibold text-slate-700">Unknown tokens</div>
          <div className="mt-1">{tokenList(summary.unknownTokens, "No unknown tokens.")}</div>
        </div>
      </div>

      <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs">
        <div>
          <div className="font-semibold text-slate-700">Readiness summary</div>
          <div className="mt-1 text-slate-600">{reviewSatisfactionLabel}</div>
          {!summary.approvalReady ? (
            <div className="mt-1 text-amber-700">Template readiness does not enable sending.</div>
          ) : (
            <div className="mt-1 text-slate-600">Template readiness does not enable sending.</div>
          )}
          {summary.hasUnknownTokens ? (
            <div className="mt-1 text-rose-700">Unknown tokens must be resolved before approval.</div>
          ) : null}
          {!/reply\s+stop\s+to\s+opt\s+out\.?/i.test(summary.bodyTemplate) ? (
            <div className="mt-1 text-rose-700">STOP opt-out language is required before approval.</div>
          ) : null}
        </div>
        <div>
          <div className="font-semibold text-slate-700">Template wording</div>
          <p className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
            {summary.bodyTemplate}
          </p>
        </div>
        <div>
          <div className="font-semibold text-slate-700">Sample preview only.</div>
          <p className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
            {summary.samplePreview}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1 sm:max-w-sm">
          <div>
            <div className="font-semibold text-slate-700">Character count</div>
            <div className="mt-1 text-slate-600">{summary.characterCount}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-700">Estimated SMS segments</div>
            <div className="mt-1 text-slate-600">{summary.estimatedSegments}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function requireAdminOrRedirect() {
  const supabase = await createClient();
  const user = await getRequestUser();

  if (!user) redirect("/login");

  try {
    const authz = await requireInternalRole("admin", { supabase, userId: user.id });
    return { supabase, internalUser: authz.internalUser, user };
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect(
        await resolveInternalAccessErrorRedirectPath({
          supabase,
          user,
          fallbackPath: "/ops",
        }),
      );
    }

    throw error;
  }
}

export default async function AdminCommunicationsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const templateNotice = resolveTemplateNotice(sp.notice);

  const { supabase, internalUser } = await requireAdminOrRedirect();
  // Fail closed to safe-empty readiness if local schemas do not yet include SMS readiness tables.
  const readiness = await getSmsProviderReadinessForAccount({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  }).catch(() =>
    getSmsProviderReadinessForAccount({
      supabase,
      accountOwnerUserId: "",
    }),
  );

  // Fail closed to a safe-empty governance view if template tables are unavailable in local environments.
  const templateGovernance = await getSmsOnTheWayTemplateGovernanceForAccount({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  }).catch(() =>
    getSmsOnTheWayTemplateGovernanceForAccount({
      supabase,
      accountOwnerUserId: "",
    }),
  );

  // Fail closed to safe-empty views when local schemas lag behind.
  const sandboxSetup = await getSmsSandboxSetupForAccount({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  }).catch(() =>
    getSmsSandboxSetupForAccount({
      supabase,
      accountOwnerUserId: "",
    }),
  );

  const sandboxQueue = await getSmsSandboxQueueForAccount({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  }).catch(() =>
    getSmsSandboxQueueForAccount({
      supabase,
      accountOwnerUserId: "",
    }),
  );

  const latestVersionIsMutableDraft =
    templateGovernance.latestVersion.exists && templateGovernance.latestVersion.versionStatus === "draft";

  const latestVersionCanMarkReady =
    templateGovernance.latestVersion.exists &&
    !!templateGovernance.latestVersion.versionId &&
    templateGovernance.latestVersion.canMarkReadyForSandbox === true;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 text-gray-900 sm:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_55%,rgba(226,232,240,0.65))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)]">
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-slate-200/70 blur-3xl" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Center</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">Communications</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Review SMS provider readiness and messaging configuration status.
            </p>
            <div className="inline-flex items-center rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              Sandbox setup and testing only; live SMS remains disabled
            </div>
          </div>
          <Link
            href="/ops/admin"
            className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
          >
            Admin Center
          </Link>
        </div>
      </div>

      {templateNotice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${bannerClass(templateNotice.tone)}`}>
          {templateNotice.message}
        </div>
      ) : null}

      {/* Communications Status Section */}
      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Status</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">Communications Status</h2>
        </div>
        <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-sm text-slate-700">
            <p className="font-medium text-slate-900">{readiness.communicationsStatus.statusLabel}</p>
            <p className="mt-1 text-slate-600">{readiness.communicationsStatus.helperText}</p>
          </div>
          <div className="border-t border-slate-200 pt-3 text-sm text-slate-600">
            <p>
              Sandbox provider setup and manual test sends to verified test recipients are available
              below. Live customer SMS remains disabled until activation gates are complete.
            </p>
          </div>
        </div>
      </section>

      {/* SMS Provider Readiness Section */}
      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Configuration</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">SMS Provider Readiness</h2>
        </div>
        <div className="mt-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-slate-900">
                {readiness.providerReadinessSummary.statusLabel}
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {readiness.providerReadinessSummary.configuredCount} of{" "}
                {readiness.providerReadinessSummary.totalCount > 0
                  ? readiness.providerReadinessSummary.totalCount
                  : "—"}{" "}
                configured
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-600">{readiness.providerReadinessSummary.helperText}</p>
          </div>

          {readiness.hasProviderConfiguration ? (
            <div className="mt-4 space-y-3">
              {readiness.providerConfigurations.map((config) => (
                <div key={config.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900">{config.providerName}</div>
                      <div className="text-xs text-slate-600">{config.providerEnvironment}</div>
                    </div>
                    <div className="space-y-1 text-right">
                      <div className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                        {config.readinessLabel}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 sm:grid-cols-3 md:grid-cols-4">
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700">Account</div>
                      <div className="mt-1 text-slate-600">
                        {config.providerAccountConfigured ? "Configured" : "Not configured"}
                      </div>
                    </div>
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700">Messaging Service</div>
                      <div className="mt-1 text-slate-600">
                        {config.defaultMessagingServiceConfigured ? "Configured" : "Not configured"}
                      </div>
                    </div>
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700">Status Callbacks</div>
                      <div className="mt-1 text-slate-600">{config.statusCallbackLabel}</div>
                    </div>
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700">Opt-Out</div>
                      <div className="mt-1 text-slate-600">{config.advancedOptOutLabel}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              Provider setup has not been configured.
            </div>
          )}
        </div>
      </section>

      {/* Sender Identity Section */}
      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Configuration</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">Sender Identity</h2>
        </div>
        <div className="mt-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-slate-900">{readiness.senderIdentitySummary.statusLabel}</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {readiness.senderIdentitySummary.configuredCount} of{" "}
                {readiness.senderIdentitySummary.totalCount > 0
                  ? readiness.senderIdentitySummary.totalCount
                  : "—"}{" "}
                configured
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-600">{readiness.senderIdentitySummary.helperText}</p>
          </div>

          {readiness.hasSenderIdentity ? (
            <div className="mt-4 space-y-3">
              {readiness.senderIdentities.map((sender) => (
                <div key={sender.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900">{sender.senderDisplayLabel}</div>
                      <div className="text-xs text-slate-600">{sender.maskedSender}</div>
                    </div>
                    <div className="space-y-1 text-right">
                      <div className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                        {sender.senderTypeLabel}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 sm:grid-cols-3">
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700">Type</div>
                      <div className="mt-1 text-slate-600">{sender.registrationTypeLabel}</div>
                    </div>
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700">Verification</div>
                      <div className="mt-1 text-slate-600">{sender.verificationLabel}</div>
                    </div>
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700">Status</div>
                      <div className="mt-1 text-slate-600">{sender.activationLabel}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              No sender identity is configured.
            </div>
          )}
        </div>
      </section>

      {/* Provider Setup (Sandbox) Section */}
      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Configuration</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">Provider Setup (Sandbox)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Configure the Twilio sandbox rows the manual test-send path gates on. References only —
            credentials stay in server environment variables and are never stored here. Nothing on
            this page enables live customer SMS.
          </p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Provider configuration */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">Sandbox provider configuration</p>
              {sandboxSetup.providerConfig.exists ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                  Configured
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                  Not configured
                </span>
              )}
            </div>
            {sandboxSetup.providerConfig.exists ? (
              <p className="mt-2 text-xs text-slate-600">
                Messaging Service: {sandboxSetup.providerConfig.maskedMessagingServiceRef ?? "Not set"} •
                Readiness: {sandboxSetup.providerConfig.readinessStatus ?? "unknown"}
              </p>
            ) : null}
            <form action={saveSmsSandboxProviderConfigFromForm} className="mt-3 space-y-3">
              <div>
                <label htmlFor="messaging-service-ref" className="text-xs font-semibold text-slate-700">
                  Messaging Service SID
                </label>
                <input
                  id="messaging-service-ref"
                  name="messaging_service_ref"
                  required
                  placeholder="MG..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                />
              </div>
              <div>
                <label htmlFor="provider-account-ref" className="text-xs font-semibold text-slate-700">
                  Account reference (optional)
                </label>
                <input
                  id="provider-account-ref"
                  name="provider_account_ref"
                  placeholder="Subaccount reference (never the auth token)"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
              >
                Save provider configuration
              </button>
            </form>

            <div className="mt-4 border-t border-slate-200 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Sandbox send gate</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Server-only gate for manual test submits. Sends stay limited to verified test
                    recipients even when enabled.
                  </p>
                </div>
                {sandboxSetup.providerConfig.sandboxSendEnabled ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                    Enabled
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                    Disabled
                  </span>
                )}
              </div>
              <form action={setSmsSandboxSendGateFromForm} className="mt-2">
                <input
                  type="hidden"
                  name="enable"
                  value={sandboxSetup.providerConfig.sandboxSendEnabled ? "false" : "true"}
                />
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
                >
                  {sandboxSetup.providerConfig.sandboxSendEnabled
                    ? "Disable sandbox send gate"
                    : "Enable sandbox send gate"}
                </button>
              </form>
            </div>
          </div>

          {/* Sender identity */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">Sender identity</p>
              {sandboxSetup.senderIdentity.exists ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                  {sandboxSetup.senderIdentity.verificationStatus === "verified" ||
                  sandboxSetup.senderIdentity.verificationStatus === "active"
                    ? "Verified"
                    : "Pending verification"}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                  Not configured
                </span>
              )}
            </div>
            {sandboxSetup.senderIdentity.exists ? (
              <p className="mt-2 text-xs text-slate-600">
                {sandboxSetup.senderIdentity.displayLabel} • ••••
                {sandboxSetup.senderIdentity.phoneLast4 ?? "----"}
              </p>
            ) : null}
            <form action={saveSmsSenderIdentityFromForm} className="mt-3 space-y-3">
              <div>
                <label htmlFor="sender-display-label" className="text-xs font-semibold text-slate-700">
                  Sender label
                </label>
                <input
                  id="sender-display-label"
                  name="sender_display_label"
                  required
                  placeholder="Business texting number"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                />
              </div>
              <div>
                <label htmlFor="sender-phone" className="text-xs font-semibold text-slate-700">
                  Twilio phone number
                </label>
                <input
                  id="sender-phone"
                  name="phone"
                  required
                  placeholder="(209) 555-1234"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                />
              </div>
              <div>
                <label htmlFor="sender-campaign-ref" className="text-xs font-semibold text-slate-700">
                  A2P campaign reference (optional)
                </label>
                <input
                  id="sender-campaign-ref"
                  name="provider_campaign_ref"
                  placeholder="Campaign SID once approved"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                />
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input type="checkbox" name="verified_with_provider" value="true" className="mt-0.5" />
                <span>
                  This number is active in the provider console and its A2P campaign is approved.
                  Checking this marks the sender verified for sandbox testing only.
                </span>
              </label>
              <button
                type="submit"
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
              >
                Save sender identity
              </button>
            </form>
          </div>
        </div>

        {/* Test recipients */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Verified sandbox test recipients</p>
          <p className="mt-1 text-xs text-slate-600">
            Sandbox test sends only go to phones on this list. Add your own phone here to smoke-test
            once the campaign is approved.
          </p>

          {sandboxSetup.testRecipients.length > 0 ? (
            <div className="mt-3 space-y-2">
              {sandboxSetup.testRecipients.map((recipient) => (
                <div
                  key={recipient.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm"
                >
                  <div className="text-slate-800">
                    ••••{recipient.phoneLast4}
                    {recipient.phoneLabel ? ` • ${recipient.phoneLabel}` : ""}
                    {!recipient.isActive ? (
                      <span className="ml-2 inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        Inactive
                      </span>
                    ) : null}
                  </div>
                  {recipient.isActive ? (
                    <form action={deactivateSmsSandboxTestRecipientFromForm}>
                      <input type="hidden" name="test_recipient_id" value={recipient.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Deactivate
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              No test recipients yet.
            </p>
          )}

          <form action={addSmsSandboxTestRecipientFromForm} className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="test-recipient-phone" className="text-xs font-semibold text-slate-700">
                Phone
              </label>
              <input
                id="test-recipient-phone"
                name="phone"
                required
                placeholder="(209) 555-1234"
                className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
              />
            </div>
            <div>
              <label htmlFor="test-recipient-label" className="text-xs font-semibold text-slate-700">
                Label (optional)
              </label>
              <input
                id="test-recipient-label"
                name="phone_label"
                placeholder="Owner phone"
                className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
            >
              Add verified test recipient
            </button>
          </form>
        </div>
      </section>

      {/* On-The-Way Notification Section */}
      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workflow</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">On-The-Way Notification</h2>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Audit-only (no automatic sends)</p>
          <p className="mt-1">
            Mark On The Way records a non-sending message intent when the recipient, consent, and
            template gates pass. Intents appear in the Sandbox Send Queue below for manual test
            submission. Automatic sending remains disabled until live activation is approved.
          </p>
        </div>
      </section>

      {/* On-The-Way Template Governance Section */}
      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Readiness</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">On-The-Way Template Governance</h2>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
            <p className="font-medium text-slate-900">{templateGovernance.status.statusLabel}</p>
            <p className="mt-1">SMS is not enabled and live sends are disabled.</p>
            <p className="mt-1">Template approval and Mark On The Way do not send SMS.</p>
            <p className="mt-1">Sample previews are informational only; final wording may still require legal/provider review.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Template governance status</p>
                <p className="mt-1 text-sm text-slate-600">
                  {templateGovernance.template.hasTemplate
                    ? templateGovernance.template.displayName
                    : "Template governance has not been configured."}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700">
                {templateGovernance.template.lifecycleLabel}
              </span>
            </div>
            {templateGovernance.template.hasTemplate ? null : (
              <p className="mt-2 text-sm text-slate-600">
                The planning sample below is for review only. SMS is not enabled.
              </p>
            )}
          </div>

          {!templateGovernance.currentVersion.exists && templateGovernance.template.hasTemplate ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">No current governed template version is selected.</p>
              <p className="mt-1">
                Latest version may be shown for visibility only and is not treated as active unless selected by the template pointer.
              </p>
            </div>
          ) : null}

          <VersionSummaryCard title="Current governed version" summary={templateGovernance.currentVersion} />

          <VersionSummaryCard title="Sandbox version" summary={templateGovernance.sandboxVersion} />

          {templateGovernance.latestVersion.exists && !templateGovernance.latestVersion.isCurrentPointer ? (
            <div className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <p className="text-sm font-medium text-sky-900">Latest version visibility</p>
              <p className="text-sm text-sky-800">{templateGovernance.latestVersion.helperText}</p>
              <VersionSummaryCard
                title="Latest version (informational only)"
                summary={templateGovernance.latestVersion}
                showInformationalLabel
              />
            </div>
          ) : null}

          {!templateGovernance.template.hasTemplate ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-700">
              <div className="font-semibold text-slate-800">Planning default wording</div>
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3">
                {templateGovernance.planningDefault.bodyTemplate}
              </p>
              <div className="mt-3 font-semibold text-slate-800">Sample preview only.</div>
              <p className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3">
                {templateGovernance.planningDefault.samplePreview}
              </p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Draft Wording</p>
                <p className="mt-1 text-sm text-slate-600">
                  Create and save draft wording only in this slice. Review actions are intentionally not shown here.
                </p>
              </div>
              {latestVersionIsMutableDraft ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                  Mutable draft available
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                  No mutable draft
                </span>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700">
              <p>SMS is not enabled and live sends are disabled.</p>
              <p className="mt-1">Template approval and Mark On The Way do not send SMS.</p>
              <p className="mt-1">Sample previews are informational only; final wording may still require legal/provider review.</p>
            </div>

            {latestVersionIsMutableDraft ? (
              <form action={saveOnTheWayTemplateDraftFromForm} className="mt-4 space-y-3">
                <div>
                  <label htmlFor="draft-body-template" className="text-xs font-semibold text-slate-700">
                    Draft template wording
                  </label>
                  <textarea
                    id="draft-body-template"
                    name="body_template"
                    defaultValue={templateGovernance.latestVersion.bodyTemplate}
                    rows={7}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-600">
                    Latest version: {templateGovernance.latestVersion.versionStatusLabel} • Internal review: {templateGovernance.latestVersion.internalReviewLabel}
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
                  >
                    Save draft wording
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-slate-700">
                  {templateGovernance.latestVersion.exists
                    ? "Latest version is not a mutable draft. Create a new draft from default wording."
                    : "No draft exists yet. Create one from default wording."}
                </p>
                <form action={createOnTheWayTemplateDraftFromDefaultFromForm}>
                  <button
                    type="submit"
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
                  >
                    Create draft wording
                  </button>
                </form>
              </div>
            )}

            <div className="mt-4 grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-2">
              <div className="text-xs">
                <div className="font-semibold text-slate-700">Detected tokens</div>
                <div className="mt-1">
                  {tokenList(
                    latestVersionIsMutableDraft
                      ? templateGovernance.latestVersion.detectedTokens
                      : templateGovernance.planningDefault.bodyTemplate.match(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)?.map((token) => token.replace(/[{}\s]/g, "")) ?? [],
                    "No tokens detected.",
                  )}
                </div>
              </div>
              <div className="text-xs">
                <div className="font-semibold text-slate-700">Unknown tokens</div>
                <div className="mt-1">
                  {tokenList(
                    latestVersionIsMutableDraft ? templateGovernance.latestVersion.unknownTokens : [],
                    "No unknown tokens.",
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="text-xs">
                <div className="font-semibold text-slate-700">Validation/readiness status</div>
                <p className="mt-1 text-slate-600">
                  {latestVersionIsMutableDraft
                    ? templateGovernance.latestVersion.approvalReadyLabel
                    : "Draft status is not yet available. Create a draft to start editing."}
                </p>
              </div>
              <div className="text-xs">
                <div className="font-semibold text-slate-700">Estimated SMS segments</div>
                <p className="mt-1 text-slate-600">
                  {latestVersionIsMutableDraft
                    ? templateGovernance.latestVersion.estimatedSegments
                    : templateGovernance.planningDefault.samplePreview.length <= 160
                      ? 1
                      : Math.ceil(templateGovernance.planningDefault.samplePreview.length / 153)}
                </p>
              </div>
            </div>

            <div className="mt-3 text-xs">
              <div className="font-semibold text-slate-700">Sample preview only.</div>
              <p className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
                {latestVersionIsMutableDraft
                  ? templateGovernance.latestVersion.samplePreview
                  : templateGovernance.planningDefault.samplePreview}
              </p>
            </div>
          </div>

          {/* Mark Wording Ready for Sandbox */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Mark Wording Ready for Sandbox</p>
                <p className="mt-1 text-sm text-slate-600">
                  Mark the current wording ready for future SMS testing. This does not enable SMS.
                </p>
              </div>
              {latestVersionCanMarkReady ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                  Eligible
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                  Not eligible
                </span>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700">
              <p>This only marks the wording ready for future SMS testing. SMS is still disabled.</p>
              <p className="mt-1">Template readiness does not send SMS.</p>
              <p className="mt-1">Mark On The Way does not send SMS yet.</p>
            </div>

            {latestVersionCanMarkReady ? (
              <form action={markOnTheWayTemplateReadyForSandboxFromForm} className="mt-4">
                <input type="hidden" name="version_id" value={templateGovernance.latestVersion.versionId} />
                {templateGovernance.latestVersion.markReadyWarnings.length > 0 ? (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="font-semibold">Warnings (wording will still be marked ready):</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {templateGovernance.latestVersion.markReadyWarnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-emerald-100 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px] focus:outline-none focus:ring-2 focus:ring-emerald-300"
                >
                  Mark ready for sandbox
                </button>
              </form>
            ) : (
              <div className="mt-4 space-y-2">
                {templateGovernance.latestVersion.markReadyBlockingReasons.length > 0 ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                    <p className="font-semibold">Blockers preventing readiness:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {templateGovernance.latestVersion.markReadyBlockingReasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    {!templateGovernance.latestVersion.exists
                      ? "No template version exists. Create a draft first."
                      : "Latest version is not eligible to be marked ready. Review blocking conditions above."}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
            <p className="font-medium text-slate-900">Current deferred items</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
              {templateGovernance.deferredItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Sandbox Send Queue Section */}
      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Testing</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">Sandbox Send Queue</h2>
          <p className="mt-1 text-sm text-slate-600">
            Recent On-The-Way message intents created by Mark On The Way. Prepare a ready intent,
            dry-run its gates, then submit a sandbox test. Submits only reach verified test
            recipients; delivery status updates from provider callbacks.
          </p>
        </div>

        <div className="mt-4">
          {!sandboxQueue.hasIntents ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              No On-The-Way message intents yet. Intents appear here after a job is marked On The
              Way for a contact with recorded SMS consent.
            </div>
          ) : (
            <div className="space-y-3">
              {sandboxQueue.intents.map((intent) => (
                <div key={intent.intentId} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-semibold text-slate-900">
                        Recipient {intent.maskedRecipientPhone}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {intent.createdAt ? new Date(intent.createdAt).toLocaleString() : "Unknown time"}
                        {intent.templateVersion ? ` • Template v${intent.templateVersion}` : ""}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${
                        intent.decisionOutcome === "ready_for_provider"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-slate-300 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {intent.decisionOutcomeLabel}
                    </span>
                  </div>

                  {intent.blockedReasonCodes.length > 0 ? (
                    <div className="mt-2 text-xs text-amber-700">
                      Blocked: {intent.blockedReasonCodes.join(", ")}
                    </div>
                  ) : null}

                  <div className="mt-3 border-t border-slate-200 pt-3">
                    {intent.delivery ? (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-slate-700">
                          <span className="font-semibold">Delivery:</span>{" "}
                          {intent.delivery.providerStatusLabel}
                          {intent.delivery.providerErrorCode
                            ? ` • Error ${intent.delivery.providerErrorCode}`
                            : ""}
                          {intent.delivery.deliveredAt
                            ? ` • Delivered ${new Date(intent.delivery.deliveredAt).toLocaleString()}`
                            : intent.delivery.sentAt
                              ? ` • Sent ${new Date(intent.delivery.sentAt).toLocaleString()}`
                              : ""}
                        </div>
                        {intent.delivery.providerStatus === "not_submitted" ? (
                          <div className="flex flex-wrap gap-2">
                            <form action={reserveSmsSandboxDeliveryDryRunFromForm}>
                              <input type="hidden" name="delivery_id" value={intent.delivery.deliveryId} />
                              <button
                                type="submit"
                                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm hover:bg-slate-50"
                              >
                                Dry-run gates
                              </button>
                            </form>
                            <form action={submitSmsSandboxDeliveryToProviderFromForm}>
                              <input type="hidden" name="delivery_id" value={intent.delivery.deliveryId} />
                              <button
                                type="submit"
                                className="inline-flex items-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 shadow-sm hover:bg-emerald-100"
                              >
                                Submit sandbox SMS test
                              </button>
                            </form>
                          </div>
                        ) : null}
                      </div>
                    ) : intent.canPrepareDelivery ? (
                      <form action={prepareSmsSandboxDeliveryFromForm} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-600">
                          No delivery prepared yet for this ready intent.
                        </span>
                        <input type="hidden" name="intent_id" value={intent.intentId} />
                        <button
                          type="submit"
                          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm hover:bg-slate-50"
                        >
                          Prepare delivery
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-500">
                        Not eligible for delivery preparation.
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Compliance Readiness Section */}
      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Readiness</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">Compliance Readiness</h2>
        </div>
        <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          {readiness.complianceChecklist.map((item) => {
            const statusColor =
              item.status === "complete"
                ? "bg-emerald-50 border-emerald-200"
                : item.status === "deferred"
                  ? "bg-amber-50 border-amber-200"
                  : "bg-slate-50 border-slate-200";
            const statusTextColor =
              item.status === "complete"
                ? "text-emerald-700"
                : item.status === "deferred"
                  ? "text-amber-700"
                  : "text-slate-700";
            const statusLabel =
              item.status === "complete"
                ? "Complete"
                : item.status === "deferred"
                  ? "Deferred"
                  : "Disabled";

            return (
              <div key={item.key} className={`rounded-lg border px-3 py-2 text-sm ${statusColor}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={statusTextColor}>{item.label}</span>
                  <span className={`font-semibold ${statusTextColor}`}>{statusLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Activation Status Section */}
      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Status</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">Activation Status</h2>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-sm">
            <p className="font-semibold text-slate-900">{readiness.activationSummary.statusLabel}</p>
            <p className="mt-2 text-slate-600">{readiness.activationSummary.helperText}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
