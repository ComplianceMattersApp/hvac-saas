"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import LogoutButton from "@/components/auth/LogoutButton";

type Props = {
  accountFirstName: string;
  accountLabel: string;
  isAdmin: boolean;
};

export default function UserAccountMenu({ accountFirstName, accountLabel, isAdmin }: Props) {
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
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:px-4 sm:py-2 sm:text-sm"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-300 bg-slate-50 px-1 text-[10px] font-semibold text-slate-700">
            {accountFirstName ? accountFirstName.slice(0, 1).toUpperCase() : "A"}
          </span>
          <span>{accountLabel}</span>
          <span className="text-slate-500">Settings</span>
        </span>
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 min-w-44 rounded-md border border-slate-200 bg-white p-1 shadow-lg"
          onClickCapture={() => setOpen(false)}
        >
          {isAdmin ? (
            <Link
              href="/ops/admin"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Admin
            </Link>
          ) : null}
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Profile
          </Link>
          <div className="my-1 border-t border-slate-100" />
          <LogoutButton className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900" />
        </div>
      ) : null}
    </div>
  );
}
