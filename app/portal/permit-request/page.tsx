import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import PortalAccessIssue from "@/components/portal/PortalAccessIssue";
import {
  portalNarrowPageClass,
  portalPanelClass,
  portalSecondaryButtonClass,
} from "@/components/portal/PortalChrome";
import {
  getContractorPermitRequestSurfaceAvailability,
} from "@/lib/actions/permit-request-actions";
import { requireCurrentContractorPortalContext } from "@/lib/portal/intake-proposal-read-model";
import {
  listContractorPermitRequestReceipts,
  type ContractorPermitRequestReceipt,
  type ContractorPermitRequestReceiptsClient,
} from "@/lib/permits/contractor-permit-request-receipts";
import ContractorPermitRequestUploadForm from "./ContractorPermitRequestUploadForm";

function formatSubmittedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function receiptStatusToneClass(status: ContractorPermitRequestReceipt["status"]) {
  if (status === "permit_created") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300";
  }
  if (status === "on_hold_additional_info_needed") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300";
  }
  if (status === "not_needed") {
    return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
  }
  return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300";
}

export default async function ContractorPermitRequestPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const surface = await (async () => {
    try {
      const context = await requireCurrentContractorPortalContext({ supabase });
      const availability = await getContractorPermitRequestSurfaceAvailability({ supabase });
      return { context, availability };
    } catch (error) {
      const code = String((error as Error)?.message ?? "").trim().toUpperCase();
      if (code === "NOT_AUTHENTICATED") redirect("/login");
      if (code === "NOT_CONTRACTOR") return null;
      if (code === "CONTRACTOR_ARCHIVED") redirect("/login?err=contractor_archived");
      throw error;
    }
  })();
  if (!surface) return <PortalAccessIssue />;

  const { context, availability } = surface;

  // The receipt list is the contractor's proof of submission. Never let a read
  // failure here take down the page they use to send work in.
  const receipts = availability.schemaAvailable
    ? await listContractorPermitRequestReceipts({
        // Narrow structural client — avoids typechecking the full Supabase
        // generic surface for the two reads this list needs.
        admin: createAdminClient() as unknown as ContractorPermitRequestReceiptsClient,
        contractorId: context.contractorId,
        accountOwnerUserId: context.accountOwnerUserId,
      }).catch(() => [] as ContractorPermitRequestReceipt[])
    : [];

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

      {availability.schemaAvailable ? (
        <section className={portalPanelClass}>
          <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">
            Your permit requests
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Every request you send appears here with its reference number. If a request is listed, Compliance Matters has it.
          </p>

          {receipts.length === 0 ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              You have not sent a permit request yet.
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {receipts.map((receipt) => (
                <li
                  key={receipt.id}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {receipt.referenceCode}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold ${receiptStatusToneClass(receipt.status)}`}
                    >
                      {receipt.statusLabel}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Sent {formatSubmittedAt(receipt.createdAt)}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {receipt.attachmentCount} {receipt.attachmentCount === 1 ? "file" : "files"}
                    </span>
                  </div>
                  {receipt.note ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {receipt.note}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
