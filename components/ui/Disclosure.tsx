import type { ReactNode } from "react";

/**
 * Styled replacement for raw <details>/<summary> — spec §3. Stays a native
 * <details> element (no client JS) so open/closed state and form behavior
 * inside it are unchanged; only the container and header are restyled.
 */
export function Disclosure({
  title,
  subtitle,
  affordance,
  defaultOpen = false,
  variant = "default",
  className = "",
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  affordance?: ReactNode;
  defaultOpen?: boolean;
  variant?: "default" | "danger";
  className?: string;
  children: ReactNode;
}) {
  const isDanger = variant === "danger";
  return (
    <details
      open={defaultOpen}
      className={`overflow-hidden rounded-xl border ${
        isDanger ? "border-[#ffe4e6] bg-[#fff8f8]" : "border-slate-200 bg-white"
      } ${className}`}
    >
      <summary
        className={`flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 ${
          isDanger ? "" : "bg-slate-50"
        }`}
      >
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${isDanger ? "text-rose-800" : "text-slate-800"}`}>
            {title}
          </div>
          {subtitle ? <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
        {affordance ?? <DisclosureChevron />}
      </summary>
      <div className="px-4 py-3">{children}</div>
    </details>
  );
}

function DisclosureChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="disclosure-icon mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
