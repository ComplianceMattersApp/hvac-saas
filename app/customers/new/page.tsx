// app/customers/new/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { createCustomerOnlyFromForm } from "@/lib/actions/customer-actions";
import ServiceLocationAddressFields from "@/components/addresses/ServiceLocationAddressFields";
import SubmitButton from "@/components/SubmitButton";

export const metadata = { title: "New Customer" };

export default async function NewCustomerPage() {
  const supabase = await createClient();

  try {
    await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <Link
          href="/customers"
          className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
        >
          ← Customers
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h1 className="text-lg font-semibold text-slate-900">New Customer</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create a customer record. You can attach jobs, estimates, and service plans after
            creation.
          </p>
        </div>

        <form action={createCustomerOnlyFromForm} className="divide-y divide-slate-100">
          {/* Identity */}
          <section className="px-6 py-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Contact Info
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="first_name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  First name
                </label>
                <input
                  id="first_name"
                  name="first_name"
                  type="text"
                  autoComplete="given-name"
                  placeholder="Jane"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="last_name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Last name
                </label>
                <input
                  id="last_name"
                  name="last_name"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Smith"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="phone"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Phone
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="(213) 555-0100"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="jane@example.com"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-slate-700">
                Notes <span className="text-slate-400">(optional)</span>
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Any internal notes about this customer…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </section>

          {/* Primary service location */}
          <section className="px-6 py-5">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Primary Service Location
            </h2>
            <p className="mb-4 text-xs text-slate-400">
              Optional. Leave blank to add a location later from the customer profile.
            </p>
            <ServiceLocationAddressFields required={false} showAddressLine2={false} />
          </section>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <Link
              href="/customers"
              className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Cancel
            </Link>
            <SubmitButton
              loadingText="Creating…"
              className="h-10 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:translate-y-[0.5px]"
            >
              Create Customer
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
