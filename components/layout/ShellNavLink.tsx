"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  exact?: boolean;
  className?: string;
};

function isActivePath(pathname: string, href: string, exact: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function ShellNavLink({ href, children, exact = false, className = "" }: Props) {
  const pathname = usePathname() || "/";
  const active = isActivePath(pathname, href, exact);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70",
        active
          ? "border-slate-300 bg-slate-900 text-white shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)]"
          : "border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950",
        className,
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
