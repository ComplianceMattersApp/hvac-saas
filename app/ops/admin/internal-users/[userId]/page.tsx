import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateInternalUserProfileFromForm } from "@/lib/actions/internal-user-actions";
import {
  isInternalAccessError,
  requireInternalRole,
  type InternalRole,
} from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveHumanDisplayName } from "@/lib/utils/identity-display";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams?: SearchParams;
};

export const metadata: Metadata = {
  title: "Internal User Profile",
};

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  saved: { tone: "success", message: "Internal user profile updated." },
  missing_name: { tone: "error", message: "Enter a display name before saving." },
};

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
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

function readSearchParam(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const raw = searchParams[key];
  return String(Array.isArray(raw) ? raw[0] : raw ?? "").trim().toLowerCase();
}

function resolveEditablePhone(authUser: any) {
  const metadata = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
  return (
    String(metadata.phone ?? "").trim() ||
    String(metadata.phone_number ?? "").trim() ||
    String(authUser?.phone ?? "").trim()
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
    return { supabase, userId: user.id, internalUser: authz.internalUser };
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

export default async function AdminInternalUserProfilePage({ params, searchParams }: PageProps) {
  const { userId: targetUserId } = await params;
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const notice = NOTICE_TEXT[readSearchParam(sp, "profile_status")];

  const { supabase, userId: actorUserId, internalUser } = await requireAdminOrRedirect();

  const { data: targetMembership, error: targetMembershipError } = await supabase
    .from("internal_users")
    .select("user_id, role, is_active, account_owner_user_id, created_at")
    .eq("user_id", targetUserId)
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .maybeSingle();

  if (targetMembershipError) throw targetMembershipError;
  if (!targetMembership?.user_id) notFound();

  const admin = createAdminClient();
  const [{ data: profileRow, error: profileError }, { data: authData, error: authError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", targetUserId)
      .maybeSingle(),
    admin.auth.admin.getUserById(targetUserId),
  ]);

  if (profileError) throw profileError;
  if (authError || !authData?.user) throw authError ?? new Error("TARGET_AUTH_USER_NOT_FOUND");

  const authUser = authData.user as any;
  const userMetadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const displayName = resolveHumanDisplayName({
    profileFullName: profileRow?.full_name,
    metadataName: userMetadata.name,
    metadataFullName: userMetadata.full_name,
    metadataFirstName: userMetadata.first_name,
    metadataLastName: userMetadata.last_name,
    metadataGivenName: userMetadata.given_name,
    email: authUser.email,
    fallback: "User",
  });
  const email = String(profileRow?.email ?? authUser.email ?? "").trim() || "No email on file";
  const phone = resolveEditablePhone(authUser);
  const lifecycle = resolveInternalLifecycleState(
    Boolean(targetMembership.is_active),
    typeof authUser.email_confirmed_at === "string" ? true : authUser.email_confirmed_at === null ? false : null,
  );
  const isSelf = actorUserId === targetUserId;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 text-gray-900 sm:space-y-8 sm:p-6">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_58%,rgba(226,232,240,0.7))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)] sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-slate-200/70 blur-3xl" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Center</div>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">Edit internal profile</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Update the practical profile details your team sees across the app without changing sign-in credentials or account ownership.
            </p>
            <div className="inline-flex items-center rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              Profile details only. Role changes and broader recovery actions stay in the parent admin workspaces.
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
              href="/ops/admin/internal-users"
              className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
            >
              Back to Internal Team
            </Link>
            <Link
              href="/ops/admin/users"
              className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
            >
              People &amp; Access
            </Link>
          </div>
        </div>
      </section>

      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)]">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Profile details</h2>
            <p className="text-sm leading-6 text-slate-600">
              Keep the visible name and practical contact number current for internal use.
            </p>
          </div>

          <form action={updateInternalUserProfileFromForm} className="mt-6 space-y-4">
            <input type="hidden" name="user_id" value={targetUserId} />

            <div>
              <label htmlFor="display_name" className="block text-sm font-medium text-slate-900">
                Display Name
              </label>
              <input
                id="display_name"
                name="display_name"
                type="text"
                defaultValue={displayName}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-2 focus:ring-slate-200"
                maxLength={120}
                required
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-900">
                Phone Number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={phone}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-2 focus:ring-slate-200"
                maxLength={40}
                placeholder="(555) 555-5555"
              />
              <p className="mt-1 text-xs text-slate-500">Leave blank to clear the app-managed phone value.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</div>
              <div className="mt-1 break-all text-sm font-medium text-slate-900">{email}</div>
              <div className="mt-1 text-xs text-slate-500">Email stays read-only here because sign-in identity is managed separately.</div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Link
                href="/ops/admin/internal-users"
                className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
              >
                Save changes
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">User summary</div>
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">{displayName}</h2>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeTone(targetMembership.role as InternalRole)}`}>
                {targetMembership.role}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${lifecycleBadgeTone(lifecycle)}`}>
                {lifecycle}
              </span>
              {isSelf ? (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                  you
                </span>
              ) : null}
            </div>

            <dl className="mt-5 space-y-3 text-sm text-slate-700">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</dt>
                <dd className="mt-1 break-all">{email}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</dt>
                <dd className="mt-1">{phone || "No phone number on file"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">User ID</dt>
                <dd className="mt-1 break-all font-mono text-[12px] text-slate-600">{targetUserId}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 shadow-[0_18px_32px_-30px_rgba(15,23,42,0.18)] sm:p-6">
            <h2 className="text-sm font-semibold text-slate-900">What this page controls</h2>
            <p className="mt-2 text-sm text-slate-600">
              Edit profile details here. Use Internal Team for role changes and People &amp; Access for broader invite or password work.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}