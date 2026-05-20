"use client";

import { useActionState, useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import {
  INITIAL_TENANT_INVOICE_CHECKOUT_SESSION_ACTION_STATE,
  type TenantInvoiceCheckoutSessionActionState,
} from "@/lib/actions/internal-invoice-payment-actions-state";
import { createTenantInvoiceCheckoutSessionFromFormState } from "@/lib/actions/internal-invoice-payment-actions";

type TenantInvoicePaymentLinkPanelProps = {
  jobId: string;
  invoiceId: string;
  returnTo: string;
  balanceDueDisplay: string;
  initialCheckoutSessionId?: string | null;
  initialCheckoutSessionUrl?: string | null;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow,background-color] focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 [color-scheme:light]";
const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]";
const darkButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.55)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_16px_30px_-22px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px]";

function buildInitialState(
  initialCheckoutSessionId?: string | null,
  initialCheckoutSessionUrl?: string | null,
): TenantInvoiceCheckoutSessionActionState {
  const checkoutSessionId = String(initialCheckoutSessionId ?? "").trim() || null;
  const checkoutSessionUrl = String(initialCheckoutSessionUrl ?? "").trim() || null;

  if (!checkoutSessionId && !checkoutSessionUrl) {
    return INITIAL_TENANT_INVOICE_CHECKOUT_SESSION_ACTION_STATE;
  }

  return {
    status: "success",
    message: "Customer payment link created.",
    checkoutSessionId,
    checkoutSessionUrl,
  };
}

export default function TenantInvoicePaymentLinkPanel({
  jobId,
  invoiceId,
  returnTo,
  balanceDueDisplay,
  initialCheckoutSessionId,
  initialCheckoutSessionUrl,
}: TenantInvoicePaymentLinkPanelProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [state, action] = useActionState(
    createTenantInvoiceCheckoutSessionFromFormState,
    buildInitialState(initialCheckoutSessionId, initialCheckoutSessionUrl),
  );

  const checkoutSessionUrl = String(state.checkoutSessionUrl ?? initialCheckoutSessionUrl ?? "").trim();

  async function copyCheckoutUrl() {
    if (!checkoutSessionUrl || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(checkoutSessionUrl);
    setCopyMessage("Checkout URL copied.");
  }

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-1 pb-4 pt-1">
        <div className="text-sm font-semibold text-slate-950">Customer payment link</div>
        <div className="mt-1 text-sm text-slate-600">
          Creates a Stripe-hosted payment page for this invoice balance. Payment is recorded after Stripe confirms it.
        </div>
      </div>

      <div className="space-y-4 px-1 pb-1">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-600">
          Balance due: <span className="font-semibold text-slate-900">{balanceDueDisplay}</span>
        </div>

        <form action={action} className="space-y-4">
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <input type="hidden" name="tab" value="info" />
          <input type="hidden" name="return_to" value={returnTo} />

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-600">
            Creates a Stripe-hosted payment page for this invoice balance. Payment is recorded after Stripe confirms it.
          </div>

          <SubmitButton loadingText="Creating..." className={`${darkButtonClass} w-full`}>
            Create Customer Payment Link
          </SubmitButton>
        </form>

        {state.status === "success" && checkoutSessionUrl ? (
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-emerald-900">
            <div className="font-semibold">Customer payment link ready</div>
            <div>{state.message}</div>
            <div className="space-y-2 rounded-xl border border-emerald-200 bg-white/85 p-3 text-slate-700">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Checkout URL</div>
              <input readOnly value={checkoutSessionUrl} className={inputClass} />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyCheckoutUrl} className={secondaryButtonClass}>
                  Copy URL
                </button>
                <a href={checkoutSessionUrl} target="_blank" rel="noreferrer" className={secondaryButtonClass}>
                  Open Stripe page
                </a>
              </div>
              {copyMessage ? <div className="text-xs text-emerald-800">{copyMessage}</div> : null}
            </div>
            {state.checkoutSessionId ? (
              <div className="text-xs text-emerald-800">Session ID: {state.checkoutSessionId}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}