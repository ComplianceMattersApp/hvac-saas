'use client';

export default function DepositsReportError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <section className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-900">
        <h1 className="text-lg font-semibold">Deposits report unavailable</h1>
        <p className="mt-2 text-sm leading-6">We could not load the settlement report safely. No totals or sync results were changed. Try again, or contact support if the problem continues.</p>
        <button type="button" onClick={reset} className="mt-4 rounded-md border border-rose-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-rose-100">Try again</button>
      </section>
    </main>
  );
}
