import Link from "next/link";
import { redirect } from "next/navigation";
import {
  isInternalAccessError,
  requireInternalRole,
  type InternalRole,
} from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import {
  activateInternalUserFromForm,
  createInternalUserFromForm,
  deactivateInternalUserFromForm,
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

export default async function AdminInternalUsersPage() {
  const { supabase, userId, internalUser } = await requireAdminOrRedirect();

  const { data: internalUsers, error } = await supabase
    .from("internal_users")
    .select("user_id, role, is_active, created_at")
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .order("created_at", { ascending: true });

  if (error) throw error;

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

            return (
              <div key={row.user_id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{row.user_id}</span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeTone(
                          role,
                        )}`}
                      >
                        {role}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                          row.is_active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-gray-300 bg-gray-50 text-gray-700"
                        }`}
                      >
                        {row.is_active ? "active" : "inactive"}
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