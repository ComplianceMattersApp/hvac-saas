import type { ReactNode } from "react";
import { Check } from "lucide-react";

type PreviewSegment = {
  text: string;
  live?: "green" | "blue";
};

type PreviewCard = {
  label: string;
  labelLive?: boolean;
  segments: PreviewSegment[];
};

const PREVIEW_CARDS: PreviewCard[] = [
  { label: "Today's Jobs", segments: [{ text: "6 scheduled" }, { text: "3 in progress", live: "blue" }] },
  { label: "Schedule", segments: [{ text: "2 open slots this week" }] },
  {
    label: "Field Status",
    labelLive: true,
    segments: [{ text: "4 techs active", live: "green" }, { text: "1 on the way", live: "blue" }],
  },
  { label: "Closeout", segments: [{ text: "2 jobs ready to close" }] },
  { label: "Invoices", segments: [{ text: "$1,840 invoiced today" }, { text: "1 needs attention" }] },
];

function LiveDot({ tone }: { tone: "green" | "blue" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full animate-pulse ${
        tone === "green" ? "bg-green-400" : "bg-blue-400"
      }`}
    />
  );
}

function OperationsPreview() {
  return (
    <div className="relative">
      <span className="absolute -top-3 left-0 h-px w-16 bg-gradient-to-r from-blue-400/80 to-blue-400/0" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {PREVIEW_CARDS.map((card, index) => (
          <div
            key={card.label}
            className={`rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-4 shadow-[0_18px_38px_-16px_rgba(4,10,24,0.85)] transition-colors hover:border-blue-400/20 ${
              index === PREVIEW_CARDS.length - 1 ? "col-span-2" : ""
            }`}
          >
            <span className="block h-0.5 w-8 rounded-full bg-gradient-to-r from-blue-400 to-blue-400/20" />
            <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
              {card.labelLive ? <LiveDot tone="green" /> : null}
              {card.label}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1 text-sm leading-5 text-slate-400">
              {card.segments.map((segment, segmentIndex) => (
                <span key={segment.text} className="inline-flex items-center gap-1">
                  {segmentIndex > 0 ? <span className="text-slate-600">·</span> : null}
                  {segment.live ? <LiveDot tone={segment.live} /> : null}
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
  subhead: string;
  highlights?: string[];
  children: ReactNode;
};

export function AuthCommandCenterLayout({ eyebrow, brandName, backingLine, headline, subhead, highlights, children }: AuthCommandCenterLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-shell-dark to-shell-darker text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(rgba(148,163,184,0.12) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
      <div className="pointer-events-none absolute left-[6%] top-[8%] h-[34rem] w-[34rem] rounded-full bg-blue-500/10 blur-[160px]" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-14">
        <section className="hidden lg:block">
          {brandName ? (
            <>
              <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
                <span className="h-px w-6 bg-blue-400/50" />
                {eyebrow}
              </div>
              <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight text-white xl:text-[2.85rem]">
                {brandName}
              </h1>
              {backingLine ? (
                <p className="mt-2 text-sm font-medium text-blue-200/85">{backingLine}</p>
              ) : null}
              <h2 className="mt-6 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
                {headline}
              </h2>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
                <span className="h-px w-6 bg-blue-400/50" />
                {eyebrow}
              </div>
              <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.15] tracking-tight text-white xl:text-[2.6rem]">
                {headline}
              </h1>
            </>
          )}

          <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">{subhead}</p>

          {highlights?.length ? (
            <ul className="mt-6 grid grid-cols-2 gap-3">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-6 text-slate-300">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-blue-400" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-10">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">A look at your day</p>
            <OperationsPreview />
          </div>
        </section>

        <section className="mx-auto w-full max-w-md lg:mx-0">{children}</section>
      </div>
    </div>
  );
}
