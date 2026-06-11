import Link from "next/link";
import type { AppAccessCta } from "@/lib/business/app-access-cta";

type AppAccessCtaCardProps = {
  cta: AppAccessCta;
  className?: string;
};

export function AppAccessCtaCard({ cta, className = "" }: AppAccessCtaCardProps) {
  if (cta.kind === "none" || !cta.heading || !cta.buttonLabel || !cta.target) {
    return null;
  }

  const action =
    cta.target.mode === "link" ? (
      <Link
        href={cta.target.href}
        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_-18px_rgba(37,99,235,0.48)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_14px_26px_-18px_rgba(37,99,235,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]"
      >
        {cta.buttonLabel}
      </Link>
    ) : (
      <form action={cta.target.action} method="post">
        <button
          type="submit"
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_-18px_rgba(37,99,235,0.48)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_14px_26px_-18px_rgba(37,99,235,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]"
        >
          {cta.buttonLabel}
        </button>
      </form>
    );

  return (
    <section
      className={`rounded-lg border border-blue-100 bg-blue-50/70 p-4 shadow-[0_14px_34px_-28px_rgba(37,99,235,0.28)] dark:border-blue-900/70 dark:bg-blue-950/20 ${className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">
            {cta.heading}
          </h2>
          {cta.helper ? (
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {cta.helper}
            </p>
          ) : null}
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    </section>
  );
}
