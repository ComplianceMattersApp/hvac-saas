import Link from "next/link";
import { redirect } from "next/navigation";
import {
  isInternalAccessError,
  requireInternalRole,
  type InternalRole,
} from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  activateInternalUserFromForm,
  deactivateInternalUserFromForm,
  inviteInternalUserFromForm,
  updateInternalUserRoleFromForm,
} from "@/lib/actions/internal-user-actions";
import {
  resendContractorInviteFromForm,
  resendInternalInviteFromForm,
  sendPasswordResetFromForm,
} from "@/lib/actions/admin-user-actions";

type SearchParams = Promise<{
  type?: string;
  q?: string;
  notice?: string;
}>;

type Lifecycle = "active" | "invited" | "inactive";

type UserRecord = {
  key: string;
  category: "internal" | "contractor";
  userId: string | null;
  email: string;
  name: string;
  company: string;
  role: string;
  lifecycle: Lifecycle;
  canDeactivateReactivate: boolean;
  isActiveFlag: boolean | null;
  contractorId: string | null;
  source: "membership" | "invite";
};

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  invite_resent: { tone: "success", message: "Invite link resent successfully." },
  password_reset_sent: { tone: "success", message: "Password reset email sent successfully." },
  invalid_email: { tone: "error", message: "Please provide a valid email address." },
  invalid_invite_target: { tone: "error", message: "Invite target is missing required information." },
};

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

function lifecycleBadgeClass(lifecycle: Lifecycle) {
  if (lifecycle === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (lifecycle === "invited") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-gray-300 bg-gray-50 text-gray-700";
}

function roleBadgeClass(role: string) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (normalized === "office") return "border-blue-200 bg-blue-50 text-blue-800";
  if (normalized === "owner") return "border-indigo-200 bg-indigo-50 text-indigo-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function toRoleLabel(role: string): string {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "tech") return "tech";
  if (normalized === "member") return "member";
  if (normalized === "owner") return "owner";
  if (normalized === "admin") return "admin";
  if (normalized === "office") return "office";
  return normalized || "unknown";
}

function getInternalLifecycle(isActive: boolean, emailConfirmed: boolean | null): Lifecycle {
  if (!isActive) return "inactive";
  if (emailConfirmed === false) return "invited";
  return "active";
}

function getContractorLifecycle(emailConfirmed: boolean | null): Lifecycle {
  if (emailConfirmed === false) return "invited";
  return "active";
}

function matchesQuery(record: UserRecord, query: string) {
  const q = query.toLowerCase();
  return (
    record.name.toLowerCase().includes(q) ||
    record.email.toLowerCase().includes(q) ||
    record.company.toLowerCase().includes(q)
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

export default async function AdminUsersCommandCenterPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const filterType = String(sp.type ?? "all").trim().toLowerCase();
  const query = String(sp.q ?? "").trim();
  const notice = NOTICE_TEXT[String(sp.notice ?? "").trim().toLowerCase()];

  const { supabase, userId, internalUser } = await requireAdminOrRedirect();
  const admin = createAdminClient();

  const { data: internalUsers, error: iuErr } = await supabase
    .from("internal_users")
    .select("user_id, role, is_active, account_owner_user_id, created_at")
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .order("created_at", { ascending: true });
  if (iuErr) throw iuErr;

  const { data: contractors, error: contractorsErr } = await supabase
    .from("contractors")
    .select("id, name")
    .eq("owner_user_id", internalUser.account_owner_user_id)
    .order("name", { ascending: true });
  if (contractorsErr) throw contractorsErr;

  const contractorMap = new Map<string, { id: string; name: string }>();
  for (const c of contractors ?? []) {
    contractorMap.set(String(c.id), {
      id: String(c.id),
      name: String(c.name ?? "").trim() || "Contractor",
    });
  }

  const contractorIds = Array.from(contractorMap.keys());

  let contractorUsers: Array<{ user_id: string; contractor_id: string; role: string; created_at: string }> = [];
  if (contractorIds.length > 0) {
    const { data, error } = await supabase
      .from("contractor_users")
      .select("user_id, contractor_id, role, created_at")
      .in("contractor_id", contractorIds)
      .order("created_at", { ascending: true });
    if (error) throw error;
    contractorUsers = data ?? [];
  }

  // Optional pending invite visibility for contractor onboarding.
  let contractorInvites: Array<{ id: string; contractor_id: string; email: string; role: string; status: string }> = [];
  const { data: invitesData, error: invitesErr } = await supabase
    .from("contractor_invites")
    .select("id, contractor_id, email, role, status")
    .eq("owner_user_id", internalUser.account_owner_user_id)
    .in("status", ["pending", "invited"])
    .order("created_at", { ascending: false });

  if (!invitesErr) {
    contractorInvites = invitesData ?? [];
  } else {
    const code = String((invitesErr as any)?.code ?? "").trim();
    if (code !== "42P01") {
      throw invitesErr;
    }
  }

  const userIds = new Set<string>();
  for (const row of internalUsers ?? []) userIds.add(String(row.user_id));
  for (const row of contractorUsers ?? []) userIds.add(String(row.user_id));

  const ids = Array.from(userIds);

  const profileMap = new Map<string, { email: string; fullName: string }>();
  if (ids.length > 0) {
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);

    if (profilesErr) throw profilesErr;

    for (const p of profiles ?? []) {
      profileMap.set(String(p.id), {
        email: String(p.email ?? "").trim().toLowerCase(),
        fullName: String(p.full_name ?? "").trim(),
      });
    }
  }

  const authConfirmedMap = new Map<string, boolean | null>();
  await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data?.user) {
        authConfirmedMap.set(id, null);
        return;
      }
      authConfirmedMap.set(id, Boolean((data.user as any).email_confirmed_at));
    }),
  );

  const records: UserRecord[] = [];

  for (const row of internalUsers ?? []) {
    const id = String(row.user_id);
    const profile = profileMap.get(id);
    const email = String(profile?.email ?? "").trim();
    const role = toRoleLabel(String(row.role ?? ""));
    const lifecycle = getInternalLifecycle(Boolean(row.is_active), authConfirmedMap.get(id) ?? null);

    records.push({
      key: `internal:${id}`,
      category: "internal",
      userId: id,
      email,
      name: String(profile?.fullName ?? "").trim() || "Unknown User",
      company: "Internal",
      role,
      lifecycle,
      canDeactivateReactivate: true,
      isActiveFlag: Boolean(row.is_active),
      contractorId: null,
      source: "membership",
    });
  }

  const contractorMembershipEmails = new Set<string>();
  for (const row of contractorUsers) {
    const id = String(row.user_id);
    const contractorId = String(row.contractor_id);
    const contractor = contractorMap.get(contractorId);
    const profile = profileMap.get(id);
    const email = String(profile?.email ?? "").trim().toLowerCase();
    if (email) contractorMembershipEmails.add(`${contractorId}:${email}`);

    records.push({
      key: `contractor:${contractorId}:${id}`,
      category: "contractor",
      userId: id,
      email,
      name: String(profile?.fullName ?? "").trim() || "Unknown User",
      company: contractor?.name ?? "Contractor",
      role: toRoleLabel(String(row.role ?? "member")),
      lifecycle: getContractorLifecycle(authConfirmedMap.get(id) ?? null),
      canDeactivateReactivate: false,
      isActiveFlag: null,
      contractorId,
      source: "membership",
    });
  }

  for (const invite of contractorInvites) {
    const contractorId = String(invite.contractor_id ?? "").trim();
    const email = String(invite.email ?? "").trim().toLowerCase();
    if (!contractorId || !email) continue;
    if (contractorMembershipEmails.has(`${contractorId}:${email}`)) continue;

    records.push({
      key: `contractor-invite:${String(invite.id)}`,
      category: "contractor",
      userId: null,
      email,
      name: "Pending Invite",
      company: contractorMap.get(contractorId)?.name ?? "Contractor",
      role: toRoleLabel(String(invite.role ?? "member")),
      lifecycle: "invited",
      canDeactivateReactivate: false,
      isActiveFlag: null,
      contractorId,
      source: "invite",
    });
  }

  const filtered = records
    .filter((record) => {
      if (filterType === "internal") return record.category === "internal";
      if (filterType === "contractor") return record.category === "contractor";
      if (filterType === "invited") return record.lifecycle === "invited";
      if (filterType === "inactive") return record.lifecycle === "inactive";
      return true;
    })
    .filter((record) => (query ? matchesQuery(record, query) : true));

  const summary = filtered.reduce(
    (acc, record) => {
      acc.total += 1;
      if (record.lifecycle === "active") acc.active += 1;
      if (record.lifecycle === "invited") acc.invited += 1;
      if (record.lifecycle === "inactive") acc.inactive += 1;
      return acc;
    },
    { total: 0, active: 0, invited: 0, inactive: 0 },
  );

  const returnTo = `/ops/admin/users?type=${encodeURIComponent(filterType || "all")}&q=${encodeURIComponent(query)}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Ops Admin</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">User Command Center</h1>
            <p className="text-sm text-slate-600">
              Manage internal and contractor user access, onboarding, and password operations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/ops/admin/internal-users"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Internal Users
            </Link>
            <Link
              href="/ops/admin"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Admin Home
            </Link>
          </div>
        </div>
      </div>

      {notice ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Visible Users</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.total}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Active</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">{summary.active}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Invited</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{summary.invited}</p>
        </div>
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Inactive</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{summary.inactive}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-full">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Type</label>
              <select
                name="type"
                defaultValue={filterType || "all"}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="all">All users</option>
                <option value="internal">Internal users</option>
                <option value="contractor">Contractor users</option>
                <option value="invited">Invited / pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Search (name, email, company)
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Search users..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                >
                  Apply
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-gray-900">Invite Internal User</h2>
          <p className="mt-1 text-sm text-gray-600">Preserves existing internal invite onboarding flow.</p>
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
              Invite
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-gray-900">Current Users</h2>
          <p className="mt-1 text-sm text-gray-600">
            Active and invited users across internal and contractor memberships.
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-600 sm:px-5">
            No users matched your filters.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filtered.map((record) => {
              const isSelf = record.userId === userId;

              return (
                <div key={record.key} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{record.name}</span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                            record.category === "internal"
                              ? "border-slate-300 bg-slate-50 text-slate-700"
                              : "border-indigo-200 bg-indigo-50 text-indigo-800"
                          }`}
                        >
                          {record.category}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeClass(
                            record.role,
                          )}`}
                        >
                          {record.role}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${lifecycleBadgeClass(
                            record.lifecycle,
                          )}`}
                        >
                          {record.lifecycle}
                        </span>
                        {isSelf ? (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                            you
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-gray-600">{record.email || "No email on profile"}</p>
                      <p className="text-xs text-gray-500">{record.company}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {record.category === "internal" ? (
                        <form action={updateInternalUserRoleFromForm} className="flex items-center gap-2">
                          <input type="hidden" name="user_id" value={record.userId ?? ""} />
                          <select
                            name="role"
                            defaultValue={record.role as InternalRole}
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
                      ) : null}

                      {record.category === "internal" && record.canDeactivateReactivate ? (
                        record.isActiveFlag ? (
                          <form action={deactivateInternalUserFromForm}>
                            <input type="hidden" name="user_id" value={record.userId ?? ""} />
                            <button
                              type="submit"
                              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                            >
                              Deactivate
                            </button>
                          </form>
                        ) : (
                          <form action={activateInternalUserFromForm}>
                            <input type="hidden" name="user_id" value={record.userId ?? ""} />
                            <button
                              type="submit"
                              className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                            >
                              Reactivate
                            </button>
                          </form>
                        )
                      ) : null}

                      {record.email ? (
                        <form action={sendPasswordResetFromForm}>
                          <input type="hidden" name="email" value={record.email} />
                          <input type="hidden" name="return_to" value={returnTo} />
                          <button
                            type="submit"
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                          >
                            Send Password Reset
                          </button>
                        </form>
                      ) : null}

                      {record.email && record.category === "internal" ? (
                        <form action={resendInternalInviteFromForm}>
                          <input type="hidden" name="email" value={record.email} />
                          <input type="hidden" name="role" value={record.role} />
                          <input type="hidden" name="return_to" value={returnTo} />
                          <button
                            type="submit"
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                          >
                            Resend Invite
                          </button>
                        </form>
                      ) : null}

                      {record.email && record.category === "contractor" && record.contractorId ? (
                        <form action={resendContractorInviteFromForm}>
                          <input type="hidden" name="email" value={record.email} />
                          <input type="hidden" name="contractor_id" value={record.contractorId} />
                          <input type="hidden" name="role" value={record.role} />
                          <input type="hidden" name="return_to" value={returnTo} />
                          <button
                            type="submit"
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                          >
                            Resend Invite
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
