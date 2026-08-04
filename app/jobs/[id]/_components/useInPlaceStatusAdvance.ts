"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";

const STATUS_ORDER = ["open", "on_the_way", "in_process", "completed"];

// In-place lifecycle advance shared by the desktop v2 and mobile status buttons.
// No optimistic final state: the UI flips only after the server confirms the
// write (result.ok). Until then the button shows its honest pending label.
// The server's refresh() reconciles the rest of the page in the background;
// `effectiveStatus` bridges the gap between confirmation and that refresh.
export function useInPlaceStatusAdvance(currentStatus: string) {
  const router = useRouter();
  const [confirmedStatus, setConfirmedStatus] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const orderIndex = (status: string) => STATUS_ORDER.indexOf(status);
  const effectiveStatus =
    confirmedStatus && orderIndex(confirmedStatus) > orderIndex(currentStatus)
      ? confirmedStatus
      : currentStatus;

  const submitAction = async (formData: FormData) => {
    const from = effectiveStatus;
    setErrorCode(null);
    formData.set("no_redirect", "1");
    const result = await advanceJobStatusFromForm(formData);
    if (result?.ok) {
      const nextIndex = Math.min(orderIndex(from) + 1, STATUS_ORDER.length - 1);
      setConfirmedStatus(STATUS_ORDER[nextIndex]);
      // Reconcile the rest of the page in the background. The delay matters:
      // a refresh started while the form-action transition is still draining
      // entangles with it and holds useFormStatus.pending (the button's pending
      // label) until the whole background render finishes. 500ms lets the
      // transition settle first; the refresh then runs as its own transition.
      window.setTimeout(() => router.refresh(), 500);
    } else if (result) {
      setErrorCode(result.code);
    }
  };

  return { effectiveStatus, errorCode, submitAction };
}

export const STATUS_ADVANCE_ERROR_MESSAGES: Record<string, string> = {
  schedule_required: "Add a schedule window first, then try again.",
  ecc_test_required: "Complete at least one ECC test before finishing this visit.",
  status_update_failed: "Couldn't update the job status. Please try again.",
};
