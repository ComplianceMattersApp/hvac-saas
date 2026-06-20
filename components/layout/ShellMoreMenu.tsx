"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type ShellMoreItem = {
  label: string;
  href: string;
  exact?: boolean;
};

type Props = {
  items: ShellMoreItem[];
};

function isActivePath(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function ShellMoreMenu({ items }: Props) {
  const pathname = usePathname() || "/";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const active = items.some((item) => isActivePath(pathname, item.href, item.exact));

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

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={[
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70 xl:px-3",
          active
            ? "bg-slate-900 text-white shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)]"
            : "text-slate-700 hover:bg-white hover:text-slate-950 hover:shadow-sm",
        ].join(" ")}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        <span>More</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_20px_42px_-26px_rgba(15,23,42,0.42)] backdrop-blur">
          {items.map((item) => {
            const itemActive = isActivePath(pathname, item.href, item.exact);
            return (
              <Link
                key={`${item.href}:${item.label}`}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={itemActive ? "page" : undefined}
                className={[
                  "block rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200",
                  itemActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
