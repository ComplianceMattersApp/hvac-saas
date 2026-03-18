import Link from "next/link";
import { redirect } from "next/navigation";
import {
  isInternalAccessError,
  requireInternalRole,
} from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import {
  createQuickContractorFromForm,
  updateContractorNameAndEmailFromForm,
} from "@/lib/actions/contractor-actions";

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

export default async function AdminContractorsPage() {
  const { supabase, internalUser } = await requireAdminOrRedirect();

  const { data: contractors, error } = await supabase
    .from("contractors")
    .select("id, name, email, created_at")
    .eq("owner_user_id", internalUser.account_owner_user_id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Ops Admin</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Contractors</h1>
            <p className="text-sm text-slate-600">
              Manage contractor organizations and primary contact information.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/ops/admin"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Admin Home
            </Link>
            <Link
              href="/ops"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Ops
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-gray-900">Add Contractor</h2>
        <p className="mt-1 text-sm text-gray-600">
          Create a new contractor organization record.
        </p>
        <form action={createQuickContractorFromForm} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            name="name"
            type="text"
            placeholder="Contractor name"
            className="sm:col-span-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            required
          />
          <input
            name="email"
            type="email"
            placeholder="contact@contractor.com"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Add Contractor
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-gray-900">Contractor List</h2>
        </div>

        <div className="divide-y divide-gray-200">
          {(contractors ?? []).map((row: any) => {
            const createdDate = new Date(row.created_at).toLocaleDateString();

            return (
              <div key={row.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{row.name}</span>
                      {row.email ? (
                        <span className="text-xs text-gray-600">{row.email}</span>
                      ) : null}
                    </div>
                    <p className="text-xs text-gray-500">Added {createdDate}</p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                    <form action={updateContractorNameAndEmailFromForm} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                      <input type="hidden" name="contractor_id" value={row.id} />
                      <input
                        name="name"
                        defaultValue={row.name}
                        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                        placeholder="Contractor name"
                        required
                      />
                      <input
                        name="email"
                        type="email"
                        defaultValue={row.email || ""}
                        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                        placeholder="Email"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100 whitespace-nowrap"
                      >
                        Save
                      </button>
                    </form>

                    <Link
                      href={`/contractors/${row.id}/edit`}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100 text-center"
                    >
                      Full Details
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}

          {(contractors ?? []).length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-600 sm:px-5">
              No contractors found. Create one above to get started.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
