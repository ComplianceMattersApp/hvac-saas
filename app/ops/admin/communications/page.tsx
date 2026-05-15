import Link from "next/link";
import { redirect } from "next/navigation";
import { getSmsProviderReadinessForAccount } from "@/lib/communications/sms-provider-readiness-read";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";

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
  const readiness = await getSmsProviderReadinessForAccount({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

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
          <p className="mt-1">Mark On The Way does not send SMS in this build. Future On-The-Way SMS will be background event-driven after job status transitions.</p>
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
