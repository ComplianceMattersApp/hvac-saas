"use client";

import { useActionState, useMemo, useState } from "react";
import { submitEstimateProposalEmailActionFromForm } from "./actions";
import {
  initialProposalEmailActionState,
  type ProposalEmailActionState,
} from "./proposal-email-action-state";
import { resolveProposalEmailNotice } from "./proposal-email-ui";

type ProposalEmailControlsProps = {
  estimateId: string;
  defaultRecipientEmail: string | null;
};

export default function ProposalEmailControls(props: ProposalEmailControlsProps) {
  const [recipientEmail, setRecipientEmail] = useState(props.defaultRecipientEmail ?? "");
  const [state, formAction, isPending] = useActionState<ProposalEmailActionState, FormData>(
    submitEstimateProposalEmailActionFromForm,
    initialProposalEmailActionState
  );

  const notice = useMemo(() => resolveProposalEmailNotice(state), [state]);

  return (
    <section className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.14)]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Email Proposal
        </p>
        <h2 className="mt-1 text-base font-semibold text-slate-950">Email Proposal</h2>
        <p className="mt-1 text-sm text-slate-600">
          Send the customer a secure link to review and approve this proposal.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Email delivery must be enabled before messages are sent.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          You can still copy the proposal link and share it manually.
        </p>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
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

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Sending..." : "Send Proposal Email"}
          </button>
        </div>
      </form>

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
    </section>
  );
}