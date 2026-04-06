"use client";

import { useFormStatus } from "react-dom";

type UnscheduleButtonProps = {
  className?: string;
};

export default function UnscheduleButton({ className }: UnscheduleButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      className={
        className ??
        "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
      }
      type="submit"
      name="unschedule"
      value="1"
      onClick={(e) => {
        const ok = window.confirm("Remove this job from the schedule?");
        if (!ok) e.preventDefault();
      }}
    >
      {pending ? "Updating..." : "Unschedule"}
    </button>
  );
}
