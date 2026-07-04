import type { ReactNode } from "react";

/**
 * Section eyebrow with tick — spec §3. Reserved for section-level headings;
 * field labels inside forms use slate-400 and get no tick.
 */
export function SectionEyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-1 flex items-center gap-2 ${className}`}>
      <span className="h-[13px] w-[3px] shrink-0 rounded-sm bg-blue-600" aria-hidden="true" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-blue-700">
        {children}
      </span>
    </div>
  );
}
