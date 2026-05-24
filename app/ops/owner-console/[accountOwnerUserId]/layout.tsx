import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import { resolveAccountEntitlement } from "@/lib/business/platform-entitlement";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import AccountSnapshotIdentityHeader from "./AccountSnapshotIdentityHeader";
import CompanyProfileSnapshot from "./CompanyProfileSnapshot";
import PaymentsReadinessSnapshot from "./PaymentsReadinessSnapshot";
import SupportCallSummarySnapshot from "./SupportCallSummarySnapshot";
import SupportCasesPanel from "./SupportCasesPanel";
import UsageRecencySnapshot from "./UsageRecencySnapshot";

type LayoutParams = Promise<{
  accountOwnerUserId?: string;
}>;

type TeamUserSnapshot = {
  userId: string;
  email: string | null;
  displayName: string;
  role: string;
  isActive: boolean;
  emailConfirmed: boolean | null;
  createdAt: string | null;
  lastSignInAt: string | null;
};

async function requirePlatformOwnerOrFailClosed() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) redirect("/login");

  const allowlisted = isPlatformOwnerActor({
    userId: user.id,
    email: user.email,
    env: process.env,
  });

  if (!allowlisted) {
    notFound();
  }
}

function formatRole(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "admin") return "Admin";
  if (normalized === "office") return "Dispatcher";
  if (normalized === "tech" || normalized === "technician") return "Technician";
  if (normalized === "billing") return "Billing";
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Unknown";
}

function formatDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatLastSignIn(value: string | null | undefined) {
  const formatted = formatDate(value);
  return formatted === "-" ? "Never" : formatted;
}

function resolveDisplayName(user: any, fallback: string) {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = String(metadata.full_name ?? metadata.name ?? "").trim();
  if (fullName) return fullName;

  const firstName = String(metadata.first_name ?? "").trim();
  const lastName = String(metadata.last_name ?? "").trim();
  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (combined) return combined;

  const email = String(user?.email ?? "").trim();
  if (email) return email;

  return fallback || "Unknown user";
}

function resolveLifecycle(user: TeamUserSnapshot) {
  if (!user.isActive) return "Inactive";
  if (user.emailConfirmed === false) return "Invitation pending";
  if (user.emailConfirmed === true) return "Active";
  return "Unknown";
}

function lifecycleClasses(user: TeamUserSnapshot) {
  const lifecycle = resolveLifecycle(user);
  if (lifecycle === "Active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (lifecycle === "Invitation pending") return "border-amber-200 bg-amber-50 text-amber-900";
  if (lifecycle === "Inactive") return "border-gray-300 bg-gray-50 text-gray-700";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function roleClasses(role: string) {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (normalized === "admin") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (normalized === "office") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

async function loadTeamSnapshot(params: {
  admin: any;
  accountOwnerUserId: string;
}): Promise<TeamUserSnapshot[]> {
  const { data, error } = await params.admin
    .from("internal_users")
    .select("user_id, role, is_active, created_at")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (row: any) => {
      const userId = String(row?.user_id ?? "").trim();
      let authUser: any = null;

      if (userId) {
        const { data: authData, error: authError } = await params.admin.auth.admin.getUserById(userId);
        if (!authError && authData?.user) {
          authUser = authData.user;
        }
      }

      const email = String(authUser?.email ?? "").trim() || null;

      return {
        userId,
        email,
        displayName: resolveDisplayName(authUser, userId),
        role: String(row?.role ?? "").trim(),
        isActive: Boolean(row?.is_active),
        emailConfirmed: authUser ? Boolean((authUser as any).email_confirmed_at) : null,
        createdAt: String(row?.created_at ?? "").trim() || null,
        lastSignInAt: String((authUser as any)?.last_sign_in_at ?? "").trim() || null,
      };
    }),
  );
}

function TeamSeatCard(props: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</p>
      <p className="mt-2 text-base font-semibold text-slate-950">{props.value}</p>
      <p className="mt-1 text-xs text-slate-500">{props.helper}</p>
    </div>
  );
}

async function TeamAndSeatsSection({ accountOwnerUserId }: { accountOwnerUserId: string }) {
  const admin = createAdminClient();
  const [teamUsers, entitlement] = await Promise.all([
    loadTeamSnapshot({ admin, accountOwnerUserId }),
    resolveAccountEntitlement(accountOwnerUserId, admin),
  ]);

  const activeCount = teamUsers.filter((user) => user.isActive).length;
  const invitedCount = teamUsers.filter((user) => user.isActive && user.emailConfirmed === false).length;
  const inactiveCount = teamUsers.filter((user) => !user.isActive).length;
  const signedInCount = teamUsers.filter((user) => Boolean(user.lastSignInAt)).length;
  const seatLimitLabel = entitlement.seatLimit == null ? "Unlimited / not set" : String(entitlement.seatLimit);
  const topUsers = teamUsers.slice(0, 12);

  return (
    <div id="team-seats" className="mx-auto max-w-[1100px] scroll-mt-24 space-y-5 px-4 pb-6 text-slate-900 sm:px-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Team &amp; Seats</p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">Read-only team snapshot</h2>
            <p className="mt-1 text-sm text-slate-500">
              Internal users visible for support triage only. No team edits, invites, access changes, or impersonation are available here.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <TeamSeatCard label="Active Users" value={String(activeCount)} helper={`${teamUsers.length} total internal user${teamUsers.length === 1 ? "" : "s"}.`} />
          <TeamSeatCard label="Seat Limit" value={seatLimitLabel} helper="Platform entitlement seat limit signal." />
          <TeamSeatCard label="Pending Invites" value={String(invitedCount)} helper="Active users without confirmed email." />
          <TeamSeatCard label="Signed In" value={String(signedInCount)} helper="Users with a recorded sign-in." />
          <TeamSeatCard label="Inactive Users" value={String(inactiveCount)} helper="Paused or inactive internal users." />
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[1.3fr_0.7fr_0.8fr_0.7fr_0.7fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span>Last Sign-in</span>
            <span>Added</span>
          </div>
          <div className="divide-y divide-slate-100 bg-white">
            {topUsers.map((user) => (
              <div key={user.userId} className="grid grid-cols-[1.3fr_0.7fr_0.8fr_0.7fr_0.7fr] gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-950" title={user.displayName}>{user.displayName}</p>
                  <p className="truncate text-xs text-slate-500" title={user.email ?? user.userId}>{user.email ?? user.userId}</p>
                </div>
                <div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${roleClasses(user.role)}`}>
                    {formatRole(user.role)}
                  </span>
                </div>
                <div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${lifecycleClasses(user)}`}>
                    {resolveLifecycle(user)}
                  </span>
                </div>
                <div className="text-xs text-slate-500">{formatLastSignIn(user.lastSignInAt)}</div>
                <div className="text-xs text-slate-500">{formatDate(user.createdAt)}</div>
              </div>
            ))}
            {topUsers.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                No internal users are visible for this account.
              </div>
            ) : null}
          </div>
        </div>

        {teamUsers.length > topUsers.length ? (
          <p className="mt-2 text-xs text-slate-500">
            Showing first {topUsers.length} of {teamUsers.length} internal users.
          </p>
        ) : null}
      </section>
    </div>
  );
}

export default async function AccountSnapshotLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: LayoutParams;
}) {
  await requirePlatformOwnerOrFailClosed();

  const rawParams = (await params) ?? {};
  const accountOwnerUserId = decodeURIComponent(
    String(rawParams.accountOwnerUserId ?? "").trim(),
  );

  if (!accountOwnerUserId) {
    notFound();
  }

  return (
    <>
      <AccountSnapshotIdentityHeader accountOwnerUserId={accountOwnerUserId} />
      <SupportCallSummarySnapshot accountOwnerUserId={accountOwnerUserId} />
      <SupportCasesPanel accountOwnerUserId={accountOwnerUserId} />
      <div className="[&>div>section:nth-child(-n+2)]:hidden">
        {children}
      </div>
      <PaymentsReadinessSnapshot accountOwnerUserId={accountOwnerUserId} />
      <UsageRecencySnapshot accountOwnerUserId={accountOwnerUserId} />
      <TeamAndSeatsSection accountOwnerUserId={accountOwnerUserId} />
      <CompanyProfileSnapshot accountOwnerUserId={accountOwnerUserId} />
    </>
  );
}
