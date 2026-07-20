import Link from "next/link";
import { redirect } from "next/navigation";
import {
  firstJobMissionSteps,
  roleTrainingTracks,
  type RoleTrainingTrack,
  type TrainingLink,
} from "@/lib/training/training-room-content";
import {
  orderTracksForTrainingVisibility,
  resolveTrainingRoomVisibility,
} from "@/lib/training/training-room-visibility";
import { canViewFinancialRegister, isStructuralAccountOwner } from "@/lib/auth/financial-access";
import {
  hasFieldPaymentCollectionAccess,
  resolveFieldBillingCapabilities,
} from "@/lib/auth/field-billing-access";
import {
  landingPathForDualContextAccess,
  resolveDualContextAccess,
} from "@/lib/auth/dual-context-access";
import { resolveProductModeForAccountOwnerId } from "@/lib/business/product-mode-defaults";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Training Room",
  description: "Static workflow missions for learning daily operating rhythms.",
};

const pageClass = "mx-auto max-w-6xl space-y-6 p-4 text-gray-900 sm:p-6";
const panelClass =
  "rounded-lg border border-slate-200 bg-white p-5 shadow-[0_18px_42px_-32px_rgba(15,23,42,0.28)] sm:p-6";
const eyebrowClass = "text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80";
const primaryLinkClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.5)] transition-[background-color,transform] hover:bg-slate-800 active:translate-y-[0.5px]";
const secondaryLinkClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-[background-color,border-color,transform] hover:border-slate-400 hover:bg-slate-50 active:translate-y-[0.5px]";

function LinkPills({ links }: { links: TrainingLink[] }) {
  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={`${link.label}:${link.href}`}
          href={link.href}
          className="inline-flex min-h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

function FocusList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</div>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-slate-700">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoleTrackDetails({
  track,
  defaultOpen = false,
  emphasis = "secondary",
}: {
  track: RoleTrainingTrack;
  defaultOpen?: boolean;
  emphasis?: "primary" | "secondary";
}) {
  const containerClass =
    emphasis === "primary"
      ? "group rounded-lg border border-blue-200 bg-blue-50/60 p-4"
      : "group rounded-lg border border-slate-200 bg-slate-50/80 p-4";

  return (
    <details className={containerClass} open={defaultOpen}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={eyebrowClass}>Your role today</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">{track.title}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{track.summary}</p>
          </div>
          <span className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 group-open:hidden">
            Open track
          </span>
          <span className="hidden min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 group-open:inline-flex">
            Close track
          </span>
        </div>
      </summary>

      <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Missions</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {track.missions.map((mission) => (
              <span key={mission} className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                {mission}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <FocusList title="What you do" items={track.whatYouDo} />
          <FocusList title="What to understand" items={track.whatToUnderstand} />
          <FocusList title="Not your responsibility" items={track.notYourResponsibility} />
        </div>

        <LinkPills links={track.links} />
      </div>
    </details>
  );
}

export default async function TrainingRoomPage() {
  const supabase = await createClient();
  const access = await resolveDualContextAccess({
    supabase,
    getPortalAdmin: createAdminClient,
  });

  if (!access.user) redirect("/login");
  if (!access.hasActiveAppAccess) redirect(landingPathForDualContextAccess(access));
  if (access.preferredLandingContext === "portal" && !access.internalUser) redirect("/portal");
  if (!access.internalUser) redirect("/login");

  const scopedInternalUser = {
    user_id: access.internalUser.userId,
    role: access.internalUser.role,
    is_active: access.internalUser.isActive,
    account_owner_user_id: access.internalUser.accountOwnerUserId,
  };
  const productMode = await resolveProductModeForAccountOwnerId({
    supabase,
    accountOwnerUserId: access.internalUser.accountOwnerUserId,
  });
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: access.user.id,
    internalUser: scopedInternalUser,
  });
  const visibility = resolveTrainingRoomVisibility({
    internalRole: access.internalUser.role,
    isAccountOwner: isStructuralAccountOwner({
      actorUserId: access.user.id,
      internalUser: scopedInternalUser,
    }),
    productMode,
    canViewFinancialRegister: canViewFinancialRegister({
      actorUserId: access.user.id,
      internalUser: scopedInternalUser,
    }),
    canCollectFieldPayment: hasFieldPaymentCollectionAccess(fieldBillingCapabilities),
  });
  const primaryTracks = orderTracksForTrainingVisibility(roleTrainingTracks, visibility.primaryTrackIds);
  const crossTrainingTracks = orderTracksForTrainingVisibility(roleTrainingTracks, visibility.crossTrainingTrackIds);

  return (
    <div className={pageClass}>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_58%,rgba(219,234,254,0.55))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className={eyebrowClass}>Training & Reference</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              Training Room
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Learn the daily rhythms for your role without taking on someone else's responsibilities.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
                Static missions
              </span>
              <span className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
                No progress tracking yet
              </span>
              <span className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
                {visibility.audienceLabel}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/ops/admin" className={secondaryLinkClass}>
              Admin Center
            </Link>
            <Link href="/today" className={primaryLinkClass}>
              Open Today
            </Link>
          </div>
        </div>
      </section>

      <section className={panelClass}>
        <div className={eyebrowClass}>Start here</div>
        <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">
              Run Your First Job
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Create one real customer, run one real job, finish the outcome, invoice it, and review tomorrow's work.
            </p>
          </div>
          <Link href="/jobs/new" className={primaryLinkClass}>
            Start job intake
          </Link>
        </div>

        <div className="mt-5 grid gap-3">
          {firstJobMissionSteps.map((step, index) => (
            <div key={step.step} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500">Step {index + 1}</div>
                  <h3 className="mt-1 text-base font-semibold text-slate-950">{step.step}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
                  {step.whereThisHappens ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      <span className="font-semibold text-slate-800">Where this happens:</span>{" "}
                      {step.whereThisHappens}
                    </p>
                  ) : null}
                  {step.note ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      <span className="font-semibold text-slate-800">Note:</span> {step.note}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {step.responsibility}
                  </p>
                </div>
                <LinkPills links={step.hrefs} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={panelClass}>
        <div className={eyebrowClass}>{visibility.audienceLabel}</div>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">
          {visibility.primaryHeading}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {visibility.primaryDescription}
        </p>

        {primaryTracks.length > 0 ? (
          <div className="mt-5 space-y-3">
            {primaryTracks.map((track, index) => (
              <RoleTrackDetails key={track.id} track={track} defaultOpen={index === 0} emphasis="primary" />
            ))}
          </div>
        ) : null}

        <details className="group mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4" open={visibility.showRoleSelector}>
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Available if you help with this
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  Cross-training is here for coverage and shared understanding, but it is not your default responsibility.
                </p>
              </div>
              <span className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 group-open:hidden">
                Show tracks
              </span>
              <span className="hidden min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 group-open:inline-flex">
                Hide tracks
              </span>
            </div>
          </summary>
          <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            {crossTrainingTracks.map((track) => (
              <RoleTrackDetails key={track.id} track={track} />
            ))}
          </div>
        </details>
      </section>

    </div>
  );
}
