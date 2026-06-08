import type { ReactNode } from "react";

type CommandCenterAccent = "blue" | "cyan";

type CommandCenterCard = {
  label: string;
  detail: string;
  accent: CommandCenterAccent;
};

const COMMAND_CENTER_CARDS: CommandCenterCard[] = [
  { label: "Today’s Jobs", detail: "8 scheduled · 2 in progress", accent: "blue" },
  { label: "Calendar", detail: "Week view · 3 open slots", accent: "cyan" },
  { label: "Field Status", detail: "5 techs active · 1 en route", accent: "blue" },
  { label: "Closeout Queue", detail: "3 ready to close", accent: "cyan" },
  { label: "Invoice Status", detail: "2 sent today · 1 overdue", accent: "blue" },
  { label: "Payments", detail: "$4,280 collected this week", accent: "cyan" },
];

const ACCENT_STYLES: Record<CommandCenterAccent, { bar: string; dot: string; text: string }> = {
  blue: { bar: "bg-blue-400/70", dot: "bg-blue-400", text: "text-blue-200" },
  cyan: { bar: "bg-cyan-400/70", dot: "bg-cyan-300", text: "text-cyan-200" },
};

const CARD_OFFSETS = [
  "lg:translate-y-0",
  "lg:translate-y-7",
  "lg:translate-y-2",
  "lg:translate-y-9",
  "lg:-translate-y-1",
  "lg:translate-y-6",
];

function CommandCenterPreview() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-3 top-2 bottom-2 hidden w-px bg-gradient-to-b from-blue-400/0 via-blue-400/35 to-cyan-400/0 lg:block" />
      <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3">
        {COMMAND_CENTER_CARDS.map((card, index) => {
          const accent = ACCENT_STYLES[card.accent];
          return (
            <div
              key={card.label}
              className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_24px_60px_-32px_rgba(8,15,30,0.9)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1 ${CARD_OFFSETS[index] ?? ""}`}
            >
              <span className={`absolute inset-x-4 top-0 h-px ${accent.bar}`} />
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">{card.label}</p>
              </div>
              <p className={`mt-3 text-sm leading-5 ${accent.text}`}>{card.detail}</p>
            </div>
          );
        })}
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
    <div className="relative min-h-screen overflow-hidden bg-[#070d1a] text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.06) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="pointer-events-none absolute -top-40 left-[12%] h-[30rem] w-[30rem] rounded-full bg-blue-600/20 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-[-8rem] right-[6%] h-[26rem] w-[26rem] rounded-full bg-cyan-500/15 blur-[130px]" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-16 lg:py-14">
        <section className="hidden lg:block">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            {eyebrow}
          </span>

          <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.1] tracking-tight text-white xl:text-[2.75rem]">
            {headline}
          </h1>

          <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">{subhead}</p>

          {highlights?.length ? (
            <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-10">
            <CommandCenterPreview />
          </div>
        </section>

        <section className="mx-auto w-full max-w-md lg:mx-0">{children}</section>
      </div>
    </div>
  );
}
