import { createClient } from "@/lib/supabase/server";
import { resolveUserDisplayMap } from "@/lib/staffing/human-layer";

import DeferredNarrativeSectionFailure from "./DeferredNarrativeSectionFailure";

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderInlineMentionText(
  text: string,
  taggedDisplayNames: Array<{ id: string; name: string }>,
) {
  const sourceText = String(text ?? "");
  const mentionTokens = Array.from(
    new Set(
      taggedDisplayNames
        .map((entry) => `@${String(entry.name ?? "").trim()}`)
        .filter((value) => value.length > 1),
    ),
  ).sort((a, b) => b.length - a.length);

  if (!mentionTokens.length) return sourceText;

  const tokenSet = new Set(mentionTokens);
  const mentionPattern = new RegExp(`(${mentionTokens.map(escapeRegExp).join("|")})`, "g");

  return sourceText.split(mentionPattern).map((part, index) => {
    if (!tokenSet.has(part)) return part;

    return (
      <span
        key={`${part}-${index}`}
        className="font-semibold text-blue-700 underline decoration-blue-200 decoration-2 underline-offset-4"
      >
        {part}
      </span>
    );
  });
}

export default async function DeferredInternalNotesBody({
  jobId,
  timelineJobIds,
  hasDirectNarrativeChain,
  emptyStateClassName,
}: DeferredInternalNotesBodyProps) {
  try {
    const supabase = await createClient();

    const narrativeScopeJobIds = timelineJobIds.length ? timelineJobIds : [jobId];

    const { data: noteItems, error: narrativeWindowErr } = await supabase
      .from("job_events")
      .select("created_at, meta")
      .eq("event_type", "internal_note")
      .in("job_id", narrativeScopeJobIds)
      .order("created_at", { ascending: false })
      .limit(200);

    if (narrativeWindowErr) {
      throw new Error(narrativeWindowErr.message);
    }

    const taggedUserIds = Array.from(
      new Set((noteItems ?? []).flatMap((eventRow: any) => getTaggedUserIds(eventRow?.meta))),
    );
    const taggedDisplayMap = taggedUserIds.length
      ? await resolveUserDisplayMap({
          supabase,
          userIds: taggedUserIds,
        })
      : {};

    if (!noteItems?.length) {
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
              name:
                String((taggedDisplayMap as Record<string, string>)[id] ?? "").trim() ||
                "Team member",
            }))
            .filter((entry) => Boolean(entry.id && entry.name));

          return (
            <div key={idx} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
              <div className="text-xs text-slate-500">{when}</div>

              {noteText ? (
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                  {renderInlineMentionText(noteText, taggedDisplayNames)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  } catch (error) {
    console.error("DeferredInternalNotesBody failed", error);
    return (
      <DeferredNarrativeSectionFailure message="Internal notes are temporarily unavailable. Core job details remain available. Refresh to try again." />
    );
  }
}
