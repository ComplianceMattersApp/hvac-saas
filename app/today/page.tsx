// /today — Home / Today V1 Phase 1 (responsive prototype)
//
// Renders one route for both desktop and mobile, intentionally laid out from
// a shared read model. Mobile is a ranked vertical action stream; desktop is
// a multi-panel launchpad.

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  buildTodayReadModel,
  type FinancialSnapshot,
  type FollowUpGroup,
  type NextBestAction,
  type PriorityChip,
  type RoleAwarePulse,
  type RoleAwarePulseTile,
  type ResumeRecentItem,
  type TeamCoverage,
  type TodayHeader,
  type TodayJobSummary,
  type TodayReadModel,
} from "@/lib/home/today-read-model";
import TodayFieldConditionsClient from "@/components/home/TodayFieldConditionsClient";
import TodayWelcomeModal from "@/components/home/TodayWelcomeModal";
import {
  landingPathForDualContextAccess,
  resolveDualContextAccess,
} from "@/lib/auth/dual-context-access";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Today",
  description: "Your role-aware Today launchpad — what to care about and do next.",
};

// -----------------------------------------------------------------------------
// Shared local style constants (kept page-local on purpose — see Today visual
// polish slice notes; not extracted into a shared component).
// -----------------------------------------------------------------------------

const CARD_SHELL =
  "rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_22px_48px_-30px_rgba(15,31,53,0.32)] sm:p-5";
const CARD_SHELL_PRIMARY =
  "rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_28px_60px_-30px_rgba(15,31,53,0.36)] sm:p-6";
const SECTION_EYEBROW_TEXT = "text-[11px] font-semibold uppercase tracking-[0.09em] text-blue-700";
const SECTION_HEADING_TEXT = "mt-0.5 text-base font-semibold tracking-tight text-[#0f1f35] sm:text-lg";
const SECTION_HEADING_TEXT_LG = "mt-1 text-lg font-semibold tracking-tight text-[#0f1f35] sm:text-xl";
const ROW_SHELL = "rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 shadow-[0_10px_24px_-20px_rgba(15,31,53,0.35)]";

function SectionEyebrow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-[13px] w-[3px] rounded-sm bg-blue-600" />
      <span className={SECTION_EYEBROW_TEXT}>{label}</span>
    </div>
  );
}

function AccountBadge({
  logoUrl,
  initial,
  accountDisplayName,
}: {
  logoUrl: string | null;
  initial: string;
  accountDisplayName: string;
}) {
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 shadow-[0_10px_24px_-12px_rgba(15,31,53,0.45)]">
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={`${accountDisplayName} logo`}
          width={40}
          height={40}
          className="h-full w-full object-contain"
          unoptimized
        />
      ) : (
        <span className="text-sm font-semibold text-slate-700">{initial}</span>
      )}
    </span>
  );
}

export default async function TodayPage() {
  const supabase = await createClient();
  const access = await resolveDualContextAccess({
    supabase,
    getPortalAdmin: createAdminClient,
  });
  if (!access.hasActiveAppAccess) {
    redirect(landingPathForDualContextAccess(access));
  }

  const result = await buildTodayReadModel();

  if ("kind" in result && result.kind === "redirect") {
    redirect(result.to);
  }

  const model = result as TodayReadModel;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 pb-12 sm:px-5 sm:space-y-5 lg:space-y-6 lg:px-6">
      <TodayWelcomeModal initiallyOpen={model.showWelcomeModal} />
      <HeaderSection
        header={model.todayHeader}
        briefing={model.dailyBriefing}
      />

      {/* MOBILE-FIRST RANKED STREAM (visible below the wide desktop layout) */}
      <div className="space-y-4 xl:hidden">
        <NextBestActionCard action={model.nextBestAction} mobile />

        {model.priorityChips.length > 0 ? (
          <PriorityChipsSection chips={model.priorityChips} />
        ) : null}

        {model.teamCoverage.visible ? (
          <TeamCoverageSection
            coverage={model.teamCoverage}
            label={model.productMode === "cleaning_services" ? "Crew Coverage" : "Team Coverage"}
            mobile
          />
        ) : null}

        {model.roleAwarePulse.visible ? (
          <RoleAwarePulseSection pulse={model.roleAwarePulse} />
        ) : null}

        <TodayWorkSection
          label={model.todayWork.label}
          jobs={model.todayWork.jobs.slice(0, 5)}
          showFieldActions={model.todayWork.showFieldActions}
        />

        <FollowUpSection groups={model.followUpGroups.slice(0, 3)} />

        <ResumeRecentSection
          items={model.resumeRecentWork.slice(0, 3)}
          hasMore={model.resumeRecentHasMore}
        />
      </div>

      {/* WIDE DESKTOP MAIN COLUMN + INDEPENDENT RIGHT RAIL */}
      <div className="hidden xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)] xl:items-start xl:gap-5">
        <main className="min-w-0 space-y-5">
          <NextBestActionCard action={model.nextBestAction} />
          {model.teamCoverage.visible ? (
            <TeamCoverageSection
              coverage={model.teamCoverage}
              label={model.productMode === "cleaning_services" ? "Crew Coverage" : "Team Coverage"}
              wide
            />
          ) : null}
          <div className="space-y-5">
            <TodayWorkSection
              label={model.todayWork.label}
              jobs={model.todayWork.jobs}
              showFieldActions={model.todayWork.showFieldActions}
              desktop
              primary
            />
            <FollowUpSection groups={model.followUpGroups} desktop primary />
            <ResumeRecentSection
              items={model.resumeRecentWork}
              hasMore={model.resumeRecentHasMore}
            />
          </div>
        </main>
        <aside className="space-y-5" aria-label="Today summaries">
          {model.priorityChips.length > 0 ? (
            <PriorityChipsSection chips={model.priorityChips} desktop />
          ) : null}
          {model.roleAwarePulse.visible ? (
            <RoleAwarePulseSection pulse={model.roleAwarePulse} />
          ) : null}
        </aside>
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
    <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_24px_52px_-30px_rgba(15,31,53,0.34)]">
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <AccountBadge
            logoUrl={header.companyLogoUrl}
            initial={header.accountDisplayName ? header.accountDisplayName.slice(0, 1).toUpperCase() : "A"}
            accountDisplayName={header.accountDisplayName}
          />
          <div className="min-w-0">
            <SectionEyebrow label={header.accountDisplayName} />
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-[#0f1f35] sm:text-[1.6rem]">
              Today
              <span className="ml-2 text-sm font-medium text-slate-500">· {header.greetingLine}</span>
            </h1>
            <p className="mt-0.5 text-xs leading-5 text-slate-500 sm:text-sm">
              {header.displayDate} · {header.roleLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:pl-3">
          {header.timeClockEnabled ? (
            <ClockChip state={header.clockState} />
          ) : null}
          {header.unreadNotificationCount > 0 ? (
            <Link
              href="/ops/notifications"
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 shadow-sm transition-colors hover:bg-blue-100"
            >
              <span>Notifications</span>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-blue-700">
                {header.unreadNotificationCount > 99 ? "99+" : header.unreadNotificationCount}
              </span>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2.5 border-t border-blue-100/70 bg-gradient-to-r from-blue-50/80 via-blue-50/30 to-transparent px-3.5 py-2.5 sm:px-4">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
        <p className="text-sm font-medium leading-6 text-slate-800">{briefing}</p>
      </div>

      <TodayFieldConditionsClient />
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
      className="relative overflow-hidden rounded-2xl border border-[#0f1f35] bg-gradient-to-br from-[#0f1f35] to-[#16263f] p-4 shadow-[0_30px_64px_-26px_rgba(8,15,30,0.55)] sm:p-5"
    >
      <div
        className={`pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-[90px] ${isEmpty ? "opacity-60" : ""}`}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-12 hidden h-48 w-48 rounded-full bg-blue-400/10 blur-[100px]"
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="h-3 w-1 rounded-full bg-gradient-to-b from-blue-300 to-blue-400/30" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-200">
            Next Best Action
          </span>
        </div>
        <div className={`mt-2 ${mobile ? "text-xl" : "text-2xl lg:text-[1.7rem]"} font-semibold tracking-tight text-white`}>
          {action.headline}
        </div>
        <p className="mt-2 text-sm leading-6 text-blue-100/75 lg:max-w-md">
          Start with this. One clear move first, then work the queues below.
        </p>
        {action.detail ? (
          <p className="mt-2 text-sm leading-6 text-blue-100/75 lg:max-w-md">{action.detail}</p>
        ) : null}
      </div>

      <div className={`relative ${mobile ? "mt-4" : "mt-5"} ${mobile ? "grid grid-cols-1 gap-2" : "flex flex-wrap gap-2"}`}>
        <Link
          href={action.primaryHref}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-[#0f1f35] shadow-[0_14px_30px_-14px_rgba(8,15,30,0.6)] transition hover:bg-blue-50 active:translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
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
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/25 bg-white/10 px-3 text-sm font-semibold text-white shadow-sm backdrop-blur-sm transition hover:bg-white/15 active:translate-y-[0.5px]"
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
  primary = false,
}: {
  label: string;
  jobs: TodayJobSummary[];
  showFieldActions: boolean;
  desktop?: boolean;
  primary?: boolean;
}) {
  return (
    <section className={primary ? CARD_SHELL_PRIMARY : CARD_SHELL}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <SectionEyebrow label="Today" />
          <h2 className={primary ? SECTION_HEADING_TEXT_LG : SECTION_HEADING_TEXT}>{label}</h2>
        </div>
        {desktop ? (
          <Link
            href={showFieldActions ? "/ops/field" : "/ops?bucket=field_work#ops-workspace"}
            className="text-xs font-semibold text-blue-700 hover:underline"
          >
            {showFieldActions ? "View My Work" : "View Field Work"}
          </Link>
        ) : null}
      </div>

      {jobs.length === 0 ? (
        <EmptyState message="No jobs scheduled for today." />
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className={ROW_SHELL}>
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
          className="block truncate text-sm font-semibold tracking-tight text-[#0f1f35] hover:text-blue-700"
        >
          {job.title}
        </Link>
        <div className="truncate text-xs text-slate-600">
          {customer || "Customer"}
          {address ? ` · ${address}` : ""}
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">{scheduleLabel}</span>
          {windowLabel ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">{windowLabel}</span>
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
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-[#0f1f35] px-3 text-xs font-semibold text-white shadow-[0_12px_26px_-14px_rgba(15,31,53,0.6)] transition hover:bg-[#16263f]"
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
  const snapshotKeys = new Set([
    "need_scheduling",
    "field_work",
    "waiting",
    "exceptions",
    "follow_ups",
    "closeout",
  ]);
  const snapshotChips = chips.filter((chip) => snapshotKeys.has(chip.key));
  if (snapshotChips.length === 0) return null;
  return (
    <section className={CARD_SHELL}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <SectionEyebrow label="Operations" />
          <h2 className={SECTION_HEADING_TEXT}>Operations snapshot</h2>
          <p className="mt-1 text-xs text-slate-600">Live counts from the Operations workboard.</p>
        </div>
        {desktop ? (
          <Link href="/ops" className="text-xs font-semibold text-blue-700 hover:underline">
            Open Operations →
          </Link>
        ) : null}
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
        {snapshotChips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`group flex min-h-11 items-center justify-between gap-4 border-l-[3px] border-b border-b-slate-200/80 px-3 py-2.5 text-slate-800 transition-colors last:border-b-0 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${chipAccentClass(chip)}`}
          >
            <span className="text-sm font-semibold">{chip.label}</span>
            <span className="inline-flex min-w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
              {chip.count}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function chipAccentClass(chip: PriorityChip): string {
  if (chip.key === "exceptions") return "border-l-rose-400 bg-rose-50/30";
  if (chip.key === "need_scheduling") return "border-l-amber-400";
  return "border-l-slate-300";
}

function normalizeReasonToken(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");
}

function shouldShowReasonForGroup(groupKey: FollowUpGroup["key"], reason: string | null | undefined): boolean {
  const normalizedReason = normalizeReasonToken(reason);
  if (!normalizedReason) return false;

  if (groupKey === "scheduling" && normalizedReason === "needs scheduling") {
    return false;
  }

  if (groupKey === "payments" && normalizedReason === "payment follow up") {
    return false;
  }

  if (groupKey === "service_plans" && normalizedReason === "service plan follow up") {
    return false;
  }

  return true;
}

// -----------------------------------------------------------------------------
// Action Center
// -----------------------------------------------------------------------------

function FollowUpSection({
  groups,
  desktop = false,
  primary = false,
}: {
  groups: FollowUpGroup[];
  desktop?: boolean;
  primary?: boolean;
}) {
  return (
    <section className={primary ? CARD_SHELL_PRIMARY : CARD_SHELL}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <SectionEyebrow label="Action Center" />
          <h2 className={primary ? SECTION_HEADING_TEXT_LG : SECTION_HEADING_TEXT}>Work that needs a next step</h2>
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
            <li key={group.key} className={ROW_SHELL}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[#0f1f35]">{group.label}</div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
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
                        {(() => {
                          const breadcrumbParts = [
                            shouldShowReasonForGroup(group.key, item.reason) ? item.reason : null,
                            item.customerName,
                            item.city,
                            item.ageDisplay,
                          ].filter(Boolean);

                          if (breadcrumbParts.length === 0) return null;

                          return (
                            <div className="truncate text-xs text-slate-500">
                              {breadcrumbParts.join(" · ")}
                            </div>
                          );
                        })()}
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
  label = "Team Coverage",
  mobile = false,
  wide = false,
}: {
  coverage: TeamCoverage;
  label?: string;
  mobile?: boolean;
  wide?: boolean;
}) {
  return (
    <section className={CARD_SHELL}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <SectionEyebrow label={label} />
          <h2 className={SECTION_HEADING_TEXT}>Who&apos;s assigned today</h2>
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
            <li key={row.key} className={ROW_SHELL}>
              <div
                className={
                  wide
                    ? "grid items-center gap-3 sm:grid-cols-[minmax(8rem,0.75fr)_minmax(0,1.6fr)_auto_auto]"
                    : "grid gap-1.5"
                }
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#0f1f35]">{row.assigneeName}</div>
                </div>
                <div className="min-w-0">
                  <Link href={row.href} className="block text-xs font-medium text-blue-700 hover:underline">
                    {row.jobTitle}
                  </Link>
                  <div className="mt-0.5 text-xs leading-5 text-slate-600">{row.customerLocationLabel}</div>
                </div>
                {wide ? (
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {row.windowLabel ?? "Window pending"}
                  </span>
                ) : null}
                <span className={`shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 ${wide ? "" : "justify-self-start"}`}>
                  {row.statusLabel}
                </span>
              </div>
              <div className={`mt-2 flex items-center gap-3 ${wide ? "justify-end" : "justify-between"}`}>
                {!wide ? (
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {row.windowLabel ?? "Window pending"}
                  </span>
                ) : null}
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
// Role-Aware Pulse
// -----------------------------------------------------------------------------

function RoleAwarePulseSection({ pulse }: {
  pulse: RoleAwarePulse;
}) {
  const financialKeys = new Set(["open_invoices", "confirm_payments", "failed_attempts"]);
  const visibleTiles = pulse.tiles.filter((tile) => financialKeys.has(tile.key) && tile.value > 0);
  const hasContent = visibleTiles.length > 0 || pulse.financialSnapshot != null;

  if (!hasContent) return null;

  return (
    <section className={CARD_SHELL}>
      <SectionEyebrow label="Owner overview" />
      <h2 className={SECTION_HEADING_TEXT}>{pulse.title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-600">{pulse.subtitle}</p>

      {pulse.financialSnapshot ? (
        <FinancialSnapshotCard snapshot={pulse.financialSnapshot} />
      ) : null}

      {visibleTiles.length > 0 ? (
        <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
          {visibleTiles.map((tile) => (
            <RoleAwarePulseTileCard key={tile.key} tile={tile} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FinancialSnapshotCard({ snapshot }: { snapshot: FinancialSnapshot }) {
  const comparison = snapshot.comparisonPercent;
  const comparisonLabel =
    comparison == null
      ? "No comparable collections last month"
      : `${comparison > 0 ? "↑ " : comparison < 0 ? "↓ " : ""}${Math.abs(comparison)}% compared with the same point last month`;

  return (
    <div className="mt-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Collected in {snapshot.monthLabel}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-[#0f1f35] tabular-nums">
        {formatMoney(snapshot.collectedMonthToDateCents)}
      </div>
      <div className={`mt-1 text-xs font-medium ${comparison != null && comparison > 0 ? "text-emerald-700" : "text-slate-600"}`}>{comparisonLabel}</div>
      <Link href="/reports/monthly" className="mt-3 inline-flex text-xs font-semibold text-blue-700 hover:underline">
        View monthly overview →
      </Link>
    </div>
  );
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

function RoleAwarePulseTileCard({
  tile,
}: {
  tile: RoleAwarePulseTile;
}) {
  return (
    <Link
      href={tile.href}
      className="flex min-h-11 items-center justify-between gap-3 py-2.5 text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="min-w-0">
        <div className="text-xs font-semibold text-[#0f1f35]">
          {tile.label}
        </div>
        <div className="text-[11px] text-slate-500">
          {tile.valueDetail || tile.context}
        </div>
      </div>
      <div className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">{tile.value}</div>
    </Link>
  );
}

// -----------------------------------------------------------------------------
// Resume Recent Work
// -----------------------------------------------------------------------------

function ResumeRecentSection({
  items,
  hasMore,
}: {
  items: ResumeRecentItem[];
  hasMore: boolean;
}) {
  return (
    <section id="resume-recent-work" className={CARD_SHELL}>
      <SectionEyebrow label="Resume Recent Work" />
      <h2 className={SECTION_HEADING_TEXT}>Jump back in</h2>

      {items.length === 0 ? (
        <EmptyState message="No recent activity yet." />
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.key} className={ROW_SHELL}>
              <Link href={item.href} className="block group">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[#0f1f35] group-hover:text-blue-700">
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
    <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-3 text-sm text-slate-600">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400/50" />
      {message}
    </div>
  );
}
