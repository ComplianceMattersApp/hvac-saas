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
    .select("id, name, email, created_at, lifecycle_state")
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

  const activeContractors = contractorRows.filter(
    (row: any) => String(row?.lifecycle_state ?? "active").trim().toLowerCase() !== "archived",
  );
  const archivedContractors = contractorRows.filter(
    (row: any) => String(row?.lifecycle_state ?? "active").trim().toLowerCase() === "archived",
  );

  const totalLinkedUsers = contractorRows.reduce((count: number, row: any) => {
    const contractorId = String(row?.id ?? "").trim();
    if (!contractorId) return count;
    return count + (membershipByContractor.get(contractorId)?.length ?? 0);
  }, 0);

  const totalOpenInvites = contractorRows.reduce((count: number, row: any) => {
    const contractorId = String(row?.id ?? "").trim();
    if (!contractorId) return count;
    return count + (pendingInvitesByContractor.get(contractorId)?.length ?? 0);
  }, 0);

  const renderContractorCard = (row: any) => {
    const createdDate = row?.created_at ? new Date(row.created_at).toLocaleDateString() : "Unknown date";
    const contractorId = String(row?.id ?? "").trim();
    const lifecycleState = String(row?.lifecycle_state ?? "active").trim().toLowerCase();
    const isArchived = lifecycleState === "archived";
    const members = membershipByContractor.get(contractorId) ?? [];
    const invites = pendingInvitesByContractor.get(contractorId) ?? [];
    const hasLinkedActiveUser = members.some((member) => member.status === "active");
    const outerCardTone = isArchived
      ? "border-slate-300/95 bg-[linear-gradient(180deg,rgba(248,250,252,0.86),rgba(241,245,249,0.74))]"
      : "border-slate-300/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))]";
    const statsTone = isArchived
      ? "divide-slate-200 bg-slate-100/70"
      : "divide-sky-100 bg-sky-50/65";
    const detailsDividerTone = isArchived ? "border-slate-200" : "border-sky-100";
    const detailsSummaryTone = isArchived ? "text-slate-800" : "text-sky-900";

    return (
      <article
        key={row.id}
        className={`rounded-2xl border p-4 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.2)] sm:p-5 ${outerCardTone}`}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold tracking-[-0.01em] text-slate-950">{row.name}</h3>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                    isArchived
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {isArchived ? "Archived" : "Active"}
                </span>
              </div>

              <div className="text-xs text-slate-600">{row.email || "No primary email on file"}</div>
              <div className="text-xs text-slate-500">Added {createdDate}</div>
              {isArchived ? <div className="text-xs text-slate-500">Restore from full profile when ready.</div> : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/contractors/${row.id}/edit`}
                className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_20px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
              >
                Open full profile
              </Link>
            </div>
          </div>

          <div className={`grid grid-cols-1 divide-y rounded-xl px-3 py-1 sm:grid-cols-3 sm:divide-x sm:divide-y-0 ${statsTone}`}>
            <div className="py-2 sm:px-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Linked users</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{members.length}</div>
            </div>
            <div className="py-2 sm:px-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Open invites</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{invites.length}</div>
            </div>
            <div className="py-2 sm:px-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Access state</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {isArchived
                  ? "Archived (blocked)"
                  : hasLinkedActiveUser
                    ? "Portal-ready"
                    : "No confirmed member"}
              </div>
            </div>
          </div>

          <details className="rounded-lg" open={!isArchived}>
            <summary className={`cursor-pointer list-none rounded-lg px-1 py-2 text-sm font-medium ${detailsSummaryTone}`}>
              Access and invite details
            </summary>

            <div className={`space-y-4 border-t pt-3 ${detailsDividerTone}`}>
              <form
                action={updateContractorNameAndEmailFromForm}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,1fr,auto] sm:items-center"
              >
                <input type="hidden" name="contractor_id" value={row.id} />
                <input
                  name="name"
                  defaultValue={row.name}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                  placeholder="Contractor name"
                  required
                />
                <input
                  name="email"
                  type="email"
                  defaultValue={row.email || ""}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                  placeholder="Email"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300/90 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_20px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px] whitespace-nowrap"
                >
                  Save quick edit
                </button>
              </form>

              <div className={`border-t pt-3 ${detailsDividerTone}`}>
                <h4 className="text-sm font-semibold text-slate-900">Invite contractor user</h4>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Everyone invited here shares the same contractor-scoped access for this company.
                  {isArchived ? " Archived contractors cannot receive new invites." : ""}
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
                    disabled={isArchived}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    Send Invite
                  </button>
                </form>
              </div>

              <div
                className={`grid grid-cols-1 gap-5 border-t pt-3 lg:grid-cols-2 lg:divide-x lg:gap-0 ${detailsDividerTone} ${
                  isArchived ? "lg:divide-slate-200" : "lg:divide-sky-100"
                }`}
              >
                <div className="lg:pr-4">
                  <div className="px-0 py-1.5">
                    <h4 className="text-sm font-semibold text-slate-900">Pending invites</h4>
                  </div>

                  {invites.length === 0 ? (
                    <div className="px-0 py-2 text-sm leading-6 text-slate-600">No pending invites right now.</div>
                  ) : (
                    <div className={`divide-y ${isArchived ? "divide-slate-200" : "divide-sky-100"}`}>
                      {invites.map((invite) => {
                        const sentDate = invite.createdAt
                          ? new Date(invite.createdAt).toLocaleDateString()
                          : null;

                        return (
                          <div key={`${contractorId}:invite:${invite.id}`} className="flex flex-col gap-1 px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">{invite.email}</span>
                              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                                {invite.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">
                              {sentDate ? `Sent ${sentDate}` : "Invite pending"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="lg:pl-4">
                  <div className="px-0 py-1.5">
                    <h4 className="text-sm font-semibold text-slate-900">Linked users</h4>
                  </div>

                  {members.length === 0 ? (
                    <div className="px-0 py-2 text-sm leading-6 text-slate-600">
                      No users are linked yet. Send an invite above to add the first one.
                    </div>
                  ) : (
                    <div className={`divide-y ${isArchived ? "divide-slate-200" : "divide-sky-100"}`}>
                      {members.map((member) => (
                        <div key={`${contractorId}:${member.userId}`} className="flex flex-col gap-3 px-3 py-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">{member.fullName}</span>
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
                            <p className="text-xs text-slate-600">{member.email || "No profile email"}</p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {member.email ? (
                              <form action={resendContractorInviteFromForm}>
                                <input type="hidden" name="contractor_id" value={contractorId} />
                                <input type="hidden" name="email" value={member.email} />
                                <input type="hidden" name="return_to" value="/ops/admin/contractors" />
                                <button
                                  type="submit"
                                  disabled={isArchived}
                                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-55"
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
          </details>
        </div>
      </article>
    );
  };

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

      <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
            Active: {activeContractors.length}
          </span>
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
            Archived: {archivedContractors.length}
          </span>
          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">
            Linked users: {totalLinkedUsers}
          </span>
          <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-800">
            Open invites: {totalOpenInvites}
          </span>
        </div>

        <div className="mt-5 space-y-8">
          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-sky-950">Active contractors</h2>
              <p className="text-sm leading-6 text-slate-600">
                Primary operational list. Active contractors can be assigned, invited, and participate in portal workflows.
              </p>
            </div>

            {activeContractors.length === 0 ? (
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-8 text-center text-sm leading-6 text-slate-600">
                No active contractors. Create one above or restore from the archived section.
              </div>
            ) : (
              <div className="space-y-3">{activeContractors.map((row: any) => renderContractorCard(row))}</div>
            )}
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-amber-900">Archived contractors</h2>
              <p className="text-sm leading-6 text-slate-600">
                Historical records kept for attribution and audit continuity. Manage restore from each full profile.
              </p>
            </div>

            {archivedContractors.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-sm leading-6 text-slate-600">
                No archived contractors right now.
              </div>
            ) : (
              <div className="space-y-3">{archivedContractors.map((row: any) => renderContractorCard(row))}</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
