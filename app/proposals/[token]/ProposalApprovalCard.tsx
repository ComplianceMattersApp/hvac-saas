"use client";

import { useActionState, useState } from "react";

import {
  approveEstimateFromProposalLinkForm,
  initialProposalApprovalActionState,
  type ProposalApprovalActionState,
} from "./actions";

type PublicProposalOption = {
  slotIndex: number;
  label: string;
  summary: string | null;
  subtotalCents: number;
  totalCents: number;
};

type ProposalApprovalCardProps = {
  token: string;
  proposalMode: "single_option_flat" | "multi_option_packages";
  options: PublicProposalOption[];
};

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function ProposalApprovalCard({ token, proposalMode, options }: ProposalApprovalCardProps) {
  const [state, action, isPending] = useActionState<ProposalApprovalActionState, FormData>(
    approveEstimateFromProposalLinkForm,
    initialProposalApprovalActionState
  );
  const [selectedOptionSlotIndex, setSelectedOptionSlotIndex] = useState<string>("");

  const isMultiOption = proposalMode === "multi_option_packages";
  const canSubmit = !isPending && (!isMultiOption || Boolean(selectedOptionSlotIndex));

  if (state.status === "success") {
    return (
      <section className="rounded-[28px] border border-emerald-200 bg-emerald-50/80 px-6 py-5 text-emerald-950 shadow-[0_22px_60px_-42px_rgba(5,150,105,0.45)] sm:px-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
          Proposal approved
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-emerald-950">
          Thank you for your approval.
        </h2>
        <p className="mt-2 text-sm leading-6 text-emerald-900/90">
          Your response has been recorded. The company will follow up with next steps.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-emerald-200/90 bg-white/97 px-6 py-5 shadow-[0_26px_70px_-46px_rgba(15,23,42,0.36)] sm:px-8">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
        Approval
      </div>
      <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
        Approve this proposal
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Enter your name to confirm approval.
        {isMultiOption ? " Select exactly one option before submitting." : ""}
      </p>

      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="token" value={token} />

        {isMultiOption ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">Select one option</div>
            <div className="grid gap-2">
              {options.map((option) => {
                const selected = selectedOptionSlotIndex === String(option.slotIndex);
                return (
                  <label
                    key={`${option.slotIndex}-${option.label}`}
                    className={`cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
                      selected
                        ? "border-emerald-300 bg-emerald-50/70"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="selected_option_slot_index"
                      value={option.slotIndex}
                      className="sr-only"
                      checked={selected}
                      onChange={(event) => setSelectedOptionSlotIndex(event.target.value)}
                      required
                    />
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">{option.label}</div>
                        {option.summary ? (
                          <div className="mt-1 text-xs leading-5 text-slate-600">{option.summary}</div>
                        ) : null}
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {formatCents(option.totalCents)}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="approver_name" className="block text-xs font-semibold text-slate-700">
            Your name <span className="text-rose-500">*</span>
          </label>
          <input
            id="approver_name"
            name="approver_name"
            required
            maxLength={120}
            autoComplete="name"
            placeholder="Type your full name"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="approval_note" className="block text-xs font-semibold text-slate-700">
            Note <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="approval_note"
            name="approval_note"
            rows={2}
            maxLength={2000}
            placeholder="Optional note for the company"
            className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        {state.status === "error" && state.message ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {state.message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-[background-color,border-color,transform] hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-300"
        >
          {isPending
            ? "Submitting approval..."
            : isMultiOption
              ? "Approve Selected Option"
              : "Approve Proposal"}
        </button>
      </form>
    </section>
  );
}
