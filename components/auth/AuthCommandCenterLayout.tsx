import type { ReactNode } from "react";
import { Check } from "lucide-react";

type PreviewSegment = {
  text: string;
  live?: boolean;
};

type PreviewCard = {
  label: string;
  labelLive?: boolean;
  segments: PreviewSegment[];
};

const PREVIEW_CARDS: PreviewCard[] = [
  { label: "Today's Jobs", segments: [{ text: "6 scheduled" }, { text: "3 in progress", live: true }] },
  { label: "Schedule", segments: [{ text: "2 open slots this week" }] },
  {
    label: "Field Status",
    labelLive: true,
    segments: [{ text: "4 techs active", live: true }, { text: "1 on the way", live: true }],
  },
  { label: "Closeout", segments: [{ text: "2 jobs ready to close" }] },
  { label: "Invoices", segments: [{ text: "$1,840 invoiced today" }, { text: "1 needs attention" }] },
];

function LiveDot() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#c2622a] animate-pulse"
    />
  );
}

function OperationsPreview() {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white/60 p-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {PREVIEW_CARDS.map((card, index) => (
          <div
            key={card.label}
            className={`rounded-xl border border-stone-100 bg-white p-3 transition-colors hover:border-stone-200 ${
              index === PREVIEW_CARDS.length - 1 ? "col-span-2" : ""
            }`}
          >
            <span className="block h-0.5 w-8 rounded-full bg-gradient-to-r from-[#c2622a] to-[#d97740]" />
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-stone-400">
              {card.labelLive ? <LiveDot /> : null}
              {card.label}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1 text-sm leading-5 text-[#0f1f35]">
              {card.segments.map((segment, segmentIndex) => (
                <span key={segment.text} className="inline-flex items-center gap-1">
                  {segmentIndex > 0 ? <span className="text-stone-400">·</span> : null}
                  {segment.live ? <LiveDot /> : null}
                  {segment.text}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export type AuthCommandCenterLayoutProps = {
  eyebrow: string;
  brandName?: string;
  backingLine?: string;
  headline: ReactNode;
  brandLine?: string;
  subhead: string;
  highlights?: string[];
  children: ReactNode;
};

export function AuthCommandCenterLayout({
  eyebrow,
  brandName,
  backingLine,
  headline,
  brandLine,
  subhead,
  highlights,
  children,
}: AuthCommandCenterLayoutProps) {
  return (
    <div className="relative min-h-screen bg-shell-warm text-[#0f1f35]">
      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-14">
        <section className="hidden space-y-8 lg:block lg:border-r lg:border-stone-200 lg:pr-12">
          {brandName ? (
            <>
              <div>
                <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c2622a]">
                  <span className="h-px w-6 bg-[#c2622a]/50" />
                  {eyebrow}
                </div>
                <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight text-[#0f1f35] xl:text-[2.85rem]">
                  {brandName}
                </h1>
                {backingLine ? (
                  <p className="mt-2 text-sm font-medium text-stone-500">{backingLine}</p>
                ) : null}
              </div>
              <div>
                <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-[#0f1f35] xl:text-4xl">
                  {headline}
                </h2>
                {brandLine ? (
                  <p className="mt-4 mb-4 max-w-lg text-base italic leading-relaxed text-stone-600">{brandLine}</p>
                ) : null}
                <p className="mt-4 max-w-lg text-sm leading-relaxed text-stone-600 sm:text-base">{subhead}</p>
              </div>
            </>
          ) : (
            <div>
              <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c2622a]">
                <span className="h-px w-6 bg-[#c2622a]/50" />
                {eyebrow}
              </div>
              <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.15] tracking-tight text-[#0f1f35] xl:text-[2.6rem]">
                {headline}
              </h1>
              {brandLine ? (
                <p className="mt-4 mb-4 max-w-lg text-base italic leading-relaxed text-stone-600">{brandLine}</p>
              ) : null}
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-stone-600 sm:text-base">{subhead}</p>
            </div>
          )}

          {highlights?.length ? (
            <ul className="grid grid-cols-2 gap-3">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-6 text-stone-600">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-[#c2622a]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}

          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-stone-500">A look at your day</p>
            <OperationsPreview />
          </div>
        </section>

        <section className="mx-auto w-full max-w-md lg:mx-0">{children}</section>
      </div>
    </div>
  );
}
