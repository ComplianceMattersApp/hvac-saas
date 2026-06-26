"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BriefcaseBusiness, CalendarDays, ClipboardList, FileText, Home, Menu as MenuIcon, Settings, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LogoutButton from "@/components/auth/LogoutButton";
import HeaderCustomerSearch from "@/components/layout/HeaderCustomerSearch";
import { OPS_NAV_QUEUE_LINKS } from "@/lib/ops/ops-nav-queue-links";

type Props = {
  isInternalUser: boolean;
  isAdmin: boolean;
  isEstimatesEnabled: boolean;
  showPermitRequestCreateItem: boolean;
  servicePlansEnabled: boolean;
  showOperationalNotificationAwareness: boolean;
  showPartnerWorkMenuItem: boolean;
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
    "flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
    active
      ? "border-slate-300 bg-slate-900 text-white shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)]"
      : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950",
  ].join(" ");
}

function sectionLabelClass() {
  return "px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400";
}

function itemIconClass(active = false) {
  return active ? "h-4 w-4 text-white/80" : "h-4 w-4 text-slate-400";
}

export default function MobileShellMenu({
  isInternalUser,
  isAdmin,
  isEstimatesEnabled,
  showPermitRequestCreateItem,
  servicePlansEnabled,
  showOperationalNotificationAwareness,
  showPartnerWorkMenuItem,
  unreadNotificationCount,
  unreadNotificationBadgeLabel,
  primaryJobCtaLabel,
}: Props) {
  const pathname = usePathname() || "/";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      const sheet = sheetRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (!root.contains(event.target) && !sheet?.contains(event.target)) {
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

  const todayActive = isActivePath(pathname, "/today", true);
  const operationsActive = isActivePath(pathname, "/ops");
  const calendarActive = isActivePath(pathname, "/calendar");
  const fieldActive = isActivePath(pathname, "/ops/field", true);
  const portalActive = isActivePath(pathname, "/portal");
  const customersActive = isActivePath(pathname, "/customers");
  const servicePlansActive = isActivePath(pathname, "/service-plans");
  const estimatesActive = isActivePath(pathname, "/estimates");
  const reportsActive = isActivePath(pathname, "/reports");
  const notificationsActive = isActivePath(pathname, "/ops/notifications");
  const adminActive = isActivePath(pathname, "/ops/admin");
  const accountActive = isActivePath(pathname, "/account");
  const sheet =
    open && mounted
      ? createPortal(
          <>
            <div className="fixed inset-0 z-40 bg-slate-950/24 backdrop-blur-[2px]" aria-hidden="true" />
            <div
              ref={sheetRef}
              className="fixed inset-x-2 bottom-2 z-50 max-h-[min(42rem,calc(100dvh-5.25rem))] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_28px_70px_-34px_rgba(15,23,42,0.62)]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-950">Command Menu</div>
                  <div className="text-xs font-medium text-slate-500">Find work, customers, and tools</div>
                </div>
                <button
                  type="button"
                  onClick={closeMenu}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="max-h-[calc(min(42rem,100dvh-5.25rem)-3.75rem)] overflow-y-auto p-3">
                {isInternalUser ? (
                  <div className="mb-3">
                    <HeaderCustomerSearch compact onNavigate={closeMenu} />
                  </div>
                ) : null}

                {isInternalUser ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Link href="/jobs/new" onClick={closeMenu} className="rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-[0_12px_20px_-16px_rgba(37,99,235,0.55)] transition-colors hover:bg-blue-700">
                        {primaryJobCtaLabel}
                      </Link>
                      <Link href="/jobs/new?create_customer=1" onClick={closeMenu} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50">
                        New Customer
                      </Link>
                      {showPermitRequestCreateItem ? (
                        <Link href="/ops?bucket=permits&create=permit_request#permit-request-create" onClick={closeMenu} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50">
                          Permit Request
                        </Link>
                      ) : null}
                      {isEstimatesEnabled ? (
                        <Link href="/estimates/new" onClick={closeMenu} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50">
                          New Estimate
                        </Link>
                      ) : null}
                      {servicePlansEnabled ? (
                        <Link href="/service-plans" onClick={closeMenu} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50">
                          New Service Plan
                        </Link>
                      ) : null}
                    </div>
                  </>
                ) : null}

                <div className={sectionLabelClass()}>Work</div>
                <div className="grid grid-cols-2 gap-1">
                  {isInternalUser ? (
                    <Link href="/today" onClick={closeMenu} className={mobileMenuItemClass(todayActive)}>
                      <Home className={itemIconClass(todayActive)} aria-hidden="true" />
                      Today
                    </Link>
                  ) : null}
                  {isInternalUser ? (
                    <Link href="/ops" onClick={closeMenu} className={mobileMenuItemClass(operationsActive)}>
                      <ClipboardList className={itemIconClass(operationsActive)} aria-hidden="true" />
                      Operations
                    </Link>
                  ) : null}
                  {isInternalUser ? (
                    <div className="col-span-2 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50/70 p-1">
                      {OPS_NAV_QUEUE_LINKS.map((item) => (
                        <Link
                          key={item.bucket}
                          href={item.href}
                          onClick={closeMenu}
                          className="min-h-9 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-white hover:text-slate-950"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {isInternalUser ? (
                    <Link href="/calendar" onClick={closeMenu} className={mobileMenuItemClass(calendarActive)}>
                      <CalendarDays className={itemIconClass(calendarActive)} aria-hidden="true" />
                      Calendar
                    </Link>
                  ) : null}
                  {isInternalUser ? (
                    <Link href="/ops/field" onClick={closeMenu} className={mobileMenuItemClass(fieldActive)}>
                      <BriefcaseBusiness className={itemIconClass(fieldActive)} aria-hidden="true" />
                      My Work
                    </Link>
                  ) : null}
                  {showPartnerWorkMenuItem ? (
                    <Link href="/portal" onClick={closeMenu} className={mobileMenuItemClass(portalActive)}>
                      <BriefcaseBusiness className={itemIconClass(portalActive)} aria-hidden="true" />
                      Partner Work
                    </Link>
                  ) : null}
                  {isInternalUser ? (
                    <Link href="/customers" onClick={closeMenu} className={mobileMenuItemClass(customersActive)}>
                      <UserRound className={itemIconClass(customersActive)} aria-hidden="true" />
                      Customers
                    </Link>
                  ) : null}
                  {isInternalUser && servicePlansEnabled ? (
                    <Link href="/service-plans" onClick={closeMenu} className={mobileMenuItemClass(servicePlansActive)}>
                      <FileText className={itemIconClass(servicePlansActive)} aria-hidden="true" />
                      Service Plans
                    </Link>
                  ) : null}
                  {isInternalUser && isEstimatesEnabled ? (
                    <Link href="/estimates" onClick={closeMenu} className={mobileMenuItemClass(estimatesActive)}>
                      <FileText className={itemIconClass(estimatesActive)} aria-hidden="true" />
                      Estimates
                    </Link>
                  ) : null}
                </div>

                {isInternalUser ? (
                  <>
                    <div className={sectionLabelClass()}>Business</div>
                    <div className="grid grid-cols-2 gap-1">
                      <Link href="/reports" onClick={closeMenu} className={mobileMenuItemClass(reportsActive)}>
                        <FileText className={itemIconClass(reportsActive)} aria-hidden="true" />
                        Reports
                      </Link>
                      <Link href="/time-clock" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/time-clock"))}>
                        <Settings className={itemIconClass(isActivePath(pathname, "/time-clock"))} aria-hidden="true" />
                        Time Clock
                      </Link>
                      <Link href="/notes" onClick={closeMenu} className={mobileMenuItemClass(isActivePath(pathname, "/notes"))}>
                        <FileText className={itemIconClass(isActivePath(pathname, "/notes"))} aria-hidden="true" />
                        Notes
                      </Link>
                    </div>
                  </>
                ) : null}

                {isInternalUser && showOperationalNotificationAwareness ? (
                  <>
                    <div className={sectionLabelClass()}>Signals</div>
                    <Link href="/ops/notifications" onClick={closeMenu} className={mobileMenuItemClass(notificationsActive)}>
                      <Bell className={itemIconClass(notificationsActive)} aria-hidden="true" />
                      <span className="min-w-0 flex-1">Notifications</span>
                      {unreadNotificationCount > 0 ? (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-1.5 text-[11px] font-semibold text-blue-700 shadow-[0_6px_12px_-10px_rgba(37,99,235,0.45)]">
                          {unreadNotificationBadgeLabel}
                        </span>
                      ) : null}
                    </Link>
                  </>
                ) : null}

                <div className={sectionLabelClass()}>Account</div>
                <div className="grid grid-cols-2 gap-1">
                  {isAdmin ? (
                    <Link href="/ops/admin" onClick={closeMenu} className={mobileMenuItemClass(adminActive)}>
                      <Settings className={itemIconClass(adminActive)} aria-hidden="true" />
                      Admin Center
                    </Link>
                  ) : null}
                  <Link href="/account" onClick={closeMenu} className={mobileMenuItemClass(accountActive)}>
                    <UserRound className={itemIconClass(accountActive)} aria-hidden="true" />
                    Account
                  </Link>
                </div>
                <LogoutButton className="mt-2 w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900" />
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

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

      {sheet}
    </div>
  );
}
