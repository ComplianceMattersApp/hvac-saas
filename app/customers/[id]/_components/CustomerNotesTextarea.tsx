"use client";

import { useEffect, useRef } from "react";

export function CustomerNotesTextarea({
  defaultValue,
}: {
  defaultValue: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <textarea
      ref={ref}
      name="notes"
      defaultValue={defaultValue}
      rows={6}
      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
      placeholder="No notes on file."
    />
  );
}
