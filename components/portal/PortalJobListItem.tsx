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
      className="group block px-4 py-4 transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-900/70 sm:px-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex min-h-7 items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${statusToneClass}`}>
              {statusLabel}
            </span>
            {photoCount > 0 ? (
              <span className="inline-flex min-h-7 items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                {photoCount} {photoCount === 1 ? "photo" : "photos"}
              </span>
            ) : null}
          </div>
          <div className="mt-2 text-base font-semibold text-slate-950 dark:text-slate-100 lg:max-w-[48rem]">
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

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {summaryLabel}
            </div>
            <div className="mt-1 text-sm font-medium leading-5 text-slate-800 dark:text-slate-200 lg:pr-4">
              {summaryText}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 md:min-w-[150px] md:flex-col md:items-end md:justify-between md:self-stretch md:pl-2 md:text-right">
          <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 md:hidden">
            {secondaryMeta}
          </div>
          <div className="hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 md:block">
            {secondaryMeta}
          </div>
          <span className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,color,transform] group-hover:border-slate-400 group-hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:group-hover:border-slate-600 dark:group-hover:bg-slate-800">
            Open job
          </span>
        </div>
      </div>
    </Link>
  );
}
