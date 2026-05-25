// /today — Home / Today V1 Phase 1 (responsive prototype)
//
// Renders one route for both desktop and mobile, intentionally laid out from
// a shared read model. Mobile is a ranked vertical action stream; desktop is
// a multi-panel launchpad.

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  buildTodayReadModel,
  type BusinessPulse,
  type FollowUpGroup,
  type NextBestAction,
  type PriorityChip,
  type ResumeRecentItem,
  type TeamCoverage,
  type TodayHeader,
  type TodayJobSummary,
  type TodayReadModel,
} from "@/lib/home/today-read-model";
import TodayWelcomeModal from "@/components/home/TodayWelcomeModal";
import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Today",
  description: "Your role-aware Today launchpad — what to care about and do next.",
};

export default async function TodayPage() {
  const result = await buildTodayReadModel();

  if ("kind" in result && result.kind === "redirect") {
    redirect(result.to);
  }

  const model = result as TodayReadModel;
  const hasUrgentChip = model.priorityChips.some((chip) => chip.urgent);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 pb-12 sm:px-5 sm:space-y-5 lg:space-y-6 lg:px-6">
      <TodayWelcomeModal initiallyOpen={model.showWelcomeModal} />
      <HeaderSection header={model.todayHeader} briefing={model.dailyBriefing} />

      {/* MOBILE-FIRST RANKED STREAM (visible on mobile, hidden on lg+) */}
      <div className="space-y-4 lg:hidden">
        <NextBestActionCard action={model.nextBestAction} mobile />

        <TodayWorkSection
          label={model.todayWork.label}
          jobs={model.todayWork.jobs.slice(0, 5)}
          showFieldActions={model.todayWork.showFieldActions}
        />

        {hasUrgentChip ? (
          <PriorityChipsSection chips={model.priorityChips} />
        ) : null}

        {!hasUrgentChip && model.priorityChips.length > 0 ? (
          <PriorityChipsSection chips={model.priorityChips} />
        ) : null}

        <FollowUpSection groups={model.followUpGroups.slice(0, 3)} />

        {model.teamCoverage.visible ? (
          <TeamCoverageSection coverage={model.teamCoverage} mobile />
        ) : null}

        <ResumeRecentSection
          items={model.resumeRecentWork.slice(0, 3)}
          hasMore={model.resumeRecentHasMore}
        />

        {model.businessPulse.visible ? (
          <BusinessPulseSection
            pulse={model.businessPulse}
            collapsed
          />
        ) : null}
      </div>

      {/* DESKTOP MULTI-PANEL LAUNCHPAD (hidden on mobile, visible on lg+) */}
      <div className="hidden lg:block">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <NextBestActionCard action={model.nextBestAction} />
            {model.priorityChips.length > 0 ? (
              <PriorityChipsSection chips={model.priorityChips} desktop />
            ) : null}
            <TodayWorkSection
              label={model.todayWork.label}
              jobs={model.todayWork.jobs}
              showFieldActions={model.todayWork.showFieldActions}
              desktop
            />
            <FollowUpSection groups={model.followUpGroups} desktop />
          </div>

          <div className="space-y-5">
            {model.businessPulse.visible ? (
              <BusinessPulseSection pulse={model.businessPulse} />
            ) : null}
            {model.teamCoverage.visible ? (
              <TeamCoverageSection coverage={model.teamCoverage} />
            ) : null}
            <ResumeRecentSection
              items={model.resumeRecentWork}
              hasMore={model.resumeRecentHasMore}
              desktop
            />
          </div>
        </div>
      </div>

    </div>
  );
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function HeaderSection({
  header,
  briefing,
}: {
  header: TodayHeader;
  briefing: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
            {header.accountDisplayName}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[1.75rem]">
            Today
          </h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {header.displayDate} · {header.roleLabel}
          </p>
          <p className="mt-2 max-w-3xl rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-sm font-medium leading-6 text-slate-800">
            {briefing}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {header.timeClockEnabled ? (
            <ClockChip state={header.clockState} />
          ) : null}
          {header.unreadNotificationCount > 0 ? (
            <Link
              href="/ops/notifications"
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100"
            >
              <span>Notifications</span>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-blue-700">
                {header.unreadNotificationCount > 99 ? "99+" : header.unreadNotificationCount}
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ClockChip({ state }: { state: TodayHeader["clockState"] }) {
  const label =
    state === "clocked_in"
      ? "Clocked In"
      : state === "on_lunch"
      ? "On Lunch"
      : "Clocked Out";
  const tone =
    state === "clocked_in"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : state === "on_lunch"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <Link
      href="/time-clock"
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white ${tone}`}
    >
      <span>{label}</span>
      <span className="text-[10px] uppercase tracking-[0.1em] text-current/70">Open Time Clock</span>
    </Link>
  );
}

// -----------------------------------------------------------------------------
// Next Best Action
// -----------------------------------------------------------------------------

function NextBestActionCard({
  action,
  mobile = false,
}: {
  action: NextBestAction;
  mobile?: boolean;
}) {
  const isEmpty = action.kind === "empty";
  return (
    <section
      className={`rounded-2xl border p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)] sm:p-5 ${
        isEmpty
          ? "border-slate-200 bg-slate-50"
          : "border-blue-200 bg-gradient-to-br from-white via-white to-blue-50"
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
        Next Best Action
      </div>
      <div className={`mt-1.5 ${mobile ? "text-xl" : "text-2xl"} font-semibold tracking-tight text-slate-950`}>
        {action.headline}
      </div>
      {action.detail ? (
        <p className="mt-1.5 text-sm leading-6 text-slate-600">{action.detail}</p>
      ) : null}

      <div className={`mt-4 ${mobile ? "grid grid-cols-1 gap-2" : "flex flex-wrap gap-2"}`}>
        <Link
          href={action.primaryHref}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        >
          {action.primaryLabel}
        </Link>

        {action.kind === "tech_next_job" && action.job ? (
          <TechQuickActions job={action.job} mobile={mobile} />
        ) : null}
      </div>
    </section>
  );
}

function TechQuickActions({ job, mobile }: { job: TodayJobSummary; mobile: boolean }) {
  const phone = String(job.customerPhone ?? "").replace(/\D/g, "");
  const mapsQuery = [job.jobAddress, job.city].filter(Boolean).join(", ");
  const mapsHref = mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : null;

  const items: Array<{ href: string; label: string }> = [];
  if (phone) items.push({ href: `tel:${phone}`, label: "Call" });
  if (phone) items.push({ href: `sms:${phone}`, label: "Text" });
  if (mapsHref) items.push({ href: mapsHref, label: "Navigate" });

  if (items.length === 0) return null;

  return (
    <div className={mobile ? "grid grid-cols-3 gap-2" : "flex flex-wrap gap-2"}>
      {items.map((item) => (
        <a
          key={item.label}
          href={item.href}
          target={item.label === "Navigate" ? "_blank" : undefined}
          rel={item.label === "Navigate" ? "noreferrer" : undefined}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:translate-y-[0.5px]"
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Today's Work
// -----------------------------------------------------------------------------

function TodayWorkSection({
  label,
  jobs,
  showFieldActions,
  desktop = false,
}: {
  label: string;
  jobs: TodayJobSummary[];
  showFieldActions: boolean;
  desktop?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)] sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Today
          </div>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-slate-950 sm:text-lg">
            {label}
          </h2>
        </div>
        {desktop ? (
          <Link href="/ops/field" className="text-xs font-semibold text-blue-700 hover:underline">
            View My Work
          </Link>
        ) : null}
      </div>

      {jobs.length === 0 ? (
        <EmptyState message="No jobs scheduled for today." />
      ) : (
        <>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/40">
            {jobs.map((job) => (
              <li key={job.id} className="px-3 py-3">
                <TodayJobRow job={job} showFieldActions={showFieldActions} />
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <Link href="/ops" className="text-xs font-semibold text-blue-700 hover:underline">
              View Full Workboard
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function TodayJobRow({
  job,
  showFieldActions,
}: {
  job: TodayJobSummary;
  showFieldActions: boolean;
}) {
  const customer = [job.customerFirstName ?? "", job.customerLastName ?? ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const scheduleLabel = job.scheduledDate
    ? formatBusinessDateUS(job.scheduledDate) || "Schedule pending"
    : "Schedule pending";
  const windowLabel =
    job.windowStart || job.windowEnd
      ? displayWindowLA(job.windowStart, job.windowEnd) || ""
      : "";
  const address = [job.jobAddress, job.city].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <Link
          href={`/jobs/${job.id}?tab=ops`}
          className="block truncate text-sm font-semibold tracking-tight text-slate-950 hover:text-blue-700"
        >
          {job.title}
        </Link>
        <div className="truncate text-xs text-slate-600">
          {customer || "Customer"}
          {address ? ` · ${address}` : ""}
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">{scheduleLabel}</span>
          {windowLabel ? (
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">{windowLabel}</span>
          ) : null}
          {job.status ? (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-800">
              {formatJobStatus(job.status)}
            </span>
          ) : null}
        </div>
      </div>

      {showFieldActions ? (
        <Link
          href={`/jobs/${job.id}?tab=ops`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          Open Job
        </Link>
      ) : (
        <Link
          href={`/jobs/${job.id}?tab=ops`}
          className="inline-flex shrink-0 items-center text-xs font-semibold text-blue-700 hover:underline"
        >
          Open
        </Link>
      )}
    </div>
  );
}

function formatJobStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// -----------------------------------------------------------------------------
// Priority Chips
// -----------------------------------------------------------------------------

function PriorityChipsSection({
  chips,
  desktop = false,
}: {
  chips: PriorityChip[];
  desktop?: boolean;
}) {
  if (chips.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)] sm:p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Priority Queues
      </div>
      <h2 className="mt-0.5 text-base font-semibold tracking-tight text-slate-950 sm:text-lg">
        {desktop ? "Where to focus next" : "Tap to focus"}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors ${chipToneClass(chip)}`}
          >
            <span>{chip.label}</span>
            <span className="rounded-full bg-white/85 px-1.5 py-0.5 tabular-nums text-current">
              {chip.count}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function chipToneClass(chip: PriorityChip): string {
  if (chip.tone === "danger") return "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100";
  if (chip.tone === "warn") return "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100";
  if (chip.tone === "info") return "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100";
  return "border-slate-200 bg-slate-50 text-slate-800 hover:bg-white";
}

// -----------------------------------------------------------------------------
// Action Center
// -----------------------------------------------------------------------------

function FollowUpSection({
  groups,
  desktop = false,
}: {
  groups: FollowUpGroup[];
  desktop?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)] sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Action Center
          </div>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-slate-950 sm:text-lg">
            Work that needs a next step
          </h2>
        </div>
        {desktop ? (
          <Link href="/ops" className="text-xs font-semibold text-blue-700 hover:underline">
            Open Operations
          </Link>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <EmptyState message="No next-step work waiting right now." />
      ) : (
        <ul className="mt-3 space-y-2">
          {groups.map((group) => (
            <li key={group.key} className="rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-950">{group.label}</div>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                  {group.count}
                </span>
              </div>

              {group.summary ? (
                <div className="mt-1 text-xs text-slate-600">{group.summary}</div>
              ) : null}

              {group.preview.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {group.preview.map((item) => (
                    <li key={item.key}>
                      <Link href={item.href} className="group block rounded-md px-1 py-0.5">
                        <div className="truncate text-sm font-medium text-slate-900 group-hover:text-blue-700">
                          {item.title}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {[item.reason, item.customerName, item.city, item.ageDisplay]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-2">
                <Link href={group.href} className="text-xs font-semibold text-blue-700 hover:underline">
                  View all {group.count}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Team Coverage
// -----------------------------------------------------------------------------

function TeamCoverageSection({
  coverage,
  mobile = false,
}: {
  coverage: TeamCoverage;
  mobile?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)] sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Team Coverage
          </div>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-slate-950 sm:text-lg">
            Who’s assigned today
          </h2>
          <p className="mt-1 text-xs text-slate-600">{coverage.summaryLabel}</p>
        </div>
        <Link href={coverage.href} className="text-xs font-semibold text-blue-700 hover:underline">
          Open Field Work
        </Link>
      </div>

      {coverage.unassignedCount > 0 ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {coverage.unassignedCount} scheduled {coverage.unassignedCount === 1 ? "visit needs" : "visits need"} assignment.
        </div>
      ) : null}

      {coverage.assignments.length === 0 ? (
        <EmptyState message={coverage.emptyStateMessage ?? "No assigned field work scheduled for today."} />
      ) : (
        <ul className="mt-3 space-y-2">
          {coverage.assignments.slice(0, mobile ? 3 : 5).map((row) => (
            <li key={row.key} className="rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950">{row.assigneeName}</div>
                  <Link href={row.href} className="mt-0.5 block truncate text-xs font-medium text-blue-700 hover:underline">
                    {row.jobTitle}
                  </Link>
                  <div className="mt-0.5 truncate text-xs text-slate-600">{row.customerLocationLabel}</div>
                </div>
                <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                  {row.statusLabel}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {row.windowLabel ?? "Window pending"}
                </span>
                <Link href={row.href} className="text-xs font-semibold text-blue-700 hover:underline">
                  Open Job
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {coverage.hasMore ? (
        <div className="mt-3">
          <Link href={coverage.href} className="text-xs font-semibold text-blue-700 hover:underline">
            View all assignments
          </Link>
        </div>
      ) : null}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Business Pulse
// -----------------------------------------------------------------------------

function BusinessPulseSection({
  pulse,
  collapsed = false,
}: {
  pulse: BusinessPulse;
  collapsed?: boolean;
}) {
  const showServicePlans =
    pulse.servicePlansActive !== null ||
    pulse.servicePlansOverdue !== null ||
    pulse.servicePlansDueIn7 !== null;
  const showInvoices = pulse.openInvoiceCount !== null;

  const hasContent = showServicePlans || showInvoices;

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)] sm:p-5 ${
        collapsed ? "opacity-95" : ""
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Business Pulse
      </div>
      <h2 className="mt-0.5 text-base font-semibold tracking-tight text-slate-950 sm:text-lg">
        {collapsed ? "Owner snapshot" : "Snapshot"}
      </h2>

      {!hasContent ? (
        <EmptyState message="No business pulse data available yet." />
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {showInvoices ? (
            <PulseTile
              label="Open Invoices"
              value={String(pulse.openInvoiceCount ?? 0)}
              sub={
                pulse.openInvoiceBalanceCents != null
                  ? formatCurrency(pulse.openInvoiceBalanceCents)
                  : null
              }
              href="/reports/payments"
            />
          ) : null}
          {pulse.servicePlansActive !== null ? (
            <PulseTile
              label="Active Plans"
              value={String(pulse.servicePlansActive)}
              href="/service-plans"
            />
          ) : null}
          {pulse.servicePlansOverdue !== null ? (
            <PulseTile
              label="Plans Overdue"
              value={String(pulse.servicePlansOverdue)}
              href="/service-plans"
              danger={pulse.servicePlansOverdue > 0}
            />
          ) : null}
          {pulse.servicePlansDueIn7 !== null ? (
            <PulseTile
              label="Due in 7 Days"
              value={String(pulse.servicePlansDueIn7)}
              href="/service-plans"
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function PulseTile({
  label,
  value,
  sub,
  href,
  danger = false,
}: {
  label: string;
  value: string;
  sub?: string | null;
  href: string;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-xl border px-3 py-2 transition-colors ${
        danger
          ? "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100"
          : "border-slate-200 bg-slate-50/70 text-slate-900 hover:bg-white"
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-current/70">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-current/70">{sub}</div> : null}
    </Link>
  );
}

function formatCurrency(cents: number): string {
  const dollars = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(dollars);
}

// -----------------------------------------------------------------------------
// Resume Recent Work
// -----------------------------------------------------------------------------

function ResumeRecentSection({
  items,
  hasMore,
  desktop = false,
}: {
  items: ResumeRecentItem[];
  hasMore: boolean;
  desktop?: boolean;
}) {
  return (
    <section id="resume-recent-work" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)] sm:p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Resume Recent Work
      </div>
      <h2 className="mt-0.5 text-base font-semibold tracking-tight text-slate-950 sm:text-lg">
        Jump back in
      </h2>

      {items.length === 0 ? (
        <EmptyState message="No recent activity yet." />
      ) : (
        <ul className={`mt-3 space-y-2 ${desktop ? "" : ""}`}>
          {items.map((item) => (
            <li key={item.key} className="rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-2">
              <Link href={item.href} className="block group">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950 group-hover:text-blue-700">
                      {item.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                        {item.itemType}
                      </span>
                      <span className="truncate">{item.subtitle}</span>
                    </div>
                  </div>
                  {item.updatedAtDisplay ? (
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      {item.updatedAtDisplay}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className="mt-3">
          <Link href="/ops" className="text-xs font-semibold text-blue-700 hover:underline">
            View more recent work
          </Link>
        </div>
      ) : null}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Misc
// -----------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-3 text-sm text-slate-600">
      {message}
    </div>
  );
}
