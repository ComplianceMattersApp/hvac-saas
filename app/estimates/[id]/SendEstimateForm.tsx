"use client";

// app/estimates/[id]/SendEstimateForm.tsx
// Compliance Matters: V1H - internal send attempt form.
// When isEmailSendEnabled=false, records a blocked attempt and shows an informational notice.
// No customer approval, PDF, invoice, or delivery confirmation is created.

import { useRef } from "react";

type Props = {
  estimateId: string;
  action: (formData: FormData) => void | Promise<void>;
  isEmailSendEnabled: boolean;
  isMultiOptionProposal?: boolean;
  defaultRecipientEmail?: string | null;
};

export default function SendEstimateForm({
  estimateId,
  action,
  isEmailSendEnabled,
  isMultiOptionProposal = false,
  defaultRecipientEmail,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const emailInput = formRef.current?.elements.namedItem("recipient_email") as HTMLInputElement | null;
    const email = emailInput?.value?.trim() ?? "";
    if (!email) {
      e.preventDefault();
      return;
    }

    const confirmed = window.confirm(
      isEmailSendEnabled
        ? isMultiOptionProposal
          ? `Record a send attempt to ${email}?\n\nThis may attempt provider send when enabled. Accepted by provider is NOT the same as delivered or read. No PDF, customer approval, invoice, conversion, or option selection/approval record is created.`
          : `Record a send attempt to ${email}?\n\nThis may attempt provider send when enabled. Accepted by provider is NOT the same as delivered or read. No PDF, customer approval, invoice, or conversion record is created.`
        : isMultiOptionProposal
          ? `Record a blocked send attempt to ${email}?\n\nEstimate sending is not enabled yet. No email will be sent. This only records the attempt with status "blocked" and does not select or approve any option.`
          : `Record a blocked send attempt to ${email}?\n\nEstimate sending is not enabled yet. No email will be sent. This only records the attempt with status "blocked".`
    );
    if (!confirmed) {
      e.preventDefault();
    }
  }

  return (
    <form ref={formRef} action={action} onSubmit={handleSubmit} className="space-y-3">
      <input type="hidden" name="estimate_id" value={estimateId} />

      {!isEmailSendEnabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Estimate sending is not enabled yet. Submitting this form records a{" "}
          <strong>blocked</strong> attempt - no email or PDF is generated from this action.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="send-recipient-email" className="mb-1 block text-xs font-semibold text-slate-700">
            Recipient email address
          </label>
          <input
            id="send-recipient-email"
            type="email"
            name="recipient_email"
            placeholder="customer@example.com"
            defaultValue={defaultRecipientEmail ?? ""}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-2 text-xs font-semibold text-blue-700 transition-[background-color,border-color,transform] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px] sm:shrink-0"
        >
          Record Send Attempt
        </button>
      </div>

      <p className="text-[11px] text-slate-400">
        {isEmailSendEnabled
          ? isMultiOptionProposal
            ? "Accepted by provider does not mean delivered or read. No lifecycle status change, customer approval, PDF, invoice, conversion, or option selection/approval is created."
            : "Accepted by provider does not mean delivered or read. No lifecycle status change, customer approval, PDF, invoice, or conversion is created."
          : "No email or PDF is generated from this action."}
      </p>

      {defaultRecipientEmail ? (
        <p className="text-[11px] text-slate-500">
          Prefilled from customer email on file. Operators can edit before recording the attempt.
        </p>
      ) : null}
    </form>
  );
}
