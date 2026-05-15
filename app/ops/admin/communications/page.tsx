import Link from "next/link";
import { redirect } from "next/navigation";
import { getSmsProviderReadinessForAccount } from "@/lib/communications/sms-provider-readiness-read";
import {
  getSmsOnTheWayTemplateGovernanceForAccount,
  type SmsTemplateGovernanceVersionSummary,
} from "@/lib/communications/sms-template-governance-read";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  try {
    const authz = await requireInternalRole("admin", { supabase, userId: user.id });
    return { supabase, internalUser: authz.internalUser, user };
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: cu, error: cuErr } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cuErr) throw cuErr;
      if (cu?.contractor_id) redirect("/portal");
      redirect("/ops");
    }

    throw error;
  }
}

export default async function AdminCommunicationsPage() {
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
              Status and readiness only; no configuration allowed yet
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
            <p>This page is readiness and status only. SMS send, testing, and provider configuration are not available in this build.</p>
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

      {/* On-The-Way Notification Section */}
      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workflow</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">On-The-Way Notification</h2>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Planned only</p>
          <p className="mt-1">Mark On The Way does not send SMS. Future On-The-Way SMS will be background event-driven after job status transitions.</p>
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
            <p className="mt-1">Mark On The Way does not send SMS.</p>
            <p className="mt-1">Template readiness does not enable sending.</p>
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
