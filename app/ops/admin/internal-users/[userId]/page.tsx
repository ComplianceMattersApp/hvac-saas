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
    <div className="mx-auto max-w-4xl space-y-6 p-4 text-gray-900 sm:p-6">
      <section className="rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-slate-50/70 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ops Admin</div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Internal User Profile</h1>
            <p className="max-w-2xl text-sm text-slate-600 sm:text-base">
              Edit practical profile details used across the app without changing sign-in credentials or membership access.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/ops/admin/internal-users"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Back to Internal Users
            </Link>
            <Link
              href="/ops/admin"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Admin Home
            </Link>
          </div>
        </div>
      </section>

      {notice ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">Profile Details</h2>
            <p className="text-sm text-slate-600">
              These fields control how this internal user appears in the product and provide a practical contact number for internal reference.
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
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-slate-900"
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
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-slate-900"
                maxLength={40}
                placeholder="(555) 555-5555"
              />
              <p className="mt-1 text-xs text-slate-500">Leave blank to clear the app-managed phone value.</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-slate-50/70 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</div>
              <div className="mt-1 break-all text-sm font-medium text-slate-900">{email}</div>
              <div className="mt-1 text-xs text-slate-500">Email remains read-only here because sign-in identity is managed separately.</div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Link
                href="/ops/admin/internal-users"
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                Save Profile
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">User Summary</div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">{displayName}</h2>
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

          <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold text-slate-900">Boundaries</h2>
            <p className="mt-2 text-sm text-slate-600">
              This page only edits practical profile data. Role changes, activation, invites, and password operations stay on the main internal users admin screen.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}