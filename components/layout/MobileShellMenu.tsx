"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import LogoutButton from "@/components/auth/LogoutButton";

type Props = {
  isInternalUser: boolean;
  isAdmin: boolean;
  unreadNotificationCount: number;
  unreadNotificationBadgeLabel: string;
};

const mobileMenuItemClass =
  "block rounded-xl border border-transparent px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-200 hover:bg-slate-50";

export default function MobileShellMenu({
  isInternalUser,
  isAdmin,
  unreadNotificationCount,
  unreadNotificationBadgeLabel,
}: Props) {
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
    <div ref={rootRef} className="relative shrink-0 sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="list-none rounded-xl border border-slate-300/80 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-[0_10px_18px_-16px_rgba(15,23,42,0.3)] transition-colors hover:bg-slate-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] text-slate-600">
            ⋮
          </span>
          <span>Menu</span>
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_18px_38px_-24px_rgba(15,23,42,0.38)] backdrop-blur">
          <Link
            href="/jobs/new"
            onClick={() => setOpen(false)}
            className="block rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-[0_12px_20px_-16px_rgba(37,99,235,0.55)] transition-colors hover:bg-blue-700"
          >
            + New Job
          </Link>
          {isInternalUser ? (
            <Link
              href="/calendar"
              onClick={() => setOpen(false)}
              className={mobileMenuItemClass}
            >
              View Calendar
            </Link>
          ) : null}
          <Link
            href="/customers"
            onClick={() => setOpen(false)}
            className={mobileMenuItemClass}
          >
            Search Customers
          </Link>
          {isInternalUser ? (
            <Link
              href="/ops/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-2 rounded-xl border border-transparent px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-200 hover:bg-slate-50"
            >
              <span>Notifications</span>
              {unreadNotificationCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-1.5 text-[11px] font-semibold text-blue-700 shadow-[0_6px_12px_-10px_rgba(37,99,235,0.45)]">
                  {unreadNotificationBadgeLabel}
                </span>
              ) : null}
            </Link>
          ) : null}
          {isInternalUser ? (
            <Link
              href="/ops/field"
              onClick={() => setOpen(false)}
              className={mobileMenuItemClass}
            >
              My Work
            </Link>
          ) : null}
          {isAdmin ? (
            <Link
              href="/ops/admin"
              onClick={() => setOpen(false)}
              className={mobileMenuItemClass}
            >
              Admin
            </Link>
          ) : null}
          {isInternalUser ? (
            <Link
              href="/notes"
              onClick={() => setOpen(false)}
              className={mobileMenuItemClass}
            >
              Notes
            </Link>
          ) : null}
          <div className="my-1.5 border-t border-slate-200/80" />
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className={mobileMenuItemClass}
          >
            Profile
          </Link>
          <LogoutButton className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900" />
        </div>
      ) : null}
    </div>
  );
}