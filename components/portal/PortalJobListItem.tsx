import Link from "next/link";

type PortalJobListItemProps = {
  href: string;
  customerName: string;
  title: string;
  address: string;
  statusLabel: string;
  statusToneClass: string;
  detailLine?: string;
  nextStep: string;
  secondaryMeta: string;
  photoCount?: number;
};

export default function PortalJobListItem(props: PortalJobListItemProps) {
  const {
    href,
    customerName,
    title,
    address,
    statusLabel,
    statusToneClass,
    detailLine,
    nextStep,
    secondaryMeta,
    photoCount = 0,
  } = props;

  const summaryLabel = detailLine ? "Current update" : "Next step";
  const summaryText = detailLine || nextStep;

  return (
    <Link
      href={href}
      className="group block px-4 py-3.5 transition-colors duration-150 hover:bg-slate-50/85 dark:hover:bg-slate-800/35 sm:px-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusToneClass}`}>
              {statusLabel}
            </span>
            {photoCount > 0 ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                {photoCount} {photoCount === 1 ? "photo" : "photos"}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 text-[1rem] font-semibold tracking-[-0.018em] text-slate-950 dark:text-slate-100 lg:max-w-[48rem]">
            {title}
          </div>
          {customerName ? (
            <div className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200 lg:max-w-[50rem]">
              {customerName}
            </div>
          ) : null}
          <div className="mt-0.5 text-sm leading-5 text-slate-600 dark:text-slate-300 lg:max-w-[50rem]">
            {address}
          </div>

          <div className="mt-2.5 rounded-xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.98))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.6),rgba(15,23,42,0.4))] dark:shadow-none">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                {summaryLabel}
            </div>
            <div className="mt-1 text-sm font-medium leading-5 text-slate-800 dark:text-slate-200 lg:pr-4">
              {summaryText}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 md:min-w-[148px] md:flex-col md:items-end md:justify-between md:self-stretch md:pl-2 md:text-right">
          <div className="rounded-full border border-slate-200/80 bg-white/92 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 shadow-[0_10px_20px_-24px_rgba(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 md:hidden">
            {secondaryMeta}
          </div>
          <div className="hidden rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 shadow-[0_16px_30px_-28px_rgba(15,23,42,0.26)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 md:block">
            {secondaryMeta}
          </div>
          <span className="inline-flex min-h-9 items-center rounded-xl border border-slate-300/80 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-[0_14px_24px_-22px_rgba(15,23,42,0.22)] transition-[border-color,background-color,color,transform,box-shadow] group-hover:-translate-y-px group-hover:border-slate-400 group-hover:bg-slate-50 group-hover:shadow-[0_16px_26px_-22px_rgba(15,23,42,0.26)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:group-hover:border-slate-600 dark:group-hover:bg-slate-800">
            View details
          </span>
        </div>
      </div>
    </Link>
  );
}