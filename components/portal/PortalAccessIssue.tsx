import Link from "next/link";
import { portalNarrowPageClass, portalPanelClass } from "@/components/portal/PortalChrome";

export default function PortalAccessIssue() {
  return (
    <div className={portalNarrowPageClass}>
      <section className={portalPanelClass}>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          Portal access
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-100">
          We could not load your portal access.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Your account is signed in, but we could not resolve the contractor portal context needed for this page. Please contact support.
        </p>
        <div className="mt-5">
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back to login
          </Link>
        </div>
      </section>
    </div>
  );
}
