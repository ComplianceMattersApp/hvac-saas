import { redirect } from "next/navigation";
import Link from "next/link";
import {
  isInternalAccessError,
  requireInternalRole,
} from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import { ContractorForm } from "@/app/contractors/_components/ContractorForm";
import {
  archiveContractorFromForm,
  unarchiveContractorFromForm,
  updateContractorFromForm,
} from "@/lib/actions/contractor-actions";

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  contractor_created_invite_sent: { tone: "success", message: "Contractor created and invite sent." },
  contractor_created_no_email: { tone: "warn", message: "Contractor created. No invite sent because no email was provided." },
  contractor_created_invite_failed: { tone: "warn", message: "Contractor created, but invite could not be sent." },
  contractor_archived: { tone: "warn", message: "Contractor archived. New invites, assignment, and portal participation are disabled until unarchived." },
  contractor_unarchived: { tone: "success", message: "Contractor unarchived and restored to active eligibility." },
};

function noticeClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-green-200 bg-green-50 text-green-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

export default async function EditContractorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; notice?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const notice = NOTICE_TEXT[String(sp?.notice ?? "").trim().toLowerCase()];

  const supabase = await createClient();   // ✅ must come before using supabase

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (!user || userErr) redirect("/login");

  try {
    await requireInternalRole(["admin", "office"], {
      supabase,
      userId: user.id,
    });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/ops");
    }

    throw error;
  }

  const { data: contractor, error } = await supabase
    .from("contractors")
    .select(
      "id, name, phone, email, notes, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip, lifecycle_state, archived_at, archived_reason"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !contractor) redirect("/ops/admin/contractors");

  const lifecycleState = String((contractor as any).lifecycle_state ?? "active").trim().toLowerCase();
  const isArchived = lifecycleState === "archived";
  const contractorName = String(contractor.name ?? "Unnamed contractor").trim() || "Unnamed contractor";

  const { count: linkedUsersCount, error: linkedUsersErr } = await supabase
    .from("contractor_users")
    .select("user_id", { count: "exact", head: true })
    .eq("contractor_id", id);

  if (linkedUsersErr) throw linkedUsersErr;

  const { data: openInvites, error: openInvitesErr } = await supabase
    .from("contractor_invites")
    .select("id, email, status, created_at")
    .eq("contractor_id", id)
    .in("status", ["pending", "invited"])
    .order("created_at", { ascending: false })
    .limit(5);

  if (openInvitesErr) throw openInvitesErr;

  const pendingInviteCount = openInvites?.length ?? 0;
  const recentInviteTimestamp =
    openInvites && openInvites.length > 0 && openInvites[0]?.created_at
      ? new Date(String(openInvites[0].created_at)).toLocaleString()
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-slate-900 sm:space-y-8 sm:p-6">
      {sp?.saved === "1" && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900 shadow">
          Saved
        </div>
      )}

      {notice ? (
        <div className={`fixed top-4 left-1/2 z-[9998] -translate-x-1/2 rounded-md border px-4 py-2 text-sm shadow ${noticeClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_58%,rgba(224,242,254,0.72))] p-5 shadow-[0_24px_52px_-34px_rgba(15,23,42,0.34)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Contractor Admin</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">{contractorName}</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Maintain contractor profile details, review access posture, and manage lifecycle state from one page.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                  isArchived
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                {isArchived ? "Archived" : "Active"}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700">
                Linked users: {linkedUsersCount ?? 0}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700">
                Open invites: {pendingInviteCount}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/ops/admin/contractors"
              className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
            >
              Contractor Directory
            </Link>
            <Link
              href="/ops/admin/users"
              className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
            >
              People & Access
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr),minmax(280px,1fr)] lg:items-start">
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Core Contractor Profile</h2>
              <p className="text-sm leading-6 text-slate-600">
                Update identity, contact, notes, and billing information.
              </p>
            </div>
            <ContractorForm
              mode="edit"
              contractor={contractor}
              action={updateContractorFromForm}
              embedded
            />
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)]">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">Invite & Access State</h2>
              <p className="text-xs leading-5 text-slate-600">
                Visibility into linked users, open invites, and access readiness.
              </p>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Linked Members</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{linkedUsersCount ?? 0}</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Open Invites</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{pendingInviteCount}</div>
                <div className="mt-1 text-xs text-slate-600">
                  {recentInviteTimestamp ? `Most recent invite: ${recentInviteTimestamp}` : "No pending invites"}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
                {isArchived
                  ? "This contractor is archived. New invites and portal participation are blocked until restored."
                  : "This contractor is active. Invite and portal participation follow normal active-state checks."}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)]">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">Lifecycle & Sensitive Actions</h2>
              <p className="text-xs leading-5 text-slate-600">
                Archive blocks new operational participation without removing historical records.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Current State</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                      isArchived
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {isArchived ? "Archived" : "Active"}
                  </span>
                  <span className="text-xs text-slate-600">
                    {isArchived
                      ? "Blocked from new invites, assignment, and portal participation"
                      : "Eligible for assignment, invites, and portal participation"}
                  </span>
                </div>
                {isArchived && (contractor as any).archived_at ? (
                  <div className="mt-2 text-xs text-slate-600">
                    Archived at: {new Date(String((contractor as any).archived_at)).toLocaleString()}
                  </div>
                ) : null}
                {isArchived && (contractor as any).archived_reason ? (
                  <div className="mt-1 text-xs text-slate-600">
                    Archive reason: {String((contractor as any).archived_reason)}
                  </div>
                ) : null}
              </div>

              {isArchived ? (
                <form action={unarchiveContractorFromForm} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <input type="hidden" name="contractor_id" value={contractor.id ?? ""} />
                  <p className="text-xs leading-5 text-emerald-900">
                    Restore this contractor to active lifecycle state without recreating records or membership history.
                  </p>
                  <button
                    type="submit"
                    className="mt-3 inline-flex items-center rounded-lg border border-emerald-500/70 bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition-[background-color,box-shadow,transform] hover:bg-emerald-700 hover:shadow-[0_10px_20px_-14px_rgba(5,150,105,0.45)] active:translate-y-[0.5px]"
                  >
                    Unarchive contractor
                  </button>
                </form>
              ) : (
                <form action={archiveContractorFromForm} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
                  <input type="hidden" name="contractor_id" value={contractor.id ?? ""} />
                  <p className="text-xs leading-5 text-amber-900">
                    Sensitive action: Archive removes this contractor from active assignment/invite flows while preserving historical attribution.
                  </p>
                  <input
                    name="archived_reason"
                    placeholder="Archive reason (optional)"
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-100"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center rounded-lg border border-amber-600 bg-amber-600 px-3.5 py-2 text-sm font-medium text-white transition-[background-color,box-shadow,transform] hover:bg-amber-700 hover:shadow-[0_10px_20px_-14px_rgba(217,119,6,0.4)] active:translate-y-[0.5px]"
                  >
                    Archive contractor
                  </button>
                </form>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}