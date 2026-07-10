import type { ReactNode } from "react";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";

/**
 * One panel of the sectioned Company Profile console (design turn 14b).
 * Presentational shell only — eyebrow + tick, title, sub, body, optional footer.
 * Per-section forms and the on-change save bar live in SectionForm.
 *
 * Navy app tokens (VISUAL-ALIGNMENT-SPEC §2–3): navy #0f1f35 heading, blue-700
 * eyebrow + tick (via SectionEyebrow), slate scaffolding.
 */
export function SettingsSection({
  id,
  eyebrow,
  title,
  description,
  children,
  footer,
  className = "",
}: {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)] ${className}`}
    >
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4 sm:px-6">
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#0f1f35]">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
      </div>
      <div className="space-y-5 px-5 py-5 sm:px-6">{children}</div>
      {footer ? <div className="border-t border-slate-100 px-5 py-4 sm:px-6">{footer}</div> : null}
    </section>
  );
}
