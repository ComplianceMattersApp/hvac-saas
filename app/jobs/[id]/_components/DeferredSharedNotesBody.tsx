import { createClient } from "@/lib/supabase/server";

type DeferredSharedNotesBodyProps = {
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

function getEventAttachmentCount(meta?: any) {
  const metadataCount = Number(meta?.attachment_count ?? meta?.count ?? meta?.attachments_count);
  if (Number.isFinite(metadataCount) && metadataCount > 0) {
    return Math.trunc(metadataCount);
  }

  const attachmentIdsCount = Array.isArray(meta?.attachment_ids)
    ? Number(meta.attachment_ids.length)
    : NaN;
  if (Number.isFinite(attachmentIdsCount) && attachmentIdsCount > 0) {
    return Math.trunc(attachmentIdsCount);
  }

  const fileNamesCount = Array.isArray(meta?.file_names)
    ? Number(meta.file_names.length)
    : NaN;
  if (Number.isFinite(fileNamesCount) && fileNamesCount > 0) {
    return Math.trunc(fileNamesCount);
  }

  if (typeof meta?.file_name === "string" && meta.file_name.trim()) {
    return 1;
  }

  return 0;
}

function getEventAttachmentLabel(meta?: any) {
  const count = getEventAttachmentCount(meta);
  return count > 0 ? `${count} attachment${count === 1 ? "" : "s"}` : "";
}

function getEventNoteText(meta?: any) {
  if (!meta) return "";
  return String(meta.note ?? meta.message ?? meta.caption ?? "").trim();
}

function formatSharedHistoryHeading(type?: string | null, meta?: any) {
  const attachmentLabel = getEventAttachmentLabel(meta);

  if (type === "public_note") {
    return attachmentLabel ? "Update shared with contractor" : "Note shared with contractor";
  }
  if (type === "contractor_note") {
    return attachmentLabel ? "Contractor response received" : "Contractor note received";
  }
  if (type === "contractor_correction_submission") {
    return "Correction submission received";
  }

  return String(type ?? "").replaceAll("_", " ");
}

export default async function DeferredSharedNotesBody({
  jobId,
  timelineJobIds,
  hasDirectNarrativeChain,
  emptyStateClassName,
}: DeferredSharedNotesBodyProps) {
  const supabase = await createClient();

  const narrativeScopeJobIds = timelineJobIds.length ? timelineJobIds : [jobId];

  const { data: narrativeWindowEvents, error: narrativeWindowErr } = await supabase
    .from("job_events")
    .select("created_at, event_type, meta")
    .in("job_id", narrativeScopeJobIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (narrativeWindowErr) throw new Error(narrativeWindowErr.message);

  const noteItems = (narrativeWindowEvents ?? []).filter((eventRow: any) =>
    ["contractor_note", "public_note", "contractor_correction_submission"].includes(
      String(eventRow?.event_type ?? ""),
    ),
  );
  if (!noteItems.length) {
    return (
      <div className={emptyStateClassName}>
        {hasDirectNarrativeChain
          ? "No shared notes in this direct retest chain yet."
          : "No shared notes yet."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {noteItems.map((e: any, idx: number) => {
        const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "-";
        const type = String(e?.event_type ?? "");
        const meta = e?.meta ?? {};
        const noteText = getEventNoteText(meta);
        const attachmentLabel = getEventAttachmentLabel(meta);

        return (
          <div key={idx} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs text-slate-500">{when}</div>
              <div className="text-xs font-medium text-slate-500">
                {type === "contractor_note"
                  ? "Contractor"
                  : type === "public_note"
                    ? "Internal (shared)"
                    : type === "contractor_correction_submission"
                      ? "Correction submission"
                      : "Shared"}
              </div>
            </div>

            <div className="mt-2 text-sm font-medium text-slate-950">
              {formatSharedHistoryHeading(type, meta)}
            </div>

            {noteText ? (
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {noteText}
              </div>
            ) : null}

            {attachmentLabel ? (
              <div className="mt-2 inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                {attachmentLabel}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
