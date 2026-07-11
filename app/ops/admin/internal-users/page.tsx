import Link from "next/link";
import { redirect } from "next/navigation";
import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";
import {
  isInternalAccessError,
  requireInternalRole,
  type InternalRole,
} from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import { resolveUserDisplayMap } from "@/lib/staffing/human-layer";
import DeleteInternalUserButton from "./_components/DeleteInternalUserButton";
import { confirmTeamSetupFromForm } from "@/lib/actions/internal-business-profile-actions";
import {
  activateInternalUserFromForm,
  deactivateInternalUserFromForm,
  deleteInternalUserFromForm,
  inviteInternalUserFromForm,
  resendInternalInviteFromForm,
  updateInternalUserFieldBillingCapabilitiesFromForm,
  updateInternalUserRoleFromForm,
  updateInternalUserTimeTrackingFromListForm,
} from "@/lib/actions/internal-user-actions";
import {
  loadFieldBillingCapabilityStatesForUsers,
  type FieldBillingAccessCapabilityKey,
} from "@/lib/auth/internal-user-access-capabilities";

function FieldBillingAccessControls(params: {
  userId: string;
  role?: string | null;
  capabilities?: Partial<Record<FieldBillingAccessCapabilityKey, boolean>>;
}) {
  const fieldBillingEnabled = params.capabilities?.field_billing_enabled === true;
  const role = String(params.role ?? "").trim().toLowerCase();
  const hasRoleIncludedBillingAccess = role === "admin" || role === "billing" || role === "owner";

  return (
    <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <summary className="inline-flex cursor-pointer list-none items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100">
        Manage Permissions
      </summary>

      {hasRoleIncludedBillingAccess ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
          <h3 className="font-semibold text-slate-950">Field Billing Access</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">Billing access included with role.</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Field-only permission toggles are hidden for Admin/Billing users to avoid duplicate financial authority controls.
          </p>
        </div>
      ) : (
        <form action={updateInternalUserFieldBillingCapabilitiesFromForm} className="mt-3">
          <input type="hidden" name="user_id" value={params.userId} />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-950">Field Billing Access</h3>
              <p className="text-xs leading-5 text-slate-600">These permissions do not change the user's role.</p>
            </div>
            <ImmediateSubmitButton
              pendingText="Saving..."
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
            >
              Save Field Billing Access
            </ImmediateSubmitButton>
          </div>

          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm">
              <input
                type="checkbox"
                name="capability_key"
                value="field_billing_enabled"
                defaultChecked={fieldBillingEnabled}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900"
              />
              <span>
                <span className="block font-semibold">Enable field billing access</span>
                <span className="block text-xs leading-5 text-slate-600">
                  Includes billing status, card collection, and cash/check/other collection.
                </span>
                <span className="block text-xs leading-5 text-slate-600">
                  Cash/check/other reported by field users requires Confirm Payment before it counts as collected payment.
                </span>
              </span>
            </label>

            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Office confirmation</p>
              <label className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-amber-950">
                <input
                  type="checkbox"
                  name="capability_key"
                  value="can_verify_non_card_collection"
                  defaultChecked={params.capabilities?.can_verify_non_card_collection === true}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900"
                />
                <span>
                  <span className="block font-medium">Confirm field-reported payments</span>
                  <span className="block text-xs leading-5 text-amber-800">
                    Grant only to office or trusted financial reviewers.
                  </span>
                </span>
              </label>
              <p className="mt-2 text-xs leading-5 text-amber-800">
                Cash/check/other payments reported by field users require Confirm Payment unless the user has office confirmation authority.
              </p>
            </div>
          </div>

          <p className="mt-2 text-xs leading-5 text-slate-500">
            This does not grant Billing/Admin role, final manual payment authority, refunds, reversals, exports, or invoice issue/send authority.
          </p>
        </form>
      )}
    </details>
  );
}

async function requireAdminOrRedirect() {
  const supabase = await createClient();
  const user = await getRequestUser();

  if (!user) redirect("/login");

  try {
    const authz = await requireInternalRole("admin", { supabase, userId: user.id });
    return { supabase, userId: user.id, internalUser: authz.internalUser };
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

function roleBadgeTone(role: InternalRole) {
  if (role === "admin") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (role === "office") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function lifecycleBadgeTone(lifecycle: "active" | "invited" | "inactive" | "unknown") {
  if (lifecycle === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (lifecycle === "invited") return "border-amber-200 bg-amber-50 text-amber-900";
  if (lifecycle === "unknown") return "border-slate-300 bg-slate-50 text-slate-700";
  return "border-gray-300 bg-gray-50 text-gray-700";
}

function resolveInternalLifecycleState(isActive: boolean, emailConfirmed: boolean | null) {
  if (!isActive) return "inactive" as const;
  if (emailConfirmed === false) return "invited" as const;
  if (emailConfirmed === true) return "active" as const;
  return "unknown" as const;
}

function toLifecycleLabel(lifecycle: "active" | "invited" | "inactive" | "unknown") {
  if (lifecycle === "invited") return "Invitation pending";
  if (lifecycle === "inactive") return "Inactive";
  if (lifecycle === "active") return "Active";
  return "Unknown";
}

function toRoleLabel(role: string): string {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin") return "Admin";
  if (normalized === "office") return "Dispatcher";
  if (normalized === "tech" || normalized === "technician") return "Technician";
  if (normalized === "billing") return "Billing / AR";
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Unknown";
}

type SearchParams = Promise<{
  invite_status?: string;
  resend_status?: string;
  team_confirm?: string;
  time_tracking_saved?: string;
}>;

const INVITE_STATUS_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  invited: {
    tone: "success",
    message: "Invite email sent and internal user access is now linked.",
  },
  attached_existing_auth: {
    tone: "success",
    message: "Existing auth user linked/updated in the internal team directory.",
  },
  already_internal: {
    tone: "warn",
    message: "User is already an internal user for this account owner.",
  },
  email_already_invited: {
    tone: "warn",
    message: "That email has already been invited. Ask the user to check their email.",
  },
  email_rate_limited: {
    tone: "warn",
    message:
      "Invite email limit reached. Please wait a few minutes and try again.",
  },
  invite_send_failed: {
    tone: "error",
    message: "Could not send the invite email. No invite success was recorded; check email configuration and try again.",
  },
  seat_limit_reached: {
    tone: "warn",
    message:
      "Seat limit reached for this account. Deactivate an internal user or move to an unlimited plan before adding or reactivating staff.",
  },
  already_internal_other_owner: {
    tone: "error",
    message: "That auth user is already linked to a different internal account owner.",
  },
  target_auth_user_not_found: {
    tone: "error",
    message: "Auth user could not be resolved for that email.",
  },
  invalid_email: {
    tone: "error",
    message: "Please provide a valid email address.",
  },
};

const RESEND_STATUS_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  resent: {
    tone: "success",
    message: "Invite email resent successfully.",
  },
  not_pending: {
    tone: "warn",
    message: "That user has already accepted or is not pending invite.",
  },
  email_rate_limited: {
    tone: "warn",
    message: "Invite email limit reached. Please wait a few minutes and try again.",
  },
  invalid_target: {
    tone: "error",
    message: "Could not resolve that pending invite target.",
  },
  send_failed: {
    tone: "error",
    message: "Could not resend the invite email. Please check email configuration and try again.",
  },
};

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

function formatInviteTimestamp(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Not recorded";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function AdminInternalUsersPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const inviteStatus = String(sp.invite_status ?? "").trim().toLowerCase();
  const inviteNotice = INVITE_STATUS_TEXT[inviteStatus];
  const resendStatus = String(sp.resend_status ?? "").trim().toLowerCase();
  const resendNotice = RESEND_STATUS_TEXT[resendStatus];
  const teamConfirmStatus = String(sp.team_confirm ?? "").trim().toLowerCase();
  const timeTrackingSavedUserId = String(sp.time_tracking_saved ?? "").trim();

  const { supabase, userId, internalUser } = await requireAdminOrRedirect();

  const { data: businessProfile } = await supabase
    .from("internal_business_profiles")
    .select("team_reviewed_at")
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .maybeSingle();

  const teamAlreadyConfirmed = Boolean((businessProfile as any)?.team_reviewed_at);

  const { data: internalUsers, error } = await supabase
    .from("internal_users")
    .select("user_id, role, is_active, time_tracking_enabled, created_at")
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const internalUserIds = (internalUsers ?? [])
    .map((row: any) => String(row?.user_id ?? "").trim())
    .filter(Boolean);
  const fieldBillingCapabilityStates = await loadFieldBillingCapabilityStatesForUsers({
    supabase: supabase as any,
    accountOwnerUserId: internalUser.account_owner_user_id,
    internalUserIds,
  });

  const userDisplayMap = await resolveUserDisplayMap({
    supabase,
    userIds: internalUserIds,
  });

  const admin = createAdminClient();
  const emailConfirmedMap = new Map<string, boolean | null>();
  const emailMap = new Map<string, string | null>();
  const lastInviteSentMap = new Map<string, string | null>();
  await Promise.all(
    (internalUsers ?? []).map(async (row: any) => {
      const targetUserId = String(row?.user_id ?? "").trim();
      if (!targetUserId) return;

      const { data, error: authErr } = await admin.auth.admin.getUserById(targetUserId);
      if (authErr || !data?.user) {
        emailConfirmedMap.set(targetUserId, null);
        emailMap.set(targetUserId, null);
        return;
      }

      const authUser = data.user as any;
      const metadataLastSent = String(authUser.user_metadata?.internal_invite?.last_sent_at ?? "").trim();
      const invitedAt = String(authUser.invited_at ?? "").trim();

      emailConfirmedMap.set(targetUserId, Boolean(authUser.email_confirmed_at));
      emailMap.set(targetUserId, String(authUser.email ?? "").trim() || null);
      lastInviteSentMap.set(targetUserId, metadataLastSent || invitedAt || null);
    }),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-gray-900 sm:space-y-8 sm:p-6">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_58%,rgba(226,232,240,0.7))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)]">
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-slate-200/70 blur-3xl" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Center</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">Internal Team</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Invite your office team and at least one tech so you can run your first jobs.
            </p>
            <div className="inline-flex items-center rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              Internal Team is for people inside your company.
            </div>
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50/90 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              Use People &amp; Access for invites, contractor users, and Portal Access recovery.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/ops/admin"
              className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
            >
              Admin Center
            </Link>
            <Link
              href="/ops/admin/users"
              className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
            >
              People &amp; Access
            </Link>
          </div>
        </div>
      </div>

      {inviteNotice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${bannerClass(inviteNotice.tone)}`}>
          {inviteNotice.message}
        </div>
      ) : null}

      {resendNotice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${bannerClass(resendNotice.tone)}`}>
          {resendNotice.message}
        </div>
      ) : null}

      {teamConfirmStatus === "confirmed" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm">
          Team setup confirmed.
        </div>
      ) : teamConfirmStatus === "failed" ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 shadow-sm">
          Could not confirm team setup. Please try again.
        </div>
      ) : null}

      {!teamAlreadyConfirmed ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Team setup not yet confirmed</p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            Review your team list, then confirm team setup. Do this early so customer and job work can move without delays.
          </p>
          <form action={confirmTeamSetupFromForm} className="mt-3">
            <ImmediateSubmitButton
              pendingText="Confirming..."
              className="inline-flex items-center rounded-lg bg-amber-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-[background-color,box-shadow,transform] hover:bg-amber-800 active:translate-y-[0.5px]"
            >
              Confirm team setup
            </ImmediateSubmitButton>
          </form>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
        <div className="font-semibold text-slate-900">Start here for first jobs</div>
        <p className="mt-1 leading-6">
          Invite dispatch/office and one tech first. Then create your first customer, create your first job, schedule and assign it, capture job notes, and close out to invoice.
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          This can wait: deeper role cleanup and optional team settings after your daily Today/Ops rhythm is working.
        </p>
      </div>

      {timeTrackingSavedUserId ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm">
          Time tracking setting updated.
        </div>
      ) : null}

      <div>
      <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Invite team member</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Invite a person on your internal team and set their role.</p>
        <form action={inviteInternalUserFromForm} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            name="email"
            type="email"
            placeholder="name@company.com"
            className="sm:col-span-2 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            required
          />
          <select
            name="role"
            defaultValue="office"
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <option value="admin">Admin</option>
            <option value="office">Dispatcher</option>
            <option value="billing">Billing / AR</option>
            <option value="technician">Technician</option>
          </select>
          <ImmediateSubmitButton
            pendingText="Sending invite..."
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
          >
            Send Invite
          </ImmediateSubmitButton>
        </form>
      </div>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)]">
        <div className="border-b border-slate-200/80 bg-slate-50/70 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Team results</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Internal team members in the current view.</p>
        </div>

        <div className="divide-y divide-gray-200">
          {(internalUsers ?? []).map((row: any) => {
            const role = row.role as InternalRole;
            const isSelf = row.user_id === userId;
            const targetUserId = String(row.user_id ?? "").trim();
            const lifecycle = resolveInternalLifecycleState(
              Boolean(row.is_active),
              emailConfirmedMap.get(targetUserId) ?? null,
            );
            const displayName = (() => {
              const resolved = String(userDisplayMap[String(row.user_id ?? "").trim()] ?? "").trim();
              return resolved && resolved !== "User" ? resolved : "Unknown User";
            })();
            const secondaryIdentifier = emailMap.get(targetUserId) || targetUserId;
            const lastInviteSentAt = lastInviteSentMap.get(targetUserId) ?? null;
            const canResendInvite = lifecycle === "invited" && Boolean(emailMap.get(targetUserId));

            return (
              <div key={row.user_id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{displayName}</span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeTone(
                          role,
                        )}`}
                      >
                        {toRoleLabel(role)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${lifecycleBadgeTone(
                          lifecycle,
                        )}`}
                      >
                        {toLifecycleLabel(lifecycle)}
                      </span>
                      {isSelf ? (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                          you
                        </span>
                      ) : null}
                    </div>
                    <div className="break-all text-xs text-slate-500">{secondaryIdentifier}</div>
                    {lifecycle === "invited" ? (
                      <div className="text-xs text-slate-500">
                        Last invite sent: {formatInviteTimestamp(lastInviteSentAt)}
                      </div>
                    ) : lifecycle === "active" ? (
                      <div className="text-xs text-slate-500">Invite accepted / active</div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canResendInvite ? (
                      <form action={resendInternalInviteFromForm}>
                        <input type="hidden" name="user_id" value={row.user_id} />
                        <ImmediateSubmitButton
                          pendingText="Resending..."
                          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50"
                        >
                          Resend invite
                        </ImmediateSubmitButton>
                      </form>
                    ) : null}

                    <Link
                      href={`/ops/admin/internal-users/${encodeURIComponent(String(row.user_id ?? ""))}`}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                    >
                      Edit Team Member
                    </Link>

                    <form action={updateInternalUserTimeTrackingFromListForm} className="flex items-center gap-2">
                      <input type="hidden" name="user_id" value={row.user_id} />
                      <input type="hidden" name="time_tracking_enabled" value="0" />
                      <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 has-[input:disabled]:opacity-60 has-[input:disabled]:cursor-not-allowed">
                        <input
                          type="checkbox"
                          name="time_tracking_enabled"
                          value="1"
                          defaultChecked={Boolean((row as any).time_tracking_enabled)}
                          disabled={!row.is_active}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <span className="whitespace-nowrap">Track time</span>
                      </label>
                      <ImmediateSubmitButton
                        pendingText="Updating..."
                        disabled={!row.is_active}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Update
                      </ImmediateSubmitButton>
                    </form>

                    <form action={updateInternalUserRoleFromForm} className="flex items-center gap-2">
                      <input type="hidden" name="user_id" value={row.user_id} />
                      <select
                        name="role"
                        defaultValue={role}
                        className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                      >
                        <option value="admin">Admin</option>
                        <option value="office">Dispatcher</option>
                        <option value="billing">Billing / AR</option>
                        <option value="tech">Technician</option>
                      </select>
                      <ImmediateSubmitButton
                        type="submit"
                        pendingText="Updating..."
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                      >
                        Update Role
                      </ImmediateSubmitButton>
                    </form>

                    {row.is_active ? (
                      <form action={deactivateInternalUserFromForm}>
                        <input type="hidden" name="user_id" value={row.user_id} />
                        <ImmediateSubmitButton
                          pendingText="Pausing..."
                          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                        >
                          Pause Team Access
                        </ImmediateSubmitButton>
                      </form>
                    ) : (
                      <form action={activateInternalUserFromForm}>
                        <input type="hidden" name="user_id" value={row.user_id} />
                        <ImmediateSubmitButton
                          pendingText="Restoring..."
                          className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                        >
                          Restore Team Access
                        </ImmediateSubmitButton>
                      </form>
                    )}

                    {!row.is_active ? <DeleteInternalUserButton userId={String(row.user_id)} displayName={displayName} /> : null}
                  </div>
                </div>
                <FieldBillingAccessControls
                  userId={targetUserId}
                  role={role}
                  capabilities={fieldBillingCapabilityStates[targetUserId] ?? {}}
                />
              </div>
            );
          })}
          {(internalUsers ?? []).length === 0 ? (
            <div className="px-5 py-12 text-center text-sm leading-6 text-slate-600">
              No internal team members have been added yet.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
