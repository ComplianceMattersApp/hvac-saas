import { createClient } from "@/lib/supabase/server";
import { resolveUserDisplayMap } from "@/lib/staffing/human-layer";
import { formatTimestampDateTimeDisplayLA } from "@/lib/utils/schedule-la";

import DeferredNarrativeSectionFailure from "./DeferredNarrativeSectionFailure";

type DeferredInternalNotesBodyProps = {
  jobId: string;
  timelineJobIds: string[];
  hasDirectNarrativeChain: boolean;
  emptyStateClassName: string;
  /** Which event types to fetch. Defaults to ["internal_note"] to preserve V1 behaviour. */
  noteEventTypes?: string[];
};

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

type AudienceChipStyle = {
  label: string;
  bg: string;
  color: string;
};

function resolveAudienceChip(eventType: string): AudienceChipStyle {
  // contractor_note is shared visibility — authored by a contractor, visible to all parties
  if (eventType === "public_note" || eventType === "contractor_note") {
    return { label: "SHARED", bg: "oklch(0.95 0.04 150)", color: "oklch(0.42 0.13 150)" };
  }
  // internal_note and any other types
  return { label: "INTERNAL", bg: "oklch(0.94 0.03 255)", color: "oklch(0.45 0.13 255)" };
}

export default async function DeferredInternalNotesBody({
  jobId,
  timelineJobIds,
  hasDirectNarrativeChain,
  emptyStateClassName,
  noteEventTypes = ["internal_note"],
}: DeferredInternalNotesBodyProps) {
  try {
    const supabase = await createClient();

    const narrativeScopeJobIds = timelineJobIds.length ? timelineJobIds : [jobId];

    const { data: noteItems, error: narrativeWindowErr } = await supabase
      .from("job_events")
      .select("event_type, created_at, meta")
      .in("event_type", noteEventTypes)
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
            ? "No notes in this direct retest chain yet."
            : "No notes yet."}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {noteItems.map((e: any, idx: number) => {
          const when = e?.created_at ? formatTimestampDateTimeDisplayLA(String(e.created_at)) : "-";
          const meta = e?.meta ?? {};
          const noteText = getEventNoteText(meta);
          const eventType = String(e?.event_type ?? "internal_note");
          const chip = resolveAudienceChip(eventType);
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
                <div
                  style={{
                    marginTop: "8px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-ibm-plex-mono), monospace",
                      fontSize: "9px",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      padding: "3px 7px",
                      borderRadius: "4px",
                      background: chip.bg,
                      color: chip.color,
                      flexShrink: 0,
                      marginTop: "3px",
                    }}
                  >
                    {chip.label}
                  </span>
                  <div className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                    {renderInlineMentionText(noteText, taggedDisplayNames)}
                  </div>
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
      <DeferredNarrativeSectionFailure message="Notes are temporarily unavailable. Core job details remain available. Refresh to try again." />
    );
  }
}
