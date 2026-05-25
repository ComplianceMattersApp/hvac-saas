"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import LogoutButton from "@/components/auth/LogoutButton";

type Props = {
  isInternalUser: boolean;
  isAdmin: boolean;
  isEstimatesEnabled: boolean;
  servicePlansEnabled: boolean;
  showOperationalNotificationAwareness: boolean;
  unreadNotificationCount: number;
  unreadNotificationBadgeLabel: string;
  primaryJobCtaLabel: string;
};

function isActivePath(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function mobileMenuItemClass(active = false) {
  return [
    "block rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
    active
      ? "border-slate-300 bg-slate-900 text-white"
      : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50",
  ].join(" ");
}

function sectionLabelClass() {
  return "px-3 pb-1 pt-2 text-[11px] font-semibold uppercase text-slate-400";
}

export default function MobileShellMenu({
  isInternalUser,
  isAdmin,
  isEstimatesEnabled,
  servicePlansEnabled,
  showOperationalNotificationAwareness,
  unreadNotificationCount,
  unreadNotificationBadgeLabel,
  primaryJobCtaLabel,
}: Props) {
  const pathname = usePathname() || "/";
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

  const closeMenu = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative shrink-0 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="list-none rounded-xl border border-slate-300/80 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-[0_10px_18px_-16px_rgba(15,23,42,0.3)] transition-colors hover:bg-slate-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      >
        <span className="inline-flex items-center gap-1.5">
          <MenuIcon className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <span>Menu</span>
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 max-h-[calc(100vh-5.5rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_18px_38px_-24px_rgba(15,23,42,0.38)] backdrop-blur">
          <div className={sectionLabelClass()}>Create</div>
          <Link href="/jobs/new" onClick={closeMenu} className="block rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-[0_12px_20px_-16px_rgba(37,99,235,0.55)] transition-colors hover:bg-blue-700">
            {primaryJobCtaLabel}
          </Link>
          {isInternalUser ? (
            <Link href="/jobs/new?create_customer=1" onClick={closeMenu} className={mobileMenuItemClass()}>
              New Customer
            </Link>
          ) : null}
          {isInternalUser && isEstimatesEnabled ? (
            <Link href="/estimates/new" onClick={closeMenu} className={mobileMenuItemClass()}>
              New Estimate
            </Link>
          ) : null}
          {isInternalUser && servicePlansEnabled ? (
            <Link href="/service-plans" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/service-plans"))}>
              New Service Plan
            </Link>
          ) : null}

          <div className="my-1.5 border-t border-slate-200/80" />
          <div className={sectionLabelClass()}>Work</div>
          <Link href="/jobs" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/jobs"))}>
            Jobs
          </Link>
          {isInternalUser ? (
            <Link href="/calendar" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/calendar"))}>
              Calendar
            </Link>
          ) : null}
          {isInternalUser ? (
            <Link href="/ops/field" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/ops/field", true))}>
              My Work
            </Link>
          ) : null}
          <Link href="/customers" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/customers"))}>
            Customers
          </Link>
          {isInternalUser && servicePlansEnabled ? (
            <Link href="/service-plans" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/service-plans"))}>
              Service Plans
            </Link>
          ) : null}
          {isInternalUser && isEstimatesEnabled ? (
            <Link href="/estimates" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/estimates"))}>
              Estimates
            </Link>
          ) : null}

          {isInternalUser ? (
            <>
              <div className="my-1.5 border-t border-slate-200/80" />
              <div className={sectionLabelClass()}>Business</div>
              <Link href="/reports" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/reports"))}>
                Reports
              </Link>
              <Link href="/time-clock" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/time-clock"))}>
                Time Clock
              </Link>
              <Link href="/notes" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/notes"))}>
                Notes
              </Link>
            </>
          ) : null}

          {isInternalUser && showOperationalNotificationAwareness ? (
            <>
              <div className="my-1.5 border-t border-slate-200/80" />
              <Link
                href="/ops/notifications"
                onClick={closeMenu}
                className="flex items-center justify-between gap-2 rounded-xl border border-transparent px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-200 hover:bg-slate-50"
              >
                <span>Notifications</span>
                {unreadNotificationCount > 0 ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-1.5 text-[11px] font-semibold text-blue-700 shadow-[0_6px_12px_-10px_rgba(37,99,235,0.45)]">
                    {unreadNotificationBadgeLabel}
                  </span>
                ) : null}
              </Link>
            </>
          ) : null}

          <div className="my-1.5 border-t border-slate-200/80" />
          {isAdmin ? (
            <Link href="/ops/admin" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/ops/admin"))}>
              Admin Center
            </Link>
          ) : null}
          <Link href="/account" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/account"))}>
            Account
          </Link>
          <LogoutButton className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900" />
        </div>
      ) : null}
    </div>
  );
}
