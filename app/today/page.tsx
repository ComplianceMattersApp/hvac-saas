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
import TodayWelcomeModal from "@/components/home/TodayWelcomeModal";
import {
  landingPathForDualContextAccess,
  resolveDualContextAccess,
} from "@/lib/auth/dual-context-access";
import { createClient } from "@/lib/supabase/server";
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
const SECTION_EYEBROW_TEXT = "text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80";
const SECTION_HEADING_TEXT = "mt-0.5 text-base font-semibold tracking-tight text-[#0f1f35] sm:text-lg";
const SECTION_HEADING_TEXT_LG = "mt-1 text-lg font-semibold tracking-tight text-[#0f1f35] sm:text-xl";
const ROW_SHELL = "rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 shadow-[0_10px_24px_-20px_rgba(15,31,53,0.35)]";

function SectionEyebrow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-1 rounded-full bg-gradient-to-b from-blue-500 to-blue-400/25" />
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
  const access = await resolveDualContextAccess({ supabase });
  if (!access.hasActiveAppAccess) {
    redirect(landingPathForDualContextAccess(access));
  }

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
          <TeamCoverageSection
            coverage={model.teamCoverage}
            label={model.productMode === "cleaning_services" ? "Crew Coverage" : "Team Coverage"}
            mobile
          />
        ) : null}

        <ResumeRecentSection
          items={model.resumeRecentWork.slice(0, 3)}
          hasMore={model.resumeRecentHasMore}
        />

        {model.roleAwarePulse.visible ? (
          <RoleAwarePulseSection
            pulse={model.roleAwarePulse}
            collapsed
          />
        ) : null}
      </div>

      {/* DESKTOP MULTI-PANEL LAUNCHPAD (hidden on mobile, visible on lg+) */}
      <div className="hidden lg:block lg:space-y-5">
        {/* Hero surface — Next Best Action + Business Pulse presented as one
            designed dashboard band, so the rail reads as connected rather
            than a separate, unrelated card. */}
        <div className="rounded-[28px] border border-blue-100/70 bg-gradient-to-br from-white via-white to-blue-50/50 p-2 shadow-[0_34px_72px_-38px_rgba(15,31,53,0.4)]">
          <div className={`grid gap-2 ${model.roleAwarePulse.visible ? "lg:grid-cols-5 lg:items-stretch" : ""}`}>
            <div className={model.roleAwarePulse.visible ? "lg:col-span-3 lg:flex lg:w-full" : ""}>
              <NextBestActionCard action={model.nextBestAction} matchHeight={model.roleAwarePulse.visible} />
            </div>
            {model.roleAwarePulse.visible ? (
              <div className="lg:col-span-2 lg:flex">
                <RoleAwarePulseSection pulse={model.roleAwarePulse} connected />
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {model.priorityChips.length > 0 ? (
              <PriorityChipsSection chips={model.priorityChips} desktop />
            ) : null}
            <TodayWorkSection
              label={model.todayWork.label}
              jobs={model.todayWork.jobs}
              showFieldActions={model.todayWork.showFieldActions}
              desktop
              primary
            />
            <FollowUpSection groups={model.followUpGroups} desktop primary />
          </div>

          <div className="space-y-5">
            {model.teamCoverage.visible ? (
              <TeamCoverageSection
                coverage={model.teamCoverage}
                label={model.productMode === "cleaning_services" ? "Crew Coverage" : "Team Coverage"}
              />
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
    <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_24px_52px_-30px_rgba(15,31,53,0.34)]">
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <AccountBadge
            logoUrl={header.companyLogoUrl}
            initial={header.accountDisplayName ? header.accountDisplayName.slice(0, 1).toUpperCase() : "A"}
            accountDisplayName={header.accountDisplayName}
          />
          <div className="min-w-0">
            <span className={SECTION_EYEBROW_TEXT}>{header.accountDisplayName}</span>
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
  matchHeight = false,
}: {
  action: NextBestAction;
  mobile?: boolean;
  matchHeight?: boolean;
}) {
  const isEmpty = action.kind === "empty";
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-[#0f1f35] bg-gradient-to-br from-[#0f1f35] to-[#16263f] p-4 shadow-[0_30px_64px_-26px_rgba(8,15,30,0.55)] sm:p-5 ${
        matchHeight ? "lg:flex lg:h-full lg:w-full lg:flex-col lg:justify-center" : ""
      }`}
    >
      <div
        className={`pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-[90px] ${isEmpty ? "opacity-60" : ""}`}
      />
      <div
        className={`pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-blue-400/10 blur-[100px] ${
          matchHeight ? "lg:block hidden" : "hidden"
        }`}
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
          <Link href="/ops/field" className="text-xs font-semibold text-blue-700 hover:underline">
            View My Work
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
  if (chips.length === 0) return null;
  return (
    <section className={CARD_SHELL}>
      <SectionEyebrow label="Priority Queues" />
      <h2 className={SECTION_HEADING_TEXT}>
        {desktop ? "Where to focus next" : "Tap to focus"}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-[0_10px_22px_-18px_rgba(15,31,53,0.4)] transition-colors ${chipToneClass(chip)}`}
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
}: {
  coverage: TeamCoverage;
  label?: string;
  mobile?: boolean;
}) {
  return (
    <section className={CARD_SHELL}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <SectionEyebrow label={label} />
          <h2 className={SECTION_HEADING_TEXT}>Who's assigned today</h2>
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
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#0f1f35]">{row.assigneeName}</div>
                  <Link href={row.href} className="mt-0.5 block truncate text-xs font-medium text-blue-700 hover:underline">
                    {row.jobTitle}
                  </Link>
                  <div className="mt-0.5 truncate text-xs text-slate-600">{row.customerLocationLabel}</div>
                </div>
                <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
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
// Role-Aware Pulse
// -----------------------------------------------------------------------------

function RoleAwarePulseSection({
  pulse,
  collapsed = false,
  connected = false,
}: {
  pulse: RoleAwarePulse;
  collapsed?: boolean;
  connected?: boolean;
}) {
  const hasContent = pulse.tiles.length > 0;

  return (
    <section className={`relative overflow-hidden ${CARD_SHELL} ${collapsed ? "opacity-95" : ""} ${connected ? "lg:flex lg:h-full lg:flex-col" : ""}`}>
      {connected ? (
        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-blue-400 to-blue-300/40" />
      ) : null}
      <SectionEyebrow
        label={
          pulse.mode === "business"
            ? "Business Attention"
            : pulse.mode === "money"
            ? "Financial Attention"
            : "Operations Attention"
        }
      />
      <h2 className={SECTION_HEADING_TEXT}>{pulse.title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-600">{pulse.subtitle}</p>

      {!hasContent ? (
        <EmptyState message="No role-specific pulse items are active right now." />
      ) : (
        <div className={`mt-3 grid grid-cols-2 gap-2 ${connected ? "" : "sm:grid-cols-3"}`}>
          {pulse.tiles.map((tile) => (
            <RoleAwarePulseTileCard key={tile.key} tile={tile} />
          ))}
        </div>
      )}
    </section>
  );
}

function RoleAwarePulseTileCard({
  tile,
}: {
  tile: RoleAwarePulseTile;
}) {
  const toneClass =
    tile.tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100"
      : tile.tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
      : tile.tone === "info"
      ? "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100"
      : "border-slate-200 bg-slate-50/70 text-slate-900 hover:bg-white";

  return (
    <Link
      href={tile.href}
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 shadow-[0_10px_22px_-18px_rgba(15,31,53,0.4)] transition-colors ${toneClass}`}
    >
      <div className="text-xl font-bold leading-none tabular-nums">{tile.value}</div>
      <div className="min-w-0">
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-current/70">
          {tile.label}
        </div>
        <div className="truncate text-[10px] text-current/55">
          {tile.valueDetail || tile.context}
        </div>
      </div>
    </Link>
  );
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
