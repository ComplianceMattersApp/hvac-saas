import Link from "next/link";

type ProductChoiceCardProps = {
  title: string;
  copy: string;
  buttonLabel: string;
  href: string;
};

function ProductChoiceCard(props: ProductChoiceCardProps) {
  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/20 backdrop-blur sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">{props.title}</p>
      <p className="mt-4 text-sm leading-6 text-slate-200 sm:text-base">{props.copy}</p>
      <Link
        href={props.href}
        className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80"
      >
        {props.buttonLabel}
      </Link>
    </article>
  );
}

export function SignupProductChoiceLanding() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-10 text-slate-100 sm:px-6 sm:py-14 lg:py-18">
      <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-cyan-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />

      <div className="relative mx-auto w-full max-w-5xl space-y-6 lg:space-y-8">
        <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-2xl shadow-black/25 backdrop-blur sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Compliance Matters Onboarding</p>
          <h1 className="mt-3 font-serif text-3xl tracking-tight text-white sm:text-4xl">
            Choose Your Product Setup
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200 sm:text-base">
            Start by selecting the workflow that fits your company. You can complete account setup on the next step.
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-400 sm:text-sm">
            Hybrid / All-in-One setup is handled manually by operator support when needed.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          <ProductChoiceCard
            title="SERVICE"
            copy="For HVAC service companies managing customers, work orders, scheduling, estimates, and field work."
            buttonLabel="Start Service Setup"
            href="/signup/service"
          />
          <ProductChoiceCard
            title="ECC"
            copy="For compliance testing companies managing ECC jobs, contractors, tests, corrections, and closeout."
            buttonLabel="Start ECC Setup"
            href="/signup/ecc"
          />
        </section>
      </div>
    </div>
  );
}
