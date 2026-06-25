"use client";

import { useContext } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { CalendarInspectorContext } from "./calendar-inspector-context";

type Props = {
  closeHref: string;
};

const CLOSE_BUTTON_CLASS =
  "shrink-0 rounded-lg border border-transparent p-2 text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800";

export default function CalendarInspectorCloseButton({ closeHref }: Props) {
  const inspectorContext = useContext(CalendarInspectorContext);

  if (inspectorContext) {
    return (
      <button
        type="button"
        onClick={() => inspectorContext.closeInspector()}
        aria-label="Close details"
        className={CLOSE_BUTTON_CLASS}
      >
        <X className="h-4 w-4" />
      </button>
    );
  }

  return (
    <Link href={closeHref} scroll={false} aria-label="Close details" className={CLOSE_BUTTON_CLASS}>
      <X className="h-4 w-4" />
    </Link>
  );
}
