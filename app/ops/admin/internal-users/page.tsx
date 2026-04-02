import Link from "next/link";
import { redirect } from "next/navigation";
import {
  isInternalAccessError,
  requireInternalRole,
  type InternalRole,
} from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveUserDisplayMap } from "@/lib/staffing/human-layer";
import {
  activateInternalUserFromForm,
  createInternalUserFromForm,
  deactivateInternalUserFromForm,
  deleteInternalUserFromForm,
  inviteInternalUserFromForm,
  updateInternalUserRoleFromForm,
} from "@/lib/actions/internal-user-actions";

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

type SearchParams = Promise<{ invite_status?: string }>;

const INVITE_STATUS_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  invited: {
    tone: "success",
    message: "Invite email sent and internal user access is now linked.",
  },
  attached_existing_auth: {
    tone: "success",
    message: "Existing auth user linked/updated in internal users.",
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

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

export default async function AdminInternalUsersPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const inviteStatus = String(sp.invite_status ?? "").trim().toLowerCase();
  const inviteNotice = INVITE_STATUS_TEXT[inviteStatus];

  const { supabase, userId, internalUser } = await requireAdminOrRedirect();

  const { data: internalUsers, error } = await supabase
    .from("internal_users")
    .select("user_id, role, is_active, created_at")
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const userDisplayMap = await resolveUserDisplayMap({
    supabase,
    userIds: (internalUsers ?? [])
      .map((row: any) => String(row?.user_id ?? "").trim())
      .filter(Boolean),
  });

  const admin = createAdminClient();
  const emailConfirmedMap = new Map<string, boolean | null>();
  await Promise.all(
    (internalUsers ?? []).map(async (row: any) => {
      const targetUserId = String(row?.user_id ?? "").trim();
      if (!targetUserId) return;

      const { data, error: authErr } = await admin.auth.admin.getUserById(targetUserId);
      if (authErr || !data?.user) {
        emailConfirmedMap.set(targetUserId, null);
        return;
      }

      emailConfirmedMap.set(targetUserId, Boolean((data.user as any).email_confirmed_at));
    }),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Ops Admin</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Internal Users</h1>
            <p className="text-sm text-slate-600">
              Manage internal account users and role assignment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/ops/admin"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Admin Home
            </Link>
            <Link
              href="/ops"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Ops
            </Link>
          </div>
        </div>
      </div>

      {inviteNotice ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${bannerClass(inviteNotice.tone)}`}>
          {inviteNotice.message}
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-gray-900">Invite Internal User</h2>
        <p className="mt-1 text-sm text-gray-600">
          Send an onboarding invite by email and attach internal role access automatically.
        </p>
        <form action={inviteInternalUserFromForm} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            name="email"
            type="email"
            placeholder="name@company.com"
            className="sm:col-span-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            required
          />
          <select
            name="role"
            defaultValue="office"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            <option value="admin">admin</option>
            <option value="office">office</option>
            <option value="technician">technician</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Invite User
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-gray-900">Add Internal User</h2>
        <p className="mt-1 text-sm text-gray-600">
          Enter an existing auth user ID and assign an initial role.
        </p>
        <form action={createInternalUserFromForm} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            name="user_id"
            placeholder="Auth user UUID"
            className="sm:col-span-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            required
          />
          <select
            name="role"
            defaultValue="office"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            <option value="admin">admin</option>
            <option value="office">office</option>
            <option value="tech">tech</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Add User
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-gray-900">Account Internal Users</h2>
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
                        {role}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${lifecycleBadgeTone(
                          lifecycle,
                        )}`}
                      >
                        {lifecycle}
                      </span>
                      {isSelf ? (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                          you
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <form action={updateInternalUserRoleFromForm} className="flex items-center gap-2">
                      <input type="hidden" name="user_id" value={row.user_id} />
                      <select
                        name="role"
                        defaultValue={role}
                        className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                      >
                        <option value="admin">admin</option>
                        <option value="office">office</option>
                        <option value="tech">tech</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                      >
                        Save Role
                      </button>
                    </form>

                    {row.is_active ? (
                      <form action={deactivateInternalUserFromForm}>
                        <input type="hidden" name="user_id" value={row.user_id} />
                        <button
                          type="submit"
                          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                        >
                          Deactivate
                        </button>
                      </form>
                    ) : (
                      <form action={activateInternalUserFromForm}>
                        <input type="hidden" name="user_id" value={row.user_id} />
                        <button
                          type="submit"
                          className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                        >
                          Activate
                        </button>
                      </form>
                    )}

                    {!row.is_active ? (
                      <form
                        action={deleteInternalUserFromForm}
                        onSubmit={(e) => {
                          if (
                            !confirm(
                              `Are you sure you want to permanently delete ${displayName}? This cannot be undone.`,
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="user_id" value={row.user_id} />
                        <button
                          type="submit"
                          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {(internalUsers ?? []).length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-600 sm:px-5">
              No internal users found for this account owner.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}