import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requireInternalUser,
  isInternalAccessError,
} from "@/lib/auth/internal-user";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";
import { getEstimateById } from "@/lib/estimates/estimate-read";
import {
  buildEstimateDocumentViewModel,
  ESTIMATE_DOCUMENT_DISCLAIMERS,
} from "@/lib/estimates/estimate-document";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import PrintToolbar from "./PrintToolbar";

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type CustomerRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type LocationRow = {
  id: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  nickname: string | null;
};

export const metadata = { title: "Estimate Print" };

export default async function EstimatePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];
  try {
    const result = await requireInternalUser({ supabase, userId: user.id });
    internalUser = result.internalUser;
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  if (!isEstimatesEnabled()) {
    redirect("/ops?notice=estimates_unavailable");
  }

  const estimate = await getEstimateById({ estimateId: id, internalUser, supabase });
  if (!estimate) notFound();

  let customerName: string | null = null;
  let customerEmail: string | null = null;
  let locationDisplay: string | null = null;

  if (estimate.customer_id) {
    const { data: cRow } = await supabase
      .from("customers")
      .select("id, full_name, first_name, last_name, email")
      .eq("id", estimate.customer_id)
      .maybeSingle();
    const c = cRow as CustomerRow | null;
    if (c) {
      customerName =
        String(c.full_name ?? "").trim() ||
        [c.first_name, c.last_name].filter(Boolean).join(" ") ||
        "Customer";
      customerEmail = String(c.email ?? "").trim() || null;
    }
  }

  if (estimate.location_id) {
    const { data: lRow } = await supabase
      .from("locations")
      .select("id, address_line1, address_line2, city, state, zip, nickname")
      .eq("id", estimate.location_id)
      .maybeSingle();
    const l = lRow as LocationRow | null;
    if (l) {
      locationDisplay =
        l.nickname ||
        [l.address_line1, l.address_line2, [l.city, l.state, l.zip].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ") ||
        "Location";
    }
  }

  const documentView = buildEstimateDocumentViewModel({
    estimate,
    customerName,
    locationDisplay,
  });

  const tenantIdentity = await resolveOperationalTenantIdentity({
    accountOwnerUserId: internalUser.account_owner_user_id,
    supabase,
  });
  const hasLogo = String(tenantIdentity.logoUrl ?? "").trim().length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 bg-slate-50/40 p-4 text-slate-900 sm:p-6 print:max-w-none print:bg-white print:p-0">
      <PrintToolbar backHref={`/estimates/${id}`} />

      <section className="overflow-hidden rounded-2xl border border-slate-300/80 bg-white shadow-[0_22px_48px_-38px_rgba(15,23,42,0.34)] print:rounded-none print:border-slate-300 print:shadow-none">
        <div className="border-b border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] px-6 py-5 print:px-4 print:py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-800">Quote / Proposal</div>
          {hasLogo ? (
            <img
              src={String(tenantIdentity.logoUrl)}
              alt=""
              className="mt-2 block max-h-12 max-w-[180px] object-contain"
            />
          ) : (
            <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{tenantIdentity.displayName}</div>
          )}
        </div>

        <div className="px-6 py-5 print:px-4 print:py-4">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 print:text-2xl">
            {documentView.identity.title}
          </h1>
          <p className="mt-1 text-sm font-mono text-slate-600">{documentView.identity.estimateNumber}</p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-x-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 print:border-slate-300 print:bg-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Quote Summary</div>
              <dl className="mt-2 space-y-1.5 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-4">
                  <dt>Estimate #</dt>
                  <dd className="font-semibold text-slate-900">{documentView.identity.estimateNumber}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>Created</dt>
                  <dd className="font-semibold text-slate-900">{formatDate(documentView.lifecycle.createdAt)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>Status</dt>
                  <dd className="font-semibold text-slate-900">{documentView.identity.statusLabel}</dd>
                </div>
                {documentView.proposalMode === "single_option_flat" ? (
                  <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2 text-base print:border-slate-300">
                    <dt className="font-semibold text-slate-900">Proposed Total</dt>
                    <dd className="font-bold text-slate-950">{formatCents(documentView.totals.totalCents)}</dd>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2 text-base print:border-slate-300">
                    <dt className="font-semibold text-slate-900">Proposal Type</dt>
                    <dd className="font-semibold text-slate-900">Multi-Option</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 print:border-slate-300 print:bg-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Customer / Location</div>
              <div className="mt-2 text-sm text-slate-700">
                <div>
                  <span className="font-semibold text-slate-900">Customer:</span>{" "}
                  {documentView.context.customerName ?? "Not set"}
                </div>
                {customerEmail ? (
                  <div className="mt-1">
                    <span className="font-semibold text-slate-900">Email:</span> {customerEmail}
                  </div>
                ) : null}
                <div className="mt-1">
                  <span className="font-semibold text-slate-900">Location:</span>{" "}
                  {documentView.context.locationDisplay ?? "Not set"}
                </div>
              </div>
            </div>
          </div>

          {documentView.proposalMode === "multi_option_packages" ? (
            <>
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 print:border-amber-300 print:bg-white">
                <p className="font-semibold">Multiple Options Included</p>
                <p className="mt-1">This proposal includes multiple options. Totals are shown per option; no option has been selected in this document.</p>
                <p className="mt-1 text-xs text-amber-800">Compare each option and select the one that best fits your needs.</p>
              </div>

              {documentView.options.length === 0 ? (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600 print:border-slate-300 print:bg-white">
                  No option packages have been added to this proposal.
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  {documentView.options.map((option) => (
                    <div key={option.id} className="overflow-hidden rounded-xl border border-slate-200 print:rounded-none print:border-slate-300">
                      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 print:border-slate-300 print:bg-white">
                        <div className="text-base font-semibold text-slate-950">{option.label}</div>
                        {option.summary ? (
                          <div className="mt-0.5 text-sm text-slate-600">{option.summary}</div>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(5rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)] gap-3 border-b border-slate-200 bg-slate-50/50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 print:border-slate-300 print:bg-white">
                        <div>Description</div>
                        <div className="text-right">Qty</div>
                        <div className="text-right">Unit Price</div>
                        <div className="text-right">Subtotal</div>
                      </div>

                      {option.lines.length === 0 ? (
                        <div className="px-4 py-4 text-sm text-slate-500">No line items added for this option.</div>
                      ) : (
                        <div className="divide-y divide-slate-200 print:divide-slate-300">
                          {option.lines.map((line) => (
                            <div
                              key={line.id}
                              className="grid break-inside-avoid grid-cols-[minmax(0,2.2fr)_minmax(5rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)] gap-3 bg-white px-4 py-3 text-sm"
                            >
                              <div>
                                <div className="font-semibold text-slate-900">{line.itemName}</div>
                                {line.description ? (
                                  <div className="mt-0.5 text-xs leading-5 text-slate-600">{line.description}</div>
                                ) : null}
                              </div>
                              <div className="text-right text-slate-700">{line.quantity % 1 === 0 ? line.quantity : line.quantity.toFixed(2)}</div>
                              <div className="text-right text-slate-700">{formatCents(line.unitPriceCents)}</div>
                              <div className="text-right font-semibold text-slate-900">{formatCents(line.lineSubtotalCents)}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-6 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-slate-900 print:border-slate-300 print:bg-white">
                        <span>Option Total</span>
                        <span>{formatCents(option.totalCents)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 print:rounded-none print:border-slate-300">
              <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(5rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)] gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 print:border-slate-300 print:bg-white">
                <div>Description</div>
                <div className="text-right">Qty</div>
                <div className="text-right">Unit Price</div>
                <div className="text-right">Subtotal</div>
              </div>
              {documentView.lines.length === 0 ? (
                <div className="px-4 py-4 text-sm text-slate-600">No estimate lines were recorded.</div>
              ) : (
                <div className="divide-y divide-slate-200 print:divide-slate-300">
                  {documentView.lines.map((line) => (
                    <div
                      key={line.id}
                      className="grid break-inside-avoid grid-cols-[minmax(0,2.2fr)_minmax(5rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)] gap-3 bg-white px-4 py-3 text-sm"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{line.itemName}</div>
                        {line.description ? (
                          <div className="mt-0.5 text-xs leading-5 text-slate-600">{line.description}</div>
                        ) : null}
                      </div>
                      <div className="text-right text-slate-700">{line.quantity % 1 === 0 ? line.quantity : line.quantity.toFixed(2)}</div>
                      <div className="text-right text-slate-700">{formatCents(line.unitPriceCents)}</div>
                      <div className="text-right font-semibold text-slate-900">{formatCents(line.lineSubtotalCents)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-end gap-6 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-slate-900 print:border-slate-300 print:bg-white">
                <span>Proposed Total</span>
                <span>{formatCents(documentView.totals.totalCents)}</span>
              </div>
            </div>
          )}

          {estimate.notes ? (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 print:border-slate-300 print:bg-white">
              <p className="font-semibold text-slate-900">Proposal Notes</p>
              <p className="mt-1 whitespace-pre-wrap">{estimate.notes}</p>
            </div>
          ) : null}

          <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 print:border-slate-300">
            <p>
              {ESTIMATE_DOCUMENT_DISCLAIMERS.join(" ")}
            </p>
            <p className="mt-1">
              Questions? Contact {tenantIdentity.displayName}
              {[tenantIdentity.supportEmail, tenantIdentity.supportPhone].filter(Boolean).length > 0
                ? ` at ${[tenantIdentity.supportEmail, tenantIdentity.supportPhone].filter(Boolean).join(" or ")}`
                : ""}
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
