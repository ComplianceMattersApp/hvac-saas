"use client";

import { useRef } from "react";
import { addPublicNoteInPlace } from "@/lib/actions/job-note-actions";
import { IN_PLACE_ACTION_MESSAGES, useInPlaceAction } from "./useInPlaceAction";

type InPlaceSharedNoteFormProps = {
  jobId: string;
  tab: string;
  textareaClassName?: string;
  buttonClassName?: string;
};

/**
 * Shared-note composer that saves without navigating.
 *
 * The redirect path (addPublicNoteFromForm) is untouched and still used
 * elsewhere; this is the piloted in-place surface. Feedback is rendered here
 * rather than via the ?banner= query string, which is what previously required
 * the navigation.
 */
export default function InPlaceSharedNoteForm({
  jobId,
  tab,
  textareaClassName,
  buttonClassName,
}: InPlaceSharedNoteFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const { submitAction, lastResult, pending } = useInPlaceAction(addPublicNoteInPlace, {
    // Clear the textarea only once the server has confirmed the write, so a
    // failed save never silently discards what the tech typed.
    onSuccess: () => formRef.current?.reset(),
  });

  return (
    <form ref={formRef} action={submitAction} className="space-y-3">
      <input type="hidden" name="note_scope" value="shared" />
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="tab" value={tab} />

      <textarea
        name="note"
        rows={3}
        placeholder="Add a shared note..."
        disabled={pending}
        className={`${textareaClassName ?? ""} text-base`}
      />

      {lastResult ? (
        <p
          role="status"
          aria-live="polite"
          className={`text-sm font-medium ${
            lastResult.ok ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {IN_PLACE_ACTION_MESSAGES[lastResult.code] ?? lastResult.code}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={buttonClassName}>
        {pending ? "Adding note..." : "Save shared note"}
      </button>
    </form>
  );
}
