import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Account",
};

function firstNonEmpty(values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }

  return "";
}

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

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  if (!user) redirect("/login");

  const userMetadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName = firstNonEmpty([
    userMetadata.name,
    userMetadata.full_name,
    [userMetadata.first_name, userMetadata.last_name]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" "),
    userMetadata.given_name,
    user.email,
  ]);
  const firstName = firstNonEmpty([
    userMetadata.first_name,
    userMetadata.given_name,
    displayName,
  ]).split(/\s+/)[0] || "Account";
  const email = String(user.email ?? "").trim() || "No email on file";
  const phone = firstNonEmpty([
    user.phone,
    userMetadata.phone,
    userMetadata.phone_number,
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 text-gray-900 sm:p-6">
      <section className="rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-slate-50/80 p-5 shadow-sm sm:p-7">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Account
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {firstName}
          </h1>
          <p className="max-w-xl text-sm text-slate-600 sm:text-base">
            View the profile details currently available from your existing sign-in session.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-slate-900">Profile Details</h2>
          <p className="mt-1 text-sm text-slate-600">Read-only account information</p>
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