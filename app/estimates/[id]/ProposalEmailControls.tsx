"use client";

import { useActionState, useMemo, useState } from "react";
import {
  submitEstimateProposalEmailActionFromForm,
  submitEstimateProposalLinkActionFromForm,
} from "./actions";
import {
  initialProposalEmailActionState,
  type ProposalEmailActionState,
} from "./proposal-email-action-state";
import {
  initialEstimateProposalLinkActionState,
  type EstimateProposalLinkActionState,
} from "./proposal-link-action-state";
import {
  canRenderProposalEmailControls,
  resolveDevEmailPreviewUrl,
  resolveCopyableProposalUrl,
  resolveProposalEmailNotice,
} from "./proposal-email-ui";

type ProposalEmailControlsProps = {
  estimateId: string;
  defaultRecipientEmail: string | null;
  estimateStatus: string;
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

export default function ProposalEmailControls(props: ProposalEmailControlsProps) {
  if (!canRenderProposalEmailControls(props.estimateStatus)) {
    return null;
  }

  const [recipientEmail, setRecipientEmail] = useState(props.defaultRecipientEmail ?? "");
  const [state, formAction, isPending] = useActionState<ProposalEmailActionState, FormData>(
    submitEstimateProposalEmailActionFromForm,
    initialProposalEmailActionState
  );
  const [linkState, linkFormAction, isLinkPending] = useActionState<
    EstimateProposalLinkActionState,
    FormData
  >(submitEstimateProposalLinkActionFromForm, {
    ...initialEstimateProposalLinkActionState,
    hasActiveLink: Boolean(props.activeLink?.proposalLinkId),
    expiresAt: props.activeLink?.expiresAt ?? null,
    schemaUnavailable: props.schemaUnavailable,
  });
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const hasActiveLink = linkState.hasActiveLink;
  const expiresAt = linkState.expiresAt ?? props.activeLink?.expiresAt ?? null;
  const schemaUnavailable = linkState.schemaUnavailable || props.schemaUnavailable;

  const linkUrlFromToken = useMemo(() => {
    if (!linkState.copyToken) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/proposals/${linkState.copyToken}`;
  }, [linkState.copyToken]);

  const proposalUrl = resolveCopyableProposalUrl(state.proposalUrl) ??
    resolveCopyableProposalUrl(linkUrlFromToken);
  const emailPreviewUrl = resolveDevEmailPreviewUrl(state.emailPreviewUrl);

  const notice = useMemo(
    () => resolveProposalEmailNotice(state, { isPending }),
    [state, isPending]
  );

  async function copyProposalUrl() {
    if (!proposalUrl) {
      setCopyStatus("No copyable link is available yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(proposalUrl);
      setCopyStatus("Link copied.");
    } catch {
      setCopyStatus("Unable to copy link in this browser.");
    }
  }

  const secondaryStatus = copyStatus ?? (!isLinkPending ? linkState.message : null);

  return (
    <section className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.14)]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Customer Delivery
        </p>
        <h2 className="mt-1 text-base font-semibold text-slate-950">Customer Delivery</h2>
        <p className="mt-1 text-sm text-slate-600">
          Send this proposal to the customer for online review and approval.
        </p>
      </div>

      <form action={formAction} className="mt-4 space-y-3" onSubmit={() => setCopyStatus(null)}>
        <input type="hidden" name="estimate_id" value={props.estimateId} />

        <div className="space-y-1.5">
          <label
            htmlFor={`proposal-email-recipient-${props.estimateId}`}
            className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            Recipient Email
          </label>
          <input
            id={`proposal-email-recipient-${props.estimateId}`}
            name="recipient_email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.currentTarget.value)}
            placeholder="customer@example.com"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={isPending || isLinkPending}
            className="inline-flex items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Sending..." : "Send Proposal Email"}
          </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyProposalUrl}
            disabled={isPending || isLinkPending || !proposalUrl}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Copy Proposal Link
          </button>

          <form action={linkFormAction} onSubmit={() => setCopyStatus(null)}>
            <input type="hidden" name="intent" value="regenerate" />
            <input type="hidden" name="estimate_id" value={props.estimateId} />
            <button
              type="submit"
              disabled={isPending || isLinkPending || schemaUnavailable}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLinkPending ? "Updating..." : "Regenerate Link"}
            </button>
          </form>

          {hasActiveLink ? (
            <form action={linkFormAction} onSubmit={() => setCopyStatus(null)}>
              <input type="hidden" name="intent" value="revoke" />
              <input type="hidden" name="estimate_id" value={props.estimateId} />
              <button
                type="submit"
                disabled={isPending || isLinkPending || schemaUnavailable}
                className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-[background-color,border-color,transform] hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Revoke Link
              </button>
            </form>
          ) : null}
      </div>

      {proposalUrl ? (
        <div className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Proposal URL</p>
          <input
            readOnly
            value={proposalUrl}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
          />
        </div>
      ) : null}

      {hasActiveLink ? (
        <p className="mt-2 text-xs text-slate-500">Active link expires {formatDateTime(expiresAt)}.</p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          No active link yet. Sending proposal email creates one automatically.
        </p>
      )}

      {schemaUnavailable ? (
        <p className="mt-3 text-sm text-amber-700" role="status">
          Proposal link setup is unavailable in this environment.
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className={`mt-3 text-sm ${
            notice.tone === "success"
              ? "text-emerald-700"
              : notice.tone === "warning"
                ? "text-amber-700"
                : "text-rose-700"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      {state.success && state.attemptStatus === "accepted" && state.deliveryMode === "preview" && emailPreviewUrl ? (
        <div className="mt-2">
          <a
            href={emailPreviewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-[background-color,border-color,transform] hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 active:translate-y-[0.5px]"
          >
            Open Email Preview
          </a>
        </div>
      ) : null}

      {secondaryStatus ? (
        <p className="mt-2 text-sm text-slate-600" role="status">
          {secondaryStatus}
        </p>
      ) : null}
    </section>
  );
}