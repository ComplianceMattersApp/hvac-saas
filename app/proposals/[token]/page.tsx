import Link from "next/link";

import { readPublicEstimateProposalByToken } from "@/lib/estimates/estimate-proposal-public-read";

export const metadata = {
  title: "Proposal",
};

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ProposalUnavailableShell() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_48%,#f8fafc_100%)] px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-[32px] border border-slate-200/90 bg-white/95 p-6 shadow-[0_30px_80px_-46px_rgba(15,23,42,0.38)] sm:p-8">
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Proposal unavailable
        </div>
        <h1 className="mt-4 text-[clamp(1.9rem,5vw,3rem)] font-semibold tracking-[-0.04em] text-slate-950">
          This proposal is not available.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
          The link may be invalid, expired, revoked, or not currently eligible for online proposal review.
          Contact the company directly if you need a current proposal link.
        </p>
      </div>
    </div>
  );
}

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await readPublicEstimateProposalByToken(token);

  if (!result.available) {
    return <ProposalUnavailableShell />;
  }

  const { proposal } = result;
  const createdLabel = formatDate(proposal.lifecycle.createdAt);
  const sentLabel = formatDate(proposal.lifecycle.sentAt);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_38%,#fff7ed_100%)] px-4 py-8 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-slate-200/90 bg-white/96 shadow-[0_34px_90px_-50px_rgba(15,23,42,0.42)]">
          <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,246,255,0.96),rgba(255,247,237,0.96))] px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Review Proposal
                </div>
                {proposal.business.logoUrl ? (
                  <img
                    src={proposal.business.logoUrl}
                    alt=""
                    className="mt-3 block max-h-14 max-w-[220px] object-contain"
                  />
                ) : (
                  <div className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                    {proposal.business.displayName}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.28)]">
                <div>
                  <span className="font-semibold text-slate-900">Estimate #:</span> {proposal.identity.estimateNumber}
                </div>
                {sentLabel ? (
                  <div className="mt-1">
                    <span className="font-semibold text-slate-900">Sent:</span> {sentLabel}
                  </div>
                ) : createdLabel ? (
                  <div className="mt-1">
                    <span className="font-semibold text-slate-900">Created:</span> {createdLabel}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-8">
            <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-semibold tracking-[-0.05em] text-slate-950">
              {proposal.identity.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Review the proposed scope and pricing below. Approval and selection actions are not enabled in this view yet.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(17rem,0.9fr)]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Service location
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-700">
                  {proposal.context.locationDisplay ?? "Location details available from the company upon request."}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Contact
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-700">
                  <div className="font-semibold text-slate-950">{proposal.business.displayName}</div>
                  {proposal.business.supportEmail ? <div>{proposal.business.supportEmail}</div> : null}
                  {proposal.business.supportPhone ? <div>{proposal.business.supportPhone}</div> : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        {proposal.proposalMode === "multi_option_packages" ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-5 py-4 text-sm text-amber-950 shadow-[0_18px_40px_-34px_rgba(120,53,15,0.26)]">
              <div className="font-semibold">Multiple options are included in this proposal.</div>
              <div className="mt-1 text-amber-900/90">
                Compare each option below. Online selection and approval are not enabled in this version.
              </div>
            </div>

            {proposal.options.map((option) => (
              <article
                key={`${option.slotIndex}-${option.label}`}
                className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white/96 shadow-[0_26px_70px_-46px_rgba(15,23,42,0.36)]"
              >
                <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Option {option.slotIndex}
                      </div>
                      <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-slate-950">{option.label}</h2>
                      {option.summary ? <p className="mt-2 text-sm leading-6 text-slate-600">{option.summary}</p> : null}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right text-sm text-slate-600">
                      <div>
                        Subtotal <span className="font-semibold text-slate-900">{formatCents(option.subtotalCents)}</span>
                      </div>
                      <div className="mt-1 text-base">
                        Total <span className="font-bold text-slate-950">{formatCents(option.totalCents)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-200/80">
                  {option.lines.map((line, index) => (
                    <div key={`${option.slotIndex}-${index}-${line.itemName}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(5rem,0.65fr)_minmax(7rem,0.8fr)_minmax(8rem,0.85fr)] sm:px-6">
                      <div>
                        <div className="font-semibold text-slate-950">{line.itemName}</div>
                        {line.description ? <div className="mt-1 text-sm leading-6 text-slate-600">{line.description}</div> : null}
                      </div>
                      <div className="text-sm text-slate-600 sm:text-right">{Number.isInteger(line.quantity) ? line.quantity : line.quantity.toFixed(2)}</div>
                      <div className="text-sm text-slate-600 sm:text-right">{formatCents(line.unitPriceCents)}</div>
                      <div className="text-sm font-semibold text-slate-900 sm:text-right">{formatCents(line.lineSubtotalCents)}</div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white/96 shadow-[0_26px_70px_-46px_rgba(15,23,42,0.36)]">
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Proposed scope</div>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-slate-950">Proposal details</h2>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right text-sm text-slate-600">
                  <div>
                    Subtotal <span className="font-semibold text-slate-900">{formatCents(proposal.totals.subtotalCents)}</span>
                  </div>
                  <div className="mt-1 text-base">
                    Total <span className="font-bold text-slate-950">{formatCents(proposal.totals.totalCents)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-200/80">
              {proposal.lines.map((line, index) => (
                <div key={`${index}-${line.itemName}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(5rem,0.65fr)_minmax(7rem,0.8fr)_minmax(8rem,0.85fr)] sm:px-6">
                  <div>
                    <div className="font-semibold text-slate-950">{line.itemName}</div>
                    {line.description ? <div className="mt-1 text-sm leading-6 text-slate-600">{line.description}</div> : null}
                  </div>
                  <div className="text-sm text-slate-600 sm:text-right">{Number.isInteger(line.quantity) ? line.quantity : line.quantity.toFixed(2)}</div>
                  <div className="text-sm text-slate-600 sm:text-right">{formatCents(line.unitPriceCents)}</div>
                  <div className="text-sm font-semibold text-slate-900 sm:text-right">{formatCents(line.lineSubtotalCents)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-[28px] border border-slate-200/90 bg-white/96 px-6 py-5 shadow-[0_26px_70px_-46px_rgba(15,23,42,0.36)] sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Next steps</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Contact {proposal.business.displayName} if you have questions about this proposal.
              </p>
            </div>
            {proposal.business.supportEmail ? (
              <Link
                href={`mailto:${proposal.business.supportEmail}`}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
              >
                Contact the company
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}