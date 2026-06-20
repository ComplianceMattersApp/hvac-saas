"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type ShellCreateItem = {
  label: string;
  href: string;
  description: string;
};

type Props = {
  items: ShellCreateItem[];
};

export default function ShellCreateMenu({ items }: Props) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-sm font-semibold text-white shadow-[0_14px_22px_-18px_rgba(37,99,235,0.58)] transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span>Create</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute left-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_20px_42px_-26px_rgba(15,23,42,0.42)] backdrop-blur">
          {items.map((item) => (
            <Link
              key={`${item.href}:${item.label}`}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
            >
              <span className="block text-sm font-semibold text-slate-950">{item.label}</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.description}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
