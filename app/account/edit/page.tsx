import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateOwnProfileFromForm } from "@/lib/actions/auth-actions";
import { createClient } from "@/lib/supabase/server";
import { resolveHumanDisplayName } from "@/lib/utils/identity-display";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  title: "Edit Profile",
};

function readBanner(searchParams: Record<string, string | string[] | undefined>) {
  const raw = searchParams.banner;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value ?? "").trim().toLowerCase();
}

export default async function AccountEditPage({
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
  const phone =
    String(userMetadata.phone ?? "").trim() ||
    String(userMetadata.phone_number ?? "").trim() ||
    String(user.phone ?? "").trim();
  const email = String(user.email ?? "").trim() || "No email on file";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 text-gray-900 sm:p-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Account</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Edit Profile</h1>
            <p className="mt-2 text-sm text-slate-600">
              Update the personal details used across your account profile and activity history.
            </p>
          </div>
          <Link
            href="/account"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
          >
            Back
          </Link>
        </div>
      </section>

      {banner === "missing_name" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Please enter a display name.
        </div>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <form action={updateOwnProfileFromForm} className="space-y-4">
          <div>
            <label htmlFor="display_name" className="block text-sm font-medium text-slate-900">
              Display Name
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              defaultValue={displayName}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-slate-900"
              maxLength={120}
              required
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-900">
              Phone Number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={phone}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-slate-900"
              maxLength={40}
              placeholder="(555) 555-5555"
            />
            <div className="mt-1 text-xs text-slate-500">Used as your app-managed contact number. Leave blank to clear it.</div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-slate-50/70 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</div>
            <div className="mt-1 break-all text-sm font-medium text-slate-900">{email}</div>
            <div className="mt-1 text-xs text-slate-500">Email is used for sign-in and operational reporting references.</div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Link
              href="/account"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Save Profile
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
