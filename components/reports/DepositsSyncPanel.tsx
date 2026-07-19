'use client';

import { useActionState } from 'react';
import { syncStripePaymentSettlementsForAccountFromForm, type StripeSettlementSyncSummary } from '@/lib/actions/stripe-settlement-sync-actions';
import { reportActionClass, reportControlClass, reportLabelClass } from '@/components/reports/ReportLedgerChrome';

type State = StripeSettlementSyncSummary | null;

async function runSync(_state: State, formData: FormData): Promise<State> {
  return syncStripePaymentSettlementsForAccountFromForm(formData);
}

const fragment = (value: string | null) => value ? `${value.slice(0, 8)}…` : '—';

export default function DepositsSyncPanel(props: { accountOwnerUserId: string; dateFrom: string; dateTo: string }) {
  const [state, action, pending] = useActionState(runSync, null);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Refresh Stripe deposit data</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">Pull Stripe balance transaction and payout details for recorded online payments. This updates deposit reconciliation only and does not change invoices, payments, or allocations.</p>
      <form action={action} className="mt-4 grid gap-3 md:grid-cols-2">
        <input type="hidden" name="account_owner_user_id" value={props.accountOwnerUserId} />
        <label className="grid gap-1 text-sm"><span className={reportLabelClass}>Date from</span><input className={reportControlClass} type="date" name="date_from" defaultValue={props.dateFrom} required /></label>
        <label className="grid gap-1 text-sm"><span className={reportLabelClass}>Date to</span><input className={reportControlClass} type="date" name="date_to" defaultValue={props.dateTo} required /></label>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button className={reportActionClass()} type="submit" name="commit" value="0" disabled={pending}>Preview sync</button>
          <button className={reportActionClass('primary')} type="submit" name="commit" value="1" disabled={pending}>Sync deposits</button>
        </div>
      </form>
      {state ? <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
        <div className="font-semibold">{state.dryRun ? 'Preview result' : 'Sync result'}</div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <span>Evaluated: {state.evaluated}</span><span>Eligible: {state.eligible}</span><span>Synced: {state.synced}</span><span>Already synced: {state.alreadySynced}</span><span>Skipped: {state.skipped}</span><span>Unmatched: {state.unmatched}</span><span>Failed: {state.failed}</span>
        </div>
        {Object.keys(state.perCodeCounts).length ? <div className="mt-2 text-xs">{Object.entries(state.perCodeCounts).map(([code, count]) => `${code}: ${count}`).join(' · ')}</div> : null}
        {state.details.length ? <ul className="mt-3 space-y-1 text-xs">{state.details.slice(0, 20).map((row, index) => <li key={`${row.paymentId}-${index}`}><span className="font-medium">{row.invoiceNumber || fragment(row.paymentId)}</span> · charge {fragment(row.chargeId)} · {row.code}: {row.reason}</li>)}</ul> : null}
      </div> : null}
    </section>
  );
}
