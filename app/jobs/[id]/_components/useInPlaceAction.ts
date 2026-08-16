"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type InPlaceResult = { ok: boolean; code: string };

/**
 * Shared plumbing for submitting a server action without a page navigation.
 *
 * Generalised from useInPlaceStatusAdvance, which established the contract:
 * the action takes `no_redirect=1`, skips its own revalidatePath, and returns
 * `{ ok, code }` instead of redirecting. The client shows the result and
 * reconciles the rest of the page with a background refresh.
 *
 * Two behaviours are deliberate and worth preserving if this is copied:
 *
 * 1. No optimistic success. `lastResult` is only set once the server confirms.
 *    A note that failed to save must never look saved.
 * 2. The refresh is delayed. A refresh started while the form-action transition
 *    is still draining entangles with it and holds useFormStatus.pending — so
 *    the submit button keeps its pending label until the whole background
 *    render finishes, which is the exact sluggishness this is meant to remove.
 */
export function useInPlaceAction(
  action: (formData: FormData) => Promise<InPlaceResult>,
  options?: { refreshDelayMs?: number; onSuccess?: (result: InPlaceResult) => void },
) {
  const router = useRouter();
  const [lastResult, setLastResult] = useState<InPlaceResult | null>(null);
  const [pending, setPending] = useState(false);

  const refreshDelayMs = options?.refreshDelayMs ?? 500;

  const submitAction = async (formData: FormData) => {
    setPending(true);
    setLastResult(null);
    try {
      const result = await action(formData);
      setLastResult(result ?? null);
      if (result?.ok) {
        options?.onSuccess?.(result);
        window.setTimeout(() => router.refresh(), refreshDelayMs);
      }
    } catch {
      // A thrown action is an unexpected failure rather than a refusal. Surface
      // it in the same shape so callers have one thing to render.
      setLastResult({ ok: false, code: "action_failed" });
    } finally {
      setPending(false);
    }
  };

  return { submitAction, lastResult, pending, clearResult: () => setLastResult(null) };
}

/** Copy for the codes the piloted job detail actions can return. */
export const IN_PLACE_ACTION_MESSAGES: Record<string, string> = {
  note_added: "Note added.",
  follow_up_note_added: "Follow-up note added.",
  schedule_saved: "Schedule saved.",
  schedule_already_saved: "That schedule was already saved.",
  schedule_date_required: "Pick a date before saving.",
  schedule_window_invalid: "That time window isn't valid.",
  schedule_update_failed: "Couldn't save the schedule. Please try again.",
  active_reschedule_confirmation_required:
    "This visit is already active — confirm the reschedule to continue.",
  not_authorized: "You don't have access to change this job.",
  action_failed: "Something went wrong. Please try again.",
};
