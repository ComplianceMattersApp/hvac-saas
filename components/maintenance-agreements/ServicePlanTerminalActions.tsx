"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ActionResult = { success: true } | { success: false; error: string };

type Props = {
  agreementId: string;
  status: string;
  cancelAction: (formData: FormData) => Promise<ActionResult>;
  deleteAction: (formData: FormData) => Promise<ActionResult>;
};

export default function ServicePlanTerminalActions({
  agreementId,
  status,
  cancelAction,
  deleteAction,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"cancel" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isActive = status === "active" || status === "paused";
  const isDraft = status === "draft";

  if (!isActive && !isDraft) return null;

  function buildFormData() {
    const fd = new FormData();
    fd.set("agreement_id", agreementId);
    return fd;
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const action = confirming === "cancel" ? cancelAction : deleteAction;
      const result = await action(buildFormData());
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error ?? "An error occurred.");
        setConfirming(null);
      }
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
          {error}
        </div>
      ) : null}

      {confirming === "cancel" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-xs text-amber-900">
            Cancel this service plan? This cannot be undone. Any linked jobs will not be affected.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? "Cancelling…" : "Yes, cancel plan"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              disabled={isPending}
              className="text-xs font-semibold text-amber-900 hover:underline disabled:opacity-50"
            >
              Keep plan
            </button>
          </div>
        </div>
      ) : confirming === "delete" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
          <p className="text-xs text-red-900">Delete this draft plan? This cannot be undone.</p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              disabled={isPending}
              className="text-xs font-semibold text-red-900 hover:underline disabled:opacity-50"
            >
              Keep draft
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 pt-1">
          {isActive ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirming("cancel");
              }}
              className="text-xs font-medium text-slate-500 hover:text-red-600 hover:underline"
            >
              Cancel plan
            </button>
          ) : null}
          {isDraft ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirming("delete");
              }}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Delete draft
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
