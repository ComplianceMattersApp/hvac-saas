"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { submitFinalizeAndSendProposalActionFromForm } from "./actions";
import { initialFinalizeAndSendProposalActionState } from "./finalize-send-action-state";

export default function FinalizeAndSendProposalForm(props: {
  estimateId: string;
  defaultRecipientEmail: string | null;
}) {
  const router = useRouter();
  const [recipientEmail, setRecipientEmail] = useState(props.defaultRecipientEmail ?? "");
  const [state, action, isPending] = useActionState(
    submitFinalizeAndSendProposalActionFromForm,
    initialFinalizeAndSendProposalActionState,
  );

  const resultMessage = state.success
    ? state.deliveryMode === "preview"
      ? "Proposal finalized and email preview generated."
      : "Proposal finalized and emailed successfully."
    : state.finalized
      ? "Proposal finalized, but the email was not sent. Use the Customer Delivery panel to retry or copy the secure link."
      : state.error;

  useEffect(() => {
    if (!state.finalized) return;
    const notice = state.success
      ? "proposal_finalized_email_sent"
      : "proposal_finalized_email_retry_needed";
    router.replace(`/estimates/${props.estimateId}?notice=${notice}`);
  }, [props.estimateId, router, state.finalized, state.success]);

  return (
    <form
      action={action}
      className="w-full space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.3)] sm:max-w-md"
      onSubmit={(event) => {
        if (!window.confirm(`Finalize this proposal and email it to ${recipientEmail.trim()}? Editing will be locked.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="estimate_id" value={props.estimateId} />
      <div>
        <label htmlFor={`finalize-send-recipient-${props.estimateId}`} className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Customer email
        </label>
        <input
          id={`finalize-send-recipient-${props.estimateId}`}
          name="recipient_email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={recipientEmail}
          onChange={(event) => setRecipientEmail(event.currentTarget.value)}
          placeholder="customer@example.com"
          className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        {isPending ? "Finalizing and sending..." : "Finalize & Send Proposal"}
      </button>
      <p className="text-xs leading-5 text-slate-500">
        This locks estimate editing, creates a secure proposal link, and emails it to the customer.
      </p>
      {resultMessage ? (
        <p className={`text-sm ${state.success ? "text-emerald-700" : state.finalized ? "text-amber-700" : "text-red-700"}`} role="status">
          {resultMessage}
        </p>
      ) : null}
    </form>
  );
}
