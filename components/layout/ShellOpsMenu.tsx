"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ClipboardList } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { OPS_NAV_QUEUE_LINKS } from "@/lib/ops/ops-nav-queue-links";

function isOpsActive(pathname: string) {
  return pathname === "/ops" || pathname.startsWith("/ops/");
}

function normalizeOpsBucket(value: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "all" || normalized === "need_to_schedule") return "pending";
  if (normalized === "scheduled") return "field_work";
  return normalized;
}

export default function ShellOpsMenu() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const active = isOpsActive(pathname);
  const activeBucket = pathname === "/ops" ? normalizeOpsBucket(searchParams.get("bucket")) : null;

  useEffect(() => {
    setOpen(false);
  }, [pathname, searchParams]);

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
      <div
        className={[
          "inline-flex h-8 items-center overflow-hidden rounded-lg text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-slate-300/70",
          active
            ? "bg-slate-900 text-white shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)]"
            : "text-slate-700 hover:bg-white hover:text-slate-950 hover:shadow-sm",
        ].join(" ")}
      >
        <Link
          href="/ops"
          aria-current={active ? "page" : undefined}
          className="inline-flex h-full items-center justify-center px-2.5 transition-colors xl:px-3"
        >
          Operations
        </Link>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Open Operations queue menu"
          className={[
            "inline-flex h-full w-8 items-center justify-center border-l transition-colors focus-visible:outline-none",
            active
              ? "border-white/18 text-white/85 hover:bg-white/10 hover:text-white"
              : "border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900",
          ].join(" ")}
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {open ? (
        <div className="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_20px_42px_-26px_rgba(15,23,42,0.42)] backdrop-blur">
          <div className="flex items-center gap-2 px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
            Ops Queues
          </div>
          {OPS_NAV_QUEUE_LINKS.map((item) => {
            const itemActive = pathname === "/ops" && activeBucket === item.bucket;
            return (
              <Link
                key={item.bucket}
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
