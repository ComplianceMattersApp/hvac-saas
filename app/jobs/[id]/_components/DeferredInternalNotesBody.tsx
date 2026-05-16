import { createClient } from "@/lib/supabase/server";
import { resolveUserDisplayMap } from "@/lib/staffing/human-layer";

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

function getTaggedUserIds(meta?: any): string[] {
  if (!meta || !Array.isArray(meta.tagged_user_ids)) return [];
  return meta.tagged_user_ids
    .map((value: unknown) => String(value ?? "").trim())
    .filter(Boolean);
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

  const taggedUserIds = Array.from(
    new Set(noteItems.flatMap((eventRow: any) => getTaggedUserIds(eventRow?.meta))),
  );
  const taggedDisplayMap = taggedUserIds.length
    ? await resolveUserDisplayMap({
        supabase,
        userIds: taggedUserIds,
      })
    : {};

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
        const taggedDisplayNames = getTaggedUserIds(meta)
          .map((id) => ({
            id,
            name: String((taggedDisplayMap as Record<string, string>)[id] ?? "").trim() || "Team member",
          }))
          .filter((entry) => Boolean(entry.id && entry.name));

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

            {taggedDisplayNames.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-medium uppercase tracking-[0.08em] text-slate-500">Mentioned</span>
                {taggedDisplayNames.map((entry) => (
                  <span
                    key={entry.id}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700"
                  >
                    @{entry.name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
