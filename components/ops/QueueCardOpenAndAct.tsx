import type { ReactNode } from "react";

export type QueueCardOpenAndActProps = {
  children: ReactNode;
};

export default function QueueCardOpenAndAct({ children }: QueueCardOpenAndActProps) {
  return (
    <details className="group mt-2 border-t border-slate-200 pt-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
        <span>Open & Act</span>
        <span className="text-[10px] text-slate-400 transition-transform duration-150 group-open:rotate-180" aria-hidden="true">
          v
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
