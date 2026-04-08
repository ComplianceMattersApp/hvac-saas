import Link from "next/link";
import { redirect } from "next/navigation";
import { saveInternalBusinessProfileFromForm } from "@/lib/actions/internal-business-profile-actions";
import {
  getInternalBusinessProfileByAccountOwnerId,
  resolveInternalBusinessProfileLogoUrl,
} from "@/lib/business/internal-business-profile";
import {
  isInternalAccessError,
  requireInternalRole,
} from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ notice?: string }>;

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  saved: { tone: "success", message: "Your company details have been saved." },
  display_name_required: { tone: "error", message: "Enter your company name before saving." },
  invalid_support_email: { tone: "error", message: "Enter a valid support email, or leave it blank." },
  invalid_logo_file: { tone: "error", message: "Upload an image file for your logo." },
  logo_too_large: { tone: "error", message: "Logo files must be 5 MB or smaller." },
  save_failed: { tone: "error", message: "We couldn't save your company details. Please try again." },
};

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

async function requireAdminOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  try {
    const authz = await requireInternalRole("admin", { supabase, userId: user.id });
    return { supabase, userId: user.id, internalUser: authz.internalUser };
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: cu, error: cuErr } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cuErr) throw cuErr;
      if (cu?.contractor_id) redirect("/portal");
      redirect("/ops");
    }

    throw error;
  }
}

export default async function AdminCompanyProfilePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const notice = NOTICE_TEXT[String(sp.notice ?? "").trim().toLowerCase()];

  const { supabase, internalUser } = await requireAdminOrRedirect();
  const profile = await getInternalBusinessProfileByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  const currentLogoUrl = await resolveInternalBusinessProfileLogoUrl({
    logoUrl: profile?.logo_url ?? null,
  });
  const companyName = String(profile?.display_name ?? "").trim() || "Your Company";
  const supportEmail = String(profile?.support_email ?? "").trim();
  const supportPhone = String(profile?.support_phone ?? "").trim();
  const companyInitial = companyName.charAt(0).toUpperCase() || "C";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_55%,rgba(236,253,245,0.72))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)]">
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-emerald-100/70 blur-3xl" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Company Profile</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">Make your company feel at home in the app</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Add your company name, support contact details, and logo so your team sees a polished, familiar experience.
            </p>
            <div className="inline-flex items-center rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              Shown in select internal views, emails, and support touchpoints
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/ops/admin"
              className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-50"
            >
              Admin Home
            </Link>
            <Link
              href="/ops"
              className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-50"
            >
              Ops
            </Link>
          </div>
        </div>
      </div>

      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)]">
          <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
            <div className="text-sm font-semibold text-slate-950">Brand Preview</div>
            <div className="mt-1 text-sm text-slate-600">A quick look at how your company appears today.</div>
          </div>
          <div className="space-y-4 p-5">
            <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.25)]">
                  {currentLogoUrl ? (
                    <img src={currentLogoUrl} alt={`${companyName} logo`} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(15,23,42,0.06),rgba(15,23,42,0.12))] text-2xl font-semibold text-slate-600">
                      {companyInitial}
                    </div>
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Company</div>
                  <div className="break-words text-xl font-semibold tracking-[-0.02em] text-slate-950">{companyName}</div>
                </div>
              </div>

                {supportEmail || supportPhone ? (
                  <div className="space-y-0.5 border-t border-slate-200/80 pt-3 text-sm leading-6 text-slate-600">
                    {supportEmail ? <div>{supportEmail}</div> : null}
                    {supportPhone ? <div>{supportPhone}</div> : null}
                  </div>
                ) : (
                  <div className="border-t border-slate-200/80 pt-3 text-sm leading-6 text-slate-600">
                    Add support contact details so your team can find the right info faster.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-600">
              {currentLogoUrl
                ? "Upload a new logo anytime to refresh how your company appears in the app."
                : "Upload a logo to give your workspace a more polished, familiar look."}
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)]">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Company details</h2>
            <p className="text-sm leading-6 text-slate-600">
              Keep your company name, support email, phone number, and logo current.
            </p>
          </div>

          <form action={saveInternalBusinessProfileFromForm} className="mt-6 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-950">Logo</div>
                  <div className="text-sm leading-6 text-slate-600">
                    Upload a clear logo for a more polished experience across the app.
                  </div>
                </div>

                {currentLogoUrl ? (
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="remove_logo" value="1" className="h-4 w-4 rounded border-slate-300 text-slate-900" />
                    Remove logo
                  </label>
                ) : null}
              </div>

              <div className="mt-4">
                <input
                  id="logo_file"
                  name="logo_file"
                  type="file"
                  accept="image/*"
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
                />
                <p className="mt-2 text-xs text-slate-500">PNG, JPG, SVG, or WebP. Up to 5 MB.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="display_name" className="text-sm font-medium text-slate-700">
                  Company name
                </label>
                <input
                  id="display_name"
                  name="display_name"
                  defaultValue={profile?.display_name ?? ""}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="Compliance Matters"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="support_email" className="text-sm font-medium text-slate-700">
                  Support email
                </label>
                <input
                  id="support_email"
                  name="support_email"
                  type="email"
                  defaultValue={profile?.support_email ?? ""}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="support@company.com"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="support_phone" className="text-sm font-medium text-slate-700">
                  Support phone
                </label>
                <input
                  id="support_phone"
                  name="support_phone"
                  defaultValue={profile?.support_phone ?? ""}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="(209) 555-1234"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
              {profile
                ? "These details help your company look polished and familiar throughout the app."
                : "Add your company details once, and we’ll use them anywhere your team expects to see them."}
            </div>

            <div className="flex items-center justify-end">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4.5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_30px_-22px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_22px_34px_-22px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
              >
                Save changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}