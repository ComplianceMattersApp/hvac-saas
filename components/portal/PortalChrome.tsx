export const portalPageClass =
  "mx-auto max-w-6xl space-y-6 px-3 pb-8 pt-4 text-gray-900 dark:text-gray-100 sm:px-4 lg:px-0";

export const portalNarrowPageClass =
  "mx-auto max-w-4xl space-y-6 px-3 pb-8 pt-4 text-gray-900 dark:text-gray-100 sm:px-4 lg:px-0";

export const portalPanelClass =
  "rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-slate-950 sm:p-5";

export const portalInsetClass =
  "rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900";

export const portalPrimaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_-18px_rgba(37,99,235,0.48)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_14px_26px_-18px_rgba(37,99,235,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]";

export const portalSecondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800";

export const portalInputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

export const portalMetricChipClass =
  "inline-flex min-h-8 items-center rounded-lg border px-3 py-1.5 text-xs font-semibold";

export function PortalStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number | string;
  tone?: "amber" | "blue" | "emerald" | "slate" | "neutral";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
      : tone === "blue"
        ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
        : tone === "emerald"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
          : tone === "neutral"
            ? "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            : "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

  return (
    <div className={`${portalMetricChipClass} ${toneClass}`}>
      <span className="font-bold">{value}</span>
      <span className="ml-1.5">{label}</span>
    </div>
  );
}
