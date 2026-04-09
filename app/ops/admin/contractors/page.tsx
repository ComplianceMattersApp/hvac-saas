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

  let pendingInvites: Array<{
    id: string;
    contractor_id: string;
    email: string;
    status: string;
    created_at: string | null;
  }> = [];

  if (contractorIds.length > 0) {
    const { data: inviteRows, error: inviteErr } = await supabase
      .from("contractor_invites")
      .select("id, contractor_id, email, status, created_at")
      .eq("owner_user_id", internalUser.account_owner_user_id)
      .in("contractor_id", contractorIds)
      .in("status", ["pending", "invited"])
      .order("created_at", { ascending: false });

    if (inviteErr) throw inviteErr;
    pendingInvites = inviteRows ?? [];
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
    Array<{ userId: string; email: string; fullName: string; status: "active" | "invited" | "unknown" }>
  >();
  const pendingInvitesByContractor = new Map<
    string,
    Array<{ id: string; email: string; status: string; createdAt: string | null }>
  >();

  for (const membership of memberships) {
    const contractorId = String(membership.contractor_id ?? "").trim();
    const userId = String(membership.user_id ?? "").trim();
    if (!contractorId || !userId) continue;

    const profile = profileMap.get(userId);
    const email = String(profile?.email ?? "").trim().toLowerCase();
    const fullName = String(profile?.fullName ?? "").trim() || "Unknown User";
    const confirmed = emailConfirmedMap.get(userId);
    const status: "active" | "invited" | "unknown" =
      confirmed === true ? "active" : confirmed === false ? "invited" : "unknown";

    const list = membershipByContractor.get(contractorId) ?? [];
    list.push({ userId, email, fullName, status });
    membershipByContractor.set(contractorId, list);
  }

  for (const invite of pendingInvites) {
    const contractorId = String(invite.contractor_id ?? "").trim();
    const inviteId = String(invite.id ?? "").trim();
    const email = String(invite.email ?? "").trim().toLowerCase();
    const status = String(invite.status ?? "").trim().toLowerCase() || "pending";

    if (!contractorId || !inviteId || !email) continue;

    const list = pendingInvitesByContractor.get(contractorId) ?? [];
    list.push({
      id: inviteId,
      email,
      status,
      createdAt: invite.created_at ?? null,
    });
    pendingInvitesByContractor.set(contractorId, list);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-gray-900 sm:space-y-8 sm:p-6">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_58%,rgba(224,242,254,0.72))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)]">
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-sky-100/80 blur-3xl" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Center</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">Contractors</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Manage contractor companies, primary contacts, and contractor-scoped member access from one clean workspace.
            </p>
            <div className="inline-flex items-center rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              Organization setup lives here. People &amp; Access handles broader account recovery work.
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

      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Add contractor company</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Create a new contractor record and start inviting members when you are ready.
        </p>
        <form action={createQuickContractorFromForm} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            name="name"
            type="text"
            placeholder="Contractor name"
            className="sm:col-span-2 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            required
          />
          <input
            name="email"
            type="email"
            placeholder="contact@contractor.com"
            className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
          >
            Create contractor
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)]">
        <div className="border-b border-slate-200/80 bg-slate-50/70 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Contractor directory</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Keep contractor companies, contacts, invites, and linked users organized in one place.
          </p>
        </div>

        <div className="divide-y divide-gray-200">
          {contractorRows.map((row: any) => {
            const createdDate = new Date(row.created_at).toLocaleDateString();
            const contractorId = String(row.id ?? "").trim();
            const members = membershipByContractor.get(contractorId) ?? [];
            const invites = pendingInvitesByContractor.get(contractorId) ?? [];

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
                          className="rounded-lg border border-slate-300/90 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_20px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px] whitespace-nowrap"
                        >
                          Save changes
                        </button>
                      </form>

                      <Link
                        href={`/contractors/${row.id}/edit`}
                        className="rounded-lg border border-slate-300/90 bg-white px-3 py-1.5 text-center text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_20px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
                      >
                        Open full profile
                      </Link>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Invite contractor user</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Everyone invited here shares the same contractor-scoped access for this company.
                    </p>
                    <form action={inviteContractorUserFromForm} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5">
                      <input type="hidden" name="contractor_id" value={contractorId} />
                      <input type="hidden" name="return_to" value="/ops/admin/contractors" />
                      <input
                        name="email"
                        type="email"
                        placeholder="user@contractor.com"
                        className="sm:col-span-3 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        required
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
                      >
                        Send Invite
                      </button>
                    </form>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                    <div className="border-b border-slate-200/80 bg-slate-50/70 px-4 py-3">
                      <h3 className="text-sm font-semibold text-slate-900">Pending invites</h3>
                    </div>

                    {invites.length === 0 ? (
                      <div className="px-4 py-5 text-sm leading-6 text-slate-600">
                        No pending invites right now.
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {invites.map((invite) => {
                          const sentDate = invite.createdAt
                            ? new Date(invite.createdAt).toLocaleDateString()
                            : null;

                          return (
                            <div key={`${contractorId}:invite:${invite.id}`} className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900">{invite.email}</span>
                                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                                    {invite.status}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600">
                                  {sentDate ? `Sent ${sentDate}` : "Invite pending"}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                    <div className="border-b border-slate-200/80 bg-slate-50/70 px-4 py-3">
                      <h3 className="text-sm font-semibold text-slate-900">Linked users</h3>
                    </div>

                    {members.length === 0 ? (
                      <div className="px-4 py-5 text-sm leading-6 text-slate-600">
                        No users are linked yet. Send an invite above to add the first one.
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
                                      : member.status === "invited"
                                        ? "border-amber-200 bg-amber-50 text-amber-900"
                                        : "border-slate-300 bg-slate-50 text-slate-700"
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
            <div className="px-5 py-12 text-center text-sm leading-6 text-slate-600">
              No contractors have been added yet. Create one above to get started.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
