"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import LogoutButton from "@/components/auth/LogoutButton";

type Props = {
  accountName: string;
  accountLabel: string;
  isAdmin: boolean;
  isInternalUser: boolean;
};

const menuItemClass =
  "block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200";

export default function UserAccountMenu({ accountName, accountLabel, isAdmin }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70"
      >
        <Settings className="h-4 w-4 text-slate-500" aria-hidden="true" />
        <span className="hidden xl:inline">Settings</span>
        <span className="sr-only">
          Account settings for {accountLabel || accountName || "account"}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 min-w-48 overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_20px_42px_-26px_rgba(15,23,42,0.42)] backdrop-blur">
          {isAdmin ? (
            <Link href="/ops/admin" onClick={() => setOpen(false)} className={menuItemClass}>
              Admin Center
            </Link>
          ) : null}
          <Link href="/account" onClick={() => setOpen(false)} className={menuItemClass}>
            Account
          </Link>
          <div className="my-1.5 border-t border-slate-200/80" />
          <LogoutButton className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900" />
        </div>
      ) : null}
    </div>
  );
}
