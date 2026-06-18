import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveDualContextAccess } from "@/lib/auth/dual-context-access";
import { portalAccessFallbackPathForAccess } from "@/lib/auth/portal-route-guard";
import {
  portalNarrowPageClass,
  portalPanelClass,
  portalSecondaryButtonClass,
} from "@/components/portal/PortalChrome";
import {
  getContractorPermitRequestSurfaceAvailability,
} from "@/lib/actions/permit-request-actions";
import ContractorPermitRequestUploadForm from "./ContractorPermitRequestUploadForm";

export default async function ContractorPermitRequestPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");
  const access = await resolveDualContextAccess({
    supabase,
    user: userData.user,
  });

  const availability = await (async () => {
    try {
      return await getContractorPermitRequestSurfaceAvailability({ supabase });
    } catch (error) {
      const code = String((error as Error)?.message ?? "").trim().toUpperCase();
      if (code === "NOT_AUTHENTICATED") redirect("/login");
      if (code === "NOT_CONTRACTOR") redirect(portalAccessFallbackPathForAccess(access));
      if (code === "CONTRACTOR_ARCHIVED") redirect("/login?err=contractor_archived");
      throw error;
    }
  })();

  return (
    <div className={portalNarrowPageClass}>
      <div>
        <Link href="/portal" className={portalSecondaryButtonClass}>
          Back to portal
        </Link>
      </div>

      <section className={portalPanelClass}>
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Permit request
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100 sm:text-3xl">
            Send a permit document
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Upload a contract photo, permit packet, or PDF. Compliance Matters will review it and complete the permit intake.
          </p>
        </div>
      </section>

      <section className={portalPanelClass}>
        {availability.schemaAvailable ? (
          <ContractorPermitRequestUploadForm />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Permit requests are temporarily unavailable. Please contact Compliance Matters for help.
          </div>
        )}
      </section>
    </div>
  );
}
