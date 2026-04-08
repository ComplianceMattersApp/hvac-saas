import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveHumanDisplayName } from "@/lib/utils/identity-display";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  title: "Account",
};

function formatPhone(phone?: string | null) {
  const raw = String(phone ?? "").trim();
  if (!raw) return "No phone number on file";

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return raw;
}

function readBanner(searchParams: Record<string, string | string[] | undefined>) {
  const raw = searchParams.banner;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value ?? "").trim().toLowerCase();
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const banner = readBanner(sp);

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  if (!user) redirect("/login");

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const userMetadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName = resolveHumanDisplayName({
    profileFullName: profileRow?.full_name,
    metadataName: userMetadata.name,
    metadataFullName: userMetadata.full_name,
    metadataFirstName: userMetadata.first_name,
    metadataLastName: userMetadata.last_name,
    metadataGivenName: userMetadata.given_name,
    email: user.email,
    fallback: "Account",
  });
  const email = String(user.email ?? "").trim() || "No email on file";
  const phone =
    String(userMetadata.phone ?? "").trim() ||
    String(userMetadata.phone_number ?? "").trim() ||
    String(user.phone ?? "").trim();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 text-gray-900 sm:p-6">
      {banner === "profile_updated" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Profile updated.
        </div>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-slate-50/80 p-5 shadow-sm sm:p-7">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Account
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {displayName}
          </h1>
          <p className="max-w-xl text-sm text-slate-600 sm:text-base">
            This is your account profile. Keep your display name current so activity history is easier to read.
          </p>
          <div className="pt-2">
            <Link
              href="/account/edit"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Edit Profile
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-slate-900">Profile Details</h2>
          <p className="mt-1 text-sm text-slate-600">Display name is primary. Email remains available for reporting and account reference.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:px-6 sm:py-6">
          <div className="rounded-xl border border-gray-200 bg-slate-50/70 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Display Name</div>
            <div className="mt-1 text-sm font-medium text-slate-900 sm:text-base">{displayName || "Account"}</div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-slate-50/70 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</div>
            <div className="mt-1 break-all text-sm font-medium text-slate-900 sm:text-base">{email}</div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-slate-50/70 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone Number</div>
            <div className="mt-1 text-sm font-medium text-slate-900 sm:text-base">{formatPhone(phone)}</div>
          </div>
        </div>
      </section>
    </div>
  );
}