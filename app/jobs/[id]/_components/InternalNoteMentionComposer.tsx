"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { InternalNoteMentionCandidate } from "@/lib/notifications/internal-note-mentions";
import {
  findActiveMentionToken,
  insertMentionAtCaret,
  removeMentionFromText,
} from "@/lib/notifications/internal-note-mentions";
import SubmitButton from "@/components/SubmitButton";

type InternalNoteMentionComposerProps = {
  action: (formData: FormData) => void | Promise<void>;
  jobId: string;
  tab: string;
  candidates: InternalNoteMentionCandidate[];
  textareaClassName: string;
  selectClassName: string;
  helperTextClassName: string;
  buttonClassName: string;
};

function normalize(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

export default function InternalNoteMentionComposer({
  action,
  jobId,
  tab,
  candidates,
  textareaClassName,
  selectClassName,
  helperTextClassName,
  buttonClassName,
}: InternalNoteMentionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [note, setNote] = useState("");
  const [caretPosition, setCaretPosition] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState<InternalNoteMentionCandidate[]>([]);

  const activeToken = findActiveMentionToken(note, caretPosition);
  const suggestionQuery = normalize(activeToken?.query ?? "");
  const selectedIds = useMemo(() => new Set(selectedMentions.map((item) => item.user_id)), [selectedMentions]);
  const suggestionCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      if (selectedIds.has(candidate.user_id)) return false;
      if (!suggestionQuery) return true;
      return normalize(candidate.display_name).includes(suggestionQuery);
    });
  }, [candidates, selectedIds, suggestionQuery]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.setSelectionRange(caretPosition, caretPosition);
  }, [caretPosition, note]);

  function updateCaretPosition(value?: HTMLTextAreaElement | null) {
    const nextCaret = value?.selectionStart ?? value?.value.length ?? 0;
    setCaretPosition(nextCaret);
  }

  function handleNoteChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setNote(event.target.value);
    updateCaretPosition(event.target);
  }

  function handleCandidateSelect(candidate: InternalNoteMentionCandidate) {
    if (selectedIds.has(candidate.user_id)) return;

    const next = insertMentionAtCaret({
      text: note,
      caretPosition,
      displayName: candidate.display_name,
    });

    setNote(next.text);
    setCaretPosition(next.caretPosition);
    setSelectedMentions((current) => {
      if (current.some((item) => item.user_id === candidate.user_id)) return current;
      return [...current, candidate];
    });

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretPosition, next.caretPosition);
    });
  }

  function handleMentionRemove(candidate: InternalNoteMentionCandidate) {
    setSelectedMentions((current) => current.filter((item) => item.user_id !== candidate.user_id));
    setNote((current) => removeMentionFromText({ text: current, displayName: candidate.display_name }));
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="tab" value={tab} />
      <textarea
        ref={textareaRef}
        name="note"
        rows={3}
        placeholder="Add an internal note visible only to your team..."
        className={textareaClassName}
        value={note}
        onChange={handleNoteChange}
        onSelect={(event) => updateCaretPosition(event.currentTarget)}
        onKeyUp={(event) => updateCaretPosition(event.currentTarget)}
        onClick={(event) => updateCaretPosition(event.currentTarget)}
      />

      {selectedMentions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedMentions.map((candidate) => (
            <span
              key={candidate.user_id}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              <span>@{candidate.display_name}</span>
              <button
                type="button"
                onClick={() => handleMentionRemove(candidate)}
                className="rounded-full px-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label={`Remove ${candidate.display_name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Mention teammates with @name
        </label>

        {activeToken ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-950/10">
            <div className="max-h-56 overflow-auto py-1">
              {suggestionCandidates.length > 0 ? (
                suggestionCandidates.map((candidate) => (
                  <button
                    key={candidate.user_id}
                    type="button"
                    onClick={() => handleCandidateSelect(candidate)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  >
                    <span className="font-medium text-slate-900">@{candidate.display_name}</span>
                    <span className="text-xs text-slate-400">Tag</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-slate-500">No matching teammates.</div>
              )}
            </div>
          </div>
        ) : null}

        <p className={helperTextClassName}>
          Type @ to mention active teammates. Selected mentions are saved separately and turned into internal alerts after the note is posted.
        </p>
      </div>

      <div className="space-y-2">
        {selectedMentions.map((candidate) => (
          <input key={candidate.user_id} type="hidden" name="tagged_user_ids" value={candidate.user_id} />
        ))}

        <noscript>
          <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
              Fallback tag picker
            </div>
            <select name="tagged_user_ids" multiple className={`${selectClassName} min-h-[7rem]`}>
              {candidates.map((candidate) => (
                <option key={candidate.user_id} value={candidate.user_id}>
                  {candidate.display_name}
                </option>
              ))}
            </select>
          </div>
        </noscript>

        <div className="flex justify-end">
          <SubmitButton loadingText="Adding note..." className={buttonClassName}>
            Save internal note
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
