"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import LogoutButton from "@/components/auth/LogoutButton";

type Props = {
  accountName: string;
  accountLabel: string;
  isAdmin: boolean;
  isInternalUser: boolean;
};

const menuItemClass =
  "block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50";

export default function UserAccountMenu({ accountName, accountLabel, isAdmin, isInternalUser }: Props) {
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
        className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-200/90 bg-slate-50 px-1 text-[10px] font-semibold text-slate-700">
            {accountName ? accountName.slice(0, 1).toUpperCase() : "A"}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="max-w-28 truncate xl:max-w-40">{accountLabel}</span>
            <span className="hidden text-slate-400 xl:inline">/</span>
            <span className="hidden text-slate-500 xl:inline">Account</span>
          </span>
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 min-w-48 rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_18px_38px_-24px_rgba(15,23,42,0.38)] backdrop-blur">
          {isAdmin ? (
            <Link href="/ops/admin" onClick={() => setOpen(false)} className={menuItemClass}>
              Admin Center
            </Link>
          ) : null}
          {isInternalUser ? (
            <Link href="/time-clock" onClick={() => setOpen(false)} className={menuItemClass}>
              Time Clock
            </Link>
          ) : null}
          {isInternalUser ? (
            <Link href="/notes" onClick={() => setOpen(false)} className={menuItemClass}>
              Notes
            </Link>
          ) : null}
          <Link href="/account" onClick={() => setOpen(false)} className={menuItemClass}>
            Account
          </Link>
          <div className="my-1.5 border-t border-slate-200/80" />
          <LogoutButton className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900" />
        </div>
      ) : null}
    </div>
  );
}
