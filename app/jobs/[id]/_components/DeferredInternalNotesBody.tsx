import { createClient } from "@/lib/supabase/server";

type DeferredInternalNotesBodyProps = {
  jobId: string;
  timelineJobIds: string[];
  hasDirectNarrativeChain: boolean;
  emptyStateClassName: string;
};

function formatDateTimeLAFromIso(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

  return `${date} ${time}`;
}

function getEventNoteText(meta?: any) {
  if (!meta) return "";
  return String(meta.note ?? meta.message ?? meta.caption ?? "").trim();
}

export default async function DeferredInternalNotesBody({
  jobId,
  timelineJobIds,
  hasDirectNarrativeChain,
  emptyStateClassName,
}: DeferredInternalNotesBodyProps) {
  const supabase = await createClient();

  const narrativeScopeJobIds = timelineJobIds.length ? timelineJobIds : [jobId];

  const { data: narrativeWindowEvents, error: narrativeWindowErr } = await supabase
    .from("job_events")
    .select("created_at, event_type, meta")
    .in("job_id", narrativeScopeJobIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (narrativeWindowErr) throw new Error(narrativeWindowErr.message);

  const noteItems = (narrativeWindowEvents ?? []).filter(
    (eventRow: any) => String(eventRow?.event_type ?? "") === "internal_note",
  );
  if (!noteItems.length) {
    return (
      <div className={emptyStateClassName}>
        {hasDirectNarrativeChain
          ? "No internal notes in this direct retest chain yet."
          : "No internal notes yet."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {noteItems.map((e: any, idx: number) => {
        const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "-";
        const meta = e?.meta ?? {};
        const noteText = getEventNoteText(meta);

        return (
          <div key={idx} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
            <div className="text-xs text-slate-500">{when}</div>

            <div className="mt-2 text-sm font-medium text-slate-950">
              Internal note
            </div>

            {noteText ? (
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {noteText}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
