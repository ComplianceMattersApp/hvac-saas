import Link from "next/link";

type ProductChoiceCardProps = {
  title: string;
  copy: string;
  buttonLabel: string;
  href: string;
  tone: "service" | "ecc";
};

function ProductChoiceCard(props: ProductChoiceCardProps) {
  const isService = props.tone === "service";

  return (
    <article
      className={`group flex h-full flex-col rounded-[28px] border p-5 shadow-[0_24px_50px_-34px_rgba(0,0,0,0.65)] backdrop-blur transition-transform duration-200 hover:-translate-y-0.5 sm:p-6 ${
        isService
          ? "border-indigo-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(238,242,255,0.98))] dark:border-indigo-800/70 dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.98),rgba(15,23,42,0.98))]"
          : "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(236,253,245,0.98))] dark:border-emerald-800/70 dark:bg-[linear-gradient(180deg,rgba(16,24,40,0.98),rgba(8,15,28,0.98))]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
            isService ? "text-indigo-700 dark:text-indigo-300" : "text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {props.title}
        </p>
        <span className="inline-flex rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          14-day guided trial
        </span>
      </div>

      <p className="mt-4 text-base font-semibold leading-6 text-slate-900 dark:text-white sm:text-lg">
        {props.copy}
      </p>

      <div className="mt-4 flex-1 rounded-2xl border border-slate-200/80 bg-white/75 p-4 text-sm leading-6 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
        <p className="font-medium text-slate-900 dark:text-white">
          Choose this path if your team needs a clear start point.
        </p>
        <p className="mt-1">
          You can keep the first setup simple and come back for the rest later.
        </p>
      </div>

      <Link
        href={props.href}
        className={`mt-6 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_12px_28px_-18px_rgba(34,211,238,0.65)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
          isService
            ? "bg-cyan-500 hover:bg-cyan-400 focus-visible:ring-cyan-200/80 focus-visible:ring-offset-slate-950"
            : "bg-emerald-400 hover:bg-emerald-300 focus-visible:ring-emerald-200/80 focus-visible:ring-offset-slate-950"
        }`}
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
        <section className="overflow-hidden rounded-[32px] border border-slate-700/80 bg-slate-900/75 shadow-2xl shadow-black/25 backdrop-blur">
          <div className="border-b border-white/5 bg-white/5 px-5 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
              <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-200">
                Guided trial
              </span>
              <span>Compliance Matters Onboarding</span>
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:p-8">
            <div>
              <h1 className="font-serif text-3xl leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Start a 14-day guided trial
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                Choose the path that fits your company. You can finish account setup on the next step without payment details.
              </p>
              <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-400 sm:text-sm">
                Hybrid / All-in-One setup is handled manually by operator support when needed.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  "Enter your email",
                  "Get setup link",
                  "Try real jobs for 14 days",
                ].map((step, index) => (
                  <div key={step} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[11px] text-white">
                        {index + 1}
                      </span>
                      Step {index + 1}
                    </div>
                    <div className="mt-2 leading-5 text-white">{step}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-slate-700/80 bg-slate-900/60 px-4 py-3 text-sm leading-6 text-slate-200 sm:max-w-xl">
                No payment details are needed to get started. You can review account and billing options after setup.
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-700/80 bg-slate-950/30 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Choose your path</p>
              <div className="mt-4 grid grid-cols-1 gap-4">
                <ProductChoiceCard
                  title="SERVICE"
                  copy="For HVAC service companies managing customers, service calls, scheduling, field work, and follow-up."
                  buttonLabel="Start HVAC Service Trial"
                  href="/signup/service"
                  tone="service"
                />
                <ProductChoiceCard
                  title="ECC"
                  copy="For ECC and compliance testing teams managing jobs, tests, corrections, contractors, and closeout."
                  buttonLabel="Start ECC / Compliance Testing Trial"
                  href="/signup/ecc"
                  tone="ecc"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
