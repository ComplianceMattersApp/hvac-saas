type MobileJobTeamNotesPanelProps = Record<string, any>;

export default function MobileJobTeamNotesPanel(props: MobileJobTeamNotesPanelProps) {
  const {
    DeferredInternalNoteMentionComposer,
    DeferredInternalNotesBody,
    FlashBanner,
    internalNoteBannerMessage,
    internalNoteBannerType,
    internalNotesMeta,
    internalUser,
    job,
    LockIcon,
    NarrativeNotesBodyFallback,
    narrativeScopeJobIds,
    hasDirectNarrativeChain,
    secondaryButtonClass,
    Suspense,
    tab,
    workspaceEmptyStateClass,
    workspaceInputClass,
    workspaceTextareaClass,
  } = props;
  const presentation = props.presentation ?? "current";

  const notesBody = (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      {internalNoteBannerMessage ? (
        <FlashBanner
          type={internalNoteBannerType as "success" | "warning" | "error"}
          message={internalNoteBannerMessage}
        />
      ) : null}
      <Suspense fallback={<div className="h-12 animate-pulse rounded-xl bg-slate-100" />}>
        <DeferredInternalNoteMentionComposer
          jobId={String(job.id)}
          tab={tab}
          accountOwnerUserId={internalUser.account_owner_user_id}
          textareaClassName={`${workspaceTextareaClass} text-base`}
          selectClassName={workspaceInputClass}
          helperTextClassName="text-sm leading-5 text-slate-500"
          buttonClassName={secondaryButtonClass}
          returnAnchor="mobile-internal-notes"
        />
      </Suspense>
      <Suspense fallback={<NarrativeNotesBodyFallback />}>
        <DeferredInternalNotesBody
          jobId={String(job.id)}
          timelineJobIds={narrativeScopeJobIds}
          hasDirectNarrativeChain={hasDirectNarrativeChain}
          emptyStateClassName={workspaceEmptyStateClass}
        />
      </Suspense>
    </div>
  );

  if (presentation === "v2TargetPanel") {
    return (
      <section
        id="mobile-internal-notes"
        className="hidden scroll-mt-4 rounded-2xl border border-slate-200/90 bg-white px-3.5 py-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.3)] target:block min-[390px]:px-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex min-w-0 items-center gap-2 text-base font-semibold text-slate-950">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-slate-200">
              <LockIcon className="h-4 w-4" />
            </span>
            <span>Team Notes</span>
          </div>
          <a
            href="#mobile-team-notes-row"
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
          >
            Close
          </a>
        </div>
        <div className="mt-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {internalNotesMeta || "Team only"}
        </div>
        {notesBody}
      </section>
    );
  }

  return (
    <details
      id="mobile-internal-notes"
      className="rounded-xl border border-slate-200/80 bg-slate-50/75 px-3 py-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.22)]"
      open={Boolean(internalNoteBannerMessage)}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200">
              <LockIcon className="h-3.5 w-3.5" />
            </span>
            <span>Internal Notes</span>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
            {internalNotesMeta || "Team only"}
          </div>
        </div>
      </summary>
      {notesBody}
    </details>
  );
}
