import { updateGlobalAiBudgetFromForm } from "@/lib/actions/ai-budget-actions";
import { formatMicrousd, type AiBudgetSnapshot } from "@/lib/ai/usage-budget";

function featureLabel(value: string) {
  if (value === "estimate_coach") return "Estimate Coach";
  if (value === "trainer") return "Trainer";
  if (value === "future_internal_assistant") return "Future assistants";
  return value;
}

export default function AiUsageBudgetPanel({
  snapshot,
  notice,
}: {
  snapshot: AiBudgetSnapshot;
  notice: string;
}) {
  if (!snapshot.available) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">AI usage controls</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">Budget ledger unavailable</h2>
        <p className="mt-1 text-sm text-slate-600">The AI budget migration is not available in this environment. Provider-backed AI must remain disabled.</p>
      </section>
    );
  }

  const committed = snapshot.completedCostMicrousd + snapshot.reservedCostMicrousd;
  const percent = snapshot.monthlyLimitMicrousd > 0
    ? Math.min(100, (committed / snapshot.monthlyLimitMicrousd) * 100)
    : 100;

  return (
    <section className="rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Platform Owner · AI usage controls</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Global monthly AI budget</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Provider requests must reserve against this global ceiling before they run. Completed calls settle to actual token cost.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${snapshot.enabled ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
          {snapshot.enabled ? "AI requests enabled" : "AI requests paused"}
        </span>
      </div>

      {notice ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {notice === "updated" ? "AI budget controls updated." : notice === "invalid_limit" ? "Enter a monthly limit from $1 to $1,000." : "AI budget controls could not be updated."}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Monthly cap</p><p className="mt-1 text-xl font-semibold text-slate-950">{formatMicrousd(snapshot.monthlyLimitMicrousd)}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Completed spend</p><p className="mt-1 text-xl font-semibold text-slate-950">{formatMicrousd(snapshot.completedCostMicrousd)}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Reserved</p><p className="mt-1 text-xl font-semibold text-slate-950">{formatMicrousd(snapshot.reservedCostMicrousd)}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Remaining</p><p className="mt-1 text-xl font-semibold text-slate-950">{formatMicrousd(snapshot.remainingMicrousd)}</p></div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${percent.toFixed(1)} percent of AI budget committed`}>
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{snapshot.completedRequests} completed request(s); {snapshot.rejectedRequests} blocked request(s) this UTC month.</p>

      {Object.keys(snapshot.byFeature).length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(snapshot.byFeature).map(([feature, cost]) => (
            <span key={feature} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">{featureLabel(feature)}: <strong>{formatMicrousd(cost)}</strong></span>
          ))}
        </div>
      ) : null}

      <form action={updateGlobalAiBudgetFromForm} className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[minmax(12rem,18rem)_1fr_auto] sm:items-end">
        <label className="block text-sm font-semibold text-slate-700">
          Monthly hard cap (USD)
          <input name="monthly_limit_dollars" type="number" min="1" max="1000" step="0.01" required defaultValue={(snapshot.monthlyLimitMicrousd / 1_000_000).toFixed(2)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-700">
          <input name="is_enabled" type="checkbox" defaultChecked={snapshot.enabled} className="h-4 w-4 rounded border-slate-300" />
          Allow provider-backed AI requests
        </label>
        <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Save controls</button>
      </form>
      <p className="mt-3 text-xs text-slate-500">Turning AI off or reaching the cap blocks new reservations. It does not alter deterministic Estimate Coach guidance or existing app records.</p>
    </section>
  );
}
