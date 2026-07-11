import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { groupFieldJobs } from "@/lib/ops/field-queue";
import type { FieldWorkJob } from "@/components/ops/FieldWorkCard";
import FieldWorkQueuePanel, { type FieldWorkSection } from "./_components/FieldWorkQueuePanel";

function todayBusinessDateLA() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type JobAssignmentRow = { job_id: string | null };

export default async function OpsFieldPage() {
  const supabase = await createClient();
  const user = await getRequestUser();

  if (!user) redirect("/login");

  let internalBusinessDisplayName = "";
  let accountOwnerUserId = "";

  try {
    const internalAccess = await requireInternalUser({
      supabase,
      userId: user.id,
    });

    accountOwnerUserId = internalAccess.internalUser.account_owner_user_id;

    const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
      supabase,
      accountOwnerUserId,
    });
    internalBusinessDisplayName = internalBusinessIdentity.display_name;
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect(
        await resolveInternalAccessErrorRedirectPath({
          supabase,
          user,
          fallbackPath: "/login",
        }),
      );
    }

    throw error;
  }

  const { data: assignmentRows, error: assignmentErr } = await supabase
    .from("job_assignments")
    .select("job_id")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (assignmentErr) throw assignmentErr;

  const assignedJobIds = Array.from(
    new Set(
      ((assignmentRows ?? []) as JobAssignmentRow[])
        .map((row) => String(row?.job_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  let jobs: FieldWorkJob[] = [];

  if (assignedJobIds.length > 0) {
    const { data, error: jobsErr } = await supabase
      .from("jobs")
      .select(
        "id, title, status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, contractors(name), field_complete"
      )
      .in("id", assignedJobIds)
      .eq("account_owner_user_id", accountOwnerUserId)
      .neq("status", "cancelled")
      .is("deleted_at", null);

    if (jobsErr) throw jobsErr;
    jobs = (data ?? []) as unknown as FieldWorkJob[];
  }

  const today = todayBusinessDateLA();
  const grouped = groupFieldJobs(jobs, today);

  // Most time-sensitive first: overdue and active work lead, then today, then upcoming.
  const sections: FieldWorkSection[] = [
    {
      key: "overdue",
      title: "Overdue",
      mobileTitle: "Overdue",
      subtitle: "Past their window — clear these first.",
      jobs: grouped.overdue,
    },
    {
      key: "in_progress",
      title: "In Progress",
      mobileTitle: "Active",
      subtitle: "Assigned jobs already underway.",
      jobs: grouped.inProgress,
    },
    {
      key: "today",
      title: "Today",
      mobileTitle: "Today",
      subtitle: "Assigned visits scheduled for today.",
      jobs: grouped.today,
    },
    {
      key: "upcoming",
      title: "Upcoming",
      mobileTitle: "Upcoming",
      subtitle: "Assigned upcoming scheduled work in chronological order.",
      jobs: grouped.upcoming,
    },
  ];

  const totalVisibleJobs = sections.reduce((sum, section) => sum + section.jobs.length, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-5 bg-slate-50 p-3 text-slate-900 sm:p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.36)] sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
              <span className="inline-block h-[13px] w-[3px] rounded-full bg-blue-600" aria-hidden="true" />
              Field Queue
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-navy">My Work</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              {totalVisibleJobs} stop{totalVisibleJobs === 1 ? "" : "s"} today. Open a job for full notes, status actions, tests, and closeout.
            </p>
          </div>
          <Link
            href="/ops"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 sm:w-auto"
          >
            Back to Ops
          </Link>
        </div>
      </div>

      {totalVisibleJobs === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white px-6 py-14 text-center shadow-[0_18px_38px_-34px_rgba(15,23,42,0.34)]">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-emerald-600" aria-hidden="true">
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="text-lg font-semibold text-slate-950">All caught up</div>
          <p className="max-w-sm text-sm leading-6 text-slate-600">
            Every assigned visit is closed out. New work will show here as it&apos;s scheduled to you.
          </p>
          <Link
            href="/ops"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
          >
            Back to Ops
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.36)] sm:p-4">
          <FieldWorkQueuePanel
            sections={sections}
            internalBusinessDisplayName={internalBusinessDisplayName}
            todayLA={today}
          />
        </div>
      )}
    </div>
  );
}
