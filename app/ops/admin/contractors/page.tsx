import Link from "next/link";
import { redirect } from "next/navigation";
import {
  isInternalAccessError,
  requireInternalRole,
} from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  createQuickContractorFromForm,
  updateContractorNameAndEmailFromForm,
} from "@/lib/actions/contractor-actions";
import {
  inviteContractorUserFromForm,
  resendContractorInviteFromForm,
  sendPasswordResetFromForm,
} from "@/lib/actions/admin-user-actions";

type SearchParams = Promise<{ notice?: string }>;

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  invite_sent: { tone: "success", message: "Contractor user invite sent." },
  invite_resent: { tone: "success", message: "Contractor user invite resent." },
  password_reset_sent: { tone: "success", message: "Password reset email sent." },
  contractor_created_invite_sent: { tone: "success", message: "Contractor created and invite sent." },
  contractor_created_no_email: { tone: "warn", message: "Contractor created. No invite sent because no email was provided." },
  contractor_created_invite_failed: { tone: "warn", message: "Contractor created, but invite could not be sent." },
  invalid_invite_target: { tone: "error", message: "Missing or invalid contractor invite details." },
  invalid_email: { tone: "error", message: "Please enter a valid email address." },
};

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
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

export default async function AdminContractorsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const notice = NOTICE_TEXT[String(sp.notice ?? "").trim().toLowerCase()];

  const { supabase, internalUser } = await requireAdminOrRedirect();
  const admin = createAdminClient();

  const { data: contractors, error } = await supabase
    .from("contractors")
    .select("id, name, email, created_at")
    .eq("owner_user_id", internalUser.account_owner_user_id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const contractorRows = contractors ?? [];
  const contractorIds = contractorRows
    .map((row: any) => String(row?.id ?? "").trim())
    .filter(Boolean);

  let memberships: Array<{ user_id: string; contractor_id: string; created_at: string | null }> = [];
  if (contractorIds.length > 0) {
    const { data: membershipRows, error: membershipErr } = await supabase
      .from("contractor_users")
      .select("user_id, contractor_id, created_at")
      .in("contractor_id", contractorIds)
      .order("created_at", { ascending: true });

    if (membershipErr) throw membershipErr;
    memberships = membershipRows ?? [];
  }

  const userIds = Array.from(new Set(memberships.map((row) => String(row.user_id).trim()).filter(Boolean)));
  const profileMap = new Map<string, { email: string; fullName: string }>();

  if (userIds.length > 0) {
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    if (profilesErr) throw profilesErr;

    for (const profile of profiles ?? []) {
      profileMap.set(String(profile.id), {
        email: String(profile.email ?? "").trim().toLowerCase(),
        fullName: String(profile.full_name ?? "").trim(),
      });
    }
  }

  const emailConfirmedMap = new Map<string, boolean | null>();
  await Promise.all(
    userIds.map(async (id) => {
      const { data, error: userErr } = await admin.auth.admin.getUserById(id);
      if (userErr || !data?.user) {
        emailConfirmedMap.set(id, null);
        return;
      }
      emailConfirmedMap.set(id, Boolean((data.user as any).email_confirmed_at));
    }),
  );

  const membershipByContractor = new Map<
    string,
    Array<{ userId: string; email: string; fullName: string; status: "active" | "invited" }>
  >();

  for (const membership of memberships) {
    const contractorId = String(membership.contractor_id ?? "").trim();
    const userId = String(membership.user_id ?? "").trim();
    if (!contractorId || !userId) continue;

    const profile = profileMap.get(userId);
    const email = String(profile?.email ?? "").trim().toLowerCase();
    const fullName = String(profile?.fullName ?? "").trim() || "Unknown User";
    const confirmed = emailConfirmedMap.get(userId);
    const status: "active" | "invited" = confirmed === false ? "invited" : "active";

    const list = membershipByContractor.get(contractorId) ?? [];
    list.push({ userId, email, fullName, status });
    membershipByContractor.set(contractorId, list);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Ops Admin</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Contractors</h1>
            <p className="text-sm text-slate-600">
              Manage contractor organizations and primary contact information.
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

      {notice ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-gray-900">Add Contractor</h2>
        <p className="mt-1 text-sm text-gray-600">
          Create a new contractor organization record.
        </p>
        <form action={createQuickContractorFromForm} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            name="name"
            type="text"
            placeholder="Contractor name"
            className="sm:col-span-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            required
          />
          <input
            name="email"
            type="email"
            placeholder="contact@contractor.com"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Add Contractor
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-gray-900">Contractor List</h2>
          <p className="mt-1 text-sm text-gray-600">
            Add and manage multiple users under each contractor company.
          </p>
        </div>

        <div className="divide-y divide-gray-200">
          {contractorRows.map((row: any) => {
            const createdDate = new Date(row.created_at).toLocaleDateString();
            const contractorId = String(row.id ?? "").trim();
            const members = membershipByContractor.get(contractorId) ?? [];

            return (
              <div key={row.id} className="px-4 py-4 sm:px-5">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{row.name}</span>
                        {row.email ? (
                          <span className="text-xs text-gray-600">{row.email}</span>
                        ) : null}
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {members.length} user{members.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">Added {createdDate}</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                      <form action={updateContractorNameAndEmailFromForm} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                        <input type="hidden" name="contractor_id" value={row.id} />
                        <input
                          name="name"
                          defaultValue={row.name}
                          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                          placeholder="Contractor name"
                          required
                        />
                        <input
                          name="email"
                          type="email"
                          defaultValue={row.email || ""}
                          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                          placeholder="Email"
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100 whitespace-nowrap"
                        >
                          Save
                        </button>
                      </form>

                      <Link
                        href={`/contractors/${row.id}/edit`}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100 text-center"
                      >
                        Full Details
                      </Link>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                    <h3 className="text-sm font-semibold text-gray-900">Add User To This Contractor</h3>
                    <p className="mt-1 text-xs text-gray-600">
                      All users under this contractor share the same contractor-scoped access.
                    </p>
                    <form action={inviteContractorUserFromForm} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5">
                      <input type="hidden" name="contractor_id" value={contractorId} />
                      <input type="hidden" name="return_to" value="/ops/admin/contractors" />
                      <input
                        name="email"
                        type="email"
                        placeholder="user@contractor.com"
                        className="sm:col-span-3 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                        required
                      />
                      <button
                        type="submit"
                        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                      >
                        Send Invite
                      </button>
                    </form>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-white">
                    <div className="border-b border-gray-200 px-3 py-2">
                      <h3 className="text-sm font-semibold text-gray-900">Linked Users</h3>
                    </div>

                    {members.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-gray-600">
                        No users linked yet. Send an invite above to add the first user.
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {members.map((member) => (
                          <div key={`${contractorId}:${member.userId}`} className="flex flex-col gap-3 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">{member.fullName}</span>
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                                    member.status === "active"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                      : "border-amber-200 bg-amber-50 text-amber-900"
                                  }`}
                                >
                                  {member.status}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600">{member.email || "No profile email"}</p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {member.email ? (
                                <form action={resendContractorInviteFromForm}>
                                  <input type="hidden" name="contractor_id" value={contractorId} />
                                  <input type="hidden" name="email" value={member.email} />
                                  <input type="hidden" name="return_to" value="/ops/admin/contractors" />
                                  <button
                                    type="submit"
                                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                                  >
                                    Resend Invite
                                  </button>
                                </form>
                              ) : null}

                              {member.email ? (
                                <form action={sendPasswordResetFromForm}>
                                  <input type="hidden" name="email" value={member.email} />
                                  <input type="hidden" name="return_to" value="/ops/admin/contractors" />
                                  <button
                                    type="submit"
                                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                                  >
                                    Send Password Reset
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {contractorRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-600 sm:px-5">
              No contractors found. Create one above to get started.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
