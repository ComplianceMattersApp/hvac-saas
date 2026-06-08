import type { ReactNode } from "react";

type PreviewCard = {
  label: string;
  detail: string;
};

const PREVIEW_CARDS: PreviewCard[] = [
  { label: "Today's Jobs", detail: "8 scheduled · 2 in progress" },
  { label: "Schedule", detail: "Week view · 3 open slots" },
  { label: "Field Status", detail: "5 techs active · 1 en route" },
  { label: "Closeout", detail: "3 ready to close" },
  { label: "Invoices", detail: "2 sent today · 1 overdue" },
];

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
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">{card.label}</p>
            <p className="mt-1.5 text-sm leading-5 text-slate-400">{card.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export type AuthCommandCenterLayoutProps = {
  eyebrow: string;
  headline: ReactNode;
  subhead: string;
  highlights?: string[];
  children: ReactNode;
};

export function AuthCommandCenterLayout({ eyebrow, headline, subhead, highlights, children }: AuthCommandCenterLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#101b2d] to-[#0b1422] text-slate-100">
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
          <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
            <span className="h-px w-6 bg-blue-400/50" />
            {eyebrow}
          </div>

          <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.15] tracking-tight text-white xl:text-[2.6rem]">
            {headline}
          </h1>

          <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">{subhead}</p>

          {highlights?.length ? (
            <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400/70" />
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
