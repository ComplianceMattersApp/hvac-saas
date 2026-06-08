import Link from "next/link";
import { AuthCommandCenterLayout } from "@/components/auth/AuthCommandCenterLayout";

type ProductChoiceCardProps = {
  title: string;
  copy: string;
  buttonLabel: string;
  href: string;
  tone: "service" | "ecc";
  previewItems: string[];
};

function ProductChoiceCard(props: ProductChoiceCardProps) {
  const isService = props.tone === "service";
  const accentText = isService ? "text-blue-300" : "text-cyan-300";
  const accentRing = isService ? "hover:border-blue-400/30 focus-visible:ring-blue-400/50" : "hover:border-cyan-400/30 focus-visible:ring-cyan-400/50";
  const buttonTone = isService
    ? "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400"
    : "bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400";

  return (
    <article
      className={`group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_60px_-32px_rgba(8,15,30,0.9)] backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 ${accentRing}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${accentText}`}>{props.title}</p>
        <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-slate-300">
          14-day guided trial
        </span>
      </div>

      <p className="mt-4 text-base font-semibold leading-6 text-white sm:text-lg">{props.copy}</p>

      <div className="mt-4 flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-300">
        <p className="font-medium text-white">{isService ? "Service preview" : "ECC preview"}</p>
        <div className="mt-2 grid grid-cols-1 gap-2 text-[13px] leading-5">
          {props.previewItems.map((item) => (
            <div key={item} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
              {item}
            </div>
          ))}
        </div>
      </div>

      <Link
        href={props.href}
        className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-16px_rgba(37,99,235,0.55)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070d1a] ${buttonTone}`}
      >
        {props.buttonLabel}
      </Link>
    </article>
  );
}

export function SignupProductChoiceLanding() {
  return (
    <AuthCommandCenterLayout
      eyebrow="Field Operations Desk"
      headline="Start a 14-day guided trial."
      subhead="Choose the path that fits your company. You can finish account setup on the next step — no payment details needed. Hybrid / All-in-One setup is handled manually by operator support when needed."
    >
      <div className="space-y-5">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">Choose your path</p>
          <div className="mt-4 grid grid-cols-1 gap-4">
            <ProductChoiceCard
              title="SERVICE"
              copy="For HVAC service companies managing customers, service calls, scheduling, field work, and follow-up."
              buttonLabel="Start HVAC Service Trial"
              href="/signup/service"
              tone="service"
              previewItems={["Service call scheduled", "Field notes captured", "Closeout ready"]}
            />
            <ProductChoiceCard
              title="ECC"
              copy="For ECC and compliance testing teams managing jobs, tests, corrections, contractors, and closeout."
              buttonLabel="Start ECC / Compliance Testing Trial"
              href="/signup/ecc"
              tone="ecc"
              previewItems={["Duct test scheduled", "Correction needed", "Closeout pending"]}
            />
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-slate-300">
          <p className="font-medium text-white">What happens next</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {["Enter your email", "Get your setup link", "Try real jobs for 14 days"].map((step, index) => (
              <div key={step} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-[11px] text-white">
                    {index + 1}
                  </span>
                  Step {index + 1}
                </div>
                <div className="mt-1.5 text-sm font-medium text-white">{step}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            No payment details are needed to get started. You can review account and billing options after setup.
          </p>
        </div>
      </div>
    </AuthCommandCenterLayout>
  );
}
