"use client";

import { useActionState, useMemo, useState } from "react";
import {
  submitEstimateProposalLinkActionFromForm,
} from "./actions";
import {
  initialEstimateProposalLinkActionState,
  type EstimateProposalLinkActionState,
} from "./proposal-link-action-state";

type ProposalLinkControlsProps = {
  estimateId: string;
  activeLink: {
    proposalLinkId: string;
    expiresAt: string;
    recipientEmailSnapshot: string | null;
  } | null;
  schemaUnavailable: boolean;
};

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function ProposalLinkControls(props: ProposalLinkControlsProps) {
  const [state, formAction, isPending] = useActionState<EstimateProposalLinkActionState, FormData>(
    submitEstimateProposalLinkActionFromForm,
    {
      ...initialEstimateProposalLinkActionState,
      hasActiveLink: Boolean(props.activeLink?.proposalLinkId),
      expiresAt: props.activeLink?.expiresAt ?? null,
      schemaUnavailable: props.schemaUnavailable,
    }
  );
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const hasActiveLink = state.hasActiveLink;
  const expiresAt = state.expiresAt ?? props.activeLink?.expiresAt ?? null;
  const schemaUnavailable = state.schemaUnavailable || props.schemaUnavailable;

  const proposalUrl = useMemo(() => {
    if (!state.copyToken) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/proposals/${state.copyToken}`;
  }, [state.copyToken]);

  async function copyProposalUrl() {
    if (!proposalUrl) {
      setCopyStatus("Regenerate link to copy a fresh link.");
      return;
    }

    try {
      await navigator.clipboard.writeText(proposalUrl);
      setCopyStatus("Link copied.");
    } catch {
      setCopyStatus("Unable to copy link in this browser.");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.14)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Customer Proposal Link
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-950">Public Approval Link</h2>
          <p className="mt-1 text-sm text-slate-600">
            Issue and manage a public proposal link for customer approval.
          </p>
        </div>
        {hasActiveLink ? (
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
            No active link
          </span>
        )}
      </div>

      {schemaUnavailable ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          Proposal link setup is unavailable in this environment.
        </div>
      ) : (
        <>
          {hasActiveLink ? (
            <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-sm text-slate-700">
                <span className="font-medium text-slate-900">Expires:</span> {formatDateTime(expiresAt)}
              </div>

              {proposalUrl ? (
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Proposal URL
                  </label>
                  <input
                    readOnly
                    value={proposalUrl}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-600">Regenerate link to copy a fresh link.</p>
              )}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {!hasActiveLink ? (
              <form action={formAction}>
                <input type="hidden" name="intent" value="issue" />
                <input type="hidden" name="estimate_id" value={props.estimateId} />
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Creating..." : "Create Proposal Link"}
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={copyProposalUrl}
                  disabled={isPending || !proposalUrl}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Copy Link
                </button>
                <form action={formAction}>
                  <input type="hidden" name="intent" value="regenerate" />
                  <input type="hidden" name="estimate_id" value={props.estimateId} />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending ? "Updating..." : "Regenerate Link"}
                  </button>
                </form>
                <form action={formAction}>
                  <input type="hidden" name="intent" value="revoke" />
                  <input type="hidden" name="estimate_id" value={props.estimateId} />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-[background-color,border-color,transform] hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Revoke Link
                  </button>
                </form>
              </>
            )}
          </div>

          {(state.message || copyStatus) && (
            <p
              className={`mt-3 text-sm ${state.status === "error" ? "text-rose-700" : "text-slate-600"}`}
              role="status"
            >
              {copyStatus ?? state.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
