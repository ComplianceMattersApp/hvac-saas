import Link from "next/link";
import { redirect } from "next/navigation";
import {
  isInternalAccessError,
  requireInternalRole,
} from "@/lib/auth/internal-user";
import {
  createPricebookItemFromForm,
  setPricebookItemActiveFromForm,
  updatePricebookItemFromForm,
} from "@/lib/actions/pricebook-actions";
import {
  PRICEBOOK_CATEGORY_OPTIONS,
  PRICEBOOK_UNIT_LABEL_OPTIONS,
  isKnownPricebookCategory,
  isKnownPricebookUnitLabel,
} from "@/lib/business/pricebook-options";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ notice?: string }>;

type PricebookRow = {
  id: string;
  item_name: string;
  item_type: "service" | "material" | "diagnostic" | "adjustment";
  category: string | null;
  default_description: string | null;
  default_unit_price: number;
  unit_label: string | null;
  is_active: boolean;
  is_starter: boolean;
  created_at: string;
  updated_at: string;
};

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  created: { tone: "success", message: "Pricebook item created." },
  updated: { tone: "success", message: "Pricebook item updated." },
  status_updated: { tone: "success", message: "Item status updated." },
  invalid_item_name: { tone: "error", message: "Item name is required." },
  invalid_item_type: { tone: "error", message: "Item type must be service, material, diagnostic, or adjustment." },
  invalid_category: { tone: "error", message: "Category must be selected from the allowed list." },
  invalid_unit_label: { tone: "error", message: "Unit label must be selected from the allowed list." },
  invalid_unit_price: { tone: "error", message: "Unit price must be a valid number." },
  negative_only_for_adjustment: {
    tone: "error",
    message: "Negative unit prices are allowed only for adjustment items.",
  },
  not_found: { tone: "error", message: "That item was not found in your account scope." },
  save_failed: { tone: "error", message: "Could not save changes. Please try again." },
};

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

function typeBadgeClass(type: PricebookRow["item_type"]) {
  if (type === "service") return "border-sky-200 bg-sky-50 text-sky-900";
  if (type === "material") return "border-indigo-200 bg-indigo-50 text-indigo-900";
  if (type === "diagnostic") return "border-teal-200 bg-teal-50 text-teal-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function statusBadgeClass(isActive: boolean) {
  return isActive
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-slate-300 bg-slate-100 text-slate-700";
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function normalizeItemType(value: unknown): PricebookRow["item_type"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "service") return "service";
  if (normalized === "material") return "material";
  if (normalized === "diagnostic") return "diagnostic";
  if (normalized === "adjustment") return "adjustment";
  return "service";
}

function displayCategory(value: string | null) {
  if (!value) return "-";
  if (isKnownPricebookCategory(value)) return value;
  return `Legacy / Unknown (${value})`;
}

function displayUnitLabel(value: string | null) {
  if (!value) return "-";
  if (isKnownPricebookUnitLabel(value)) return value;
  return `Legacy / Unknown (${value})`;
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

export default async function AdminPricebookPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const notice = NOTICE_TEXT[String(sp.notice ?? "").trim().toLowerCase()];

  const { supabase, internalUser } = await requireAdminOrRedirect();

  const { data, error } = await supabase
    .from("pricebook_items")
    .select(
      "id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter, created_at, updated_at",
    )
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .order("item_name", { ascending: true });

  if (error) throw error;

  const rows: PricebookRow[] = (data ?? []).map((row: any) => ({
    id: String(row.id),
    item_name: String(row.item_name ?? "").trim(),
    item_type: normalizeItemType(row.item_type),
    category: row.category ? String(row.category) : null,
    default_description: row.default_description ? String(row.default_description) : null,
    default_unit_price: Number(row.default_unit_price ?? 0),
    unit_label: row.unit_label ? String(row.unit_label) : null,
    is_active: Boolean(row.is_active),
    is_starter: Boolean(row.is_starter),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  }));
  const activeCount = rows.filter((row) => row.is_active).length;
  const inactiveCount = rows.length - activeCount;
  const starterCount = rows.filter((row) => row.is_starter).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_55%,rgba(224,242,254,0.68))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)]">
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-sky-200/70 blur-3xl" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Center</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">Pricebook</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Manage reusable catalog items for your account. Items remain definitions only and do not mutate historical records.
            </p>
            <div className="inline-flex items-center rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              Slice B: admin CRUD only
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/ops/admin"
              className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
            >
              Admin Center
            </Link>
          </div>
        </div>
      </div>

      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Catalog Summary</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">{rows.length} items</h2>
            <p className="mt-1 text-sm text-slate-600">
              {activeCount} active • {inactiveCount} inactive • {starterCount} starter
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Create Item</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">Add a catalog item</h2>
        </div>

        <form action={createPricebookItemFromForm} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm text-slate-700 xl:col-span-2">
            <span className="font-medium text-slate-900">Item Name</span>
            <input
              type="text"
              name="item_name"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="Example: Blower Motor Replacement"
            />
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium text-slate-900">Type</span>
            <select
              name="item_type"
              defaultValue="service"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              <option value="service">Service</option>
              <option value="material">Material</option>
              <option value="diagnostic">Diagnostic</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium text-slate-900">Unit Price</span>
            <input
              type="number"
              step="0.01"
              name="default_unit_price"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="0.00"
            />
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium text-slate-900">Category</span>
            <select
              name="category"
              defaultValue=""
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">No category</option>
              {PRICEBOOK_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium text-slate-900">Unit Label</span>
            <select
              name="unit_label"
              defaultValue=""
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">No unit label</option>
              {PRICEBOOK_UNIT_LABEL_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-700 md:col-span-2 xl:col-span-2">
            <span className="font-medium text-slate-900">Default Description</span>
            <input
              type="text"
              name="default_description"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="Optional default line-item description"
            />
          </label>

          <div className="md:col-span-2 xl:col-span-4">
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
            >
              Create item
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/90 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50/90">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                <th className="px-4 py-3">Item Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Unit Price</th>
                <th className="px-4 py-3">Unit Label</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Starter</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-600">
                    No items in this account yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className={!row.is_active ? "bg-slate-50/60" : undefined}>
                    <td className="px-4 py-3 align-top">
                      <div className="min-w-[230px] font-semibold text-slate-900">{row.item_name}</div>
                      {row.default_description ? (
                        <div className="mt-1 text-xs text-slate-500">{row.default_description}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${typeBadgeClass(row.item_type)}`}>
                        {row.item_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="min-w-[160px] text-slate-700">{displayCategory(row.category)}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="min-w-[130px] text-slate-900">{currency(row.default_unit_price)}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="min-w-[120px] text-slate-700">{displayUnitLabel(row.unit_label)}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(row.is_active)}`}>
                        {row.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {row.is_starter ? (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          Starter
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">Custom</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <details className="mb-2 rounded-md border border-slate-200 bg-slate-50/80 p-2">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-800">Edit</summary>
                        <form action={updatePricebookItemFromForm} className="mt-2 space-y-2">
                          <input type="hidden" name="item_id" value={row.id} />
                          <label className="block space-y-1 text-xs text-slate-700">
                            <span className="font-medium text-slate-900">Name</span>
                            <input
                              type="text"
                              name="item_name"
                              defaultValue={row.item_name}
                              required
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                            />
                          </label>
                          <label className="block space-y-1 text-xs text-slate-700">
                            <span className="font-medium text-slate-900">Type</span>
                            <select
                              name="item_type"
                              defaultValue={row.item_type}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                            >
                              <option value="service">Service</option>
                              <option value="material">Material</option>
                              <option value="diagnostic">Diagnostic</option>
                              <option value="adjustment">Adjustment</option>
                            </select>
                          </label>
                          <label className="block space-y-1 text-xs text-slate-700">
                            <span className="font-medium text-slate-900">Category</span>
                            <select
                              name="category"
                              defaultValue={isKnownPricebookCategory(row.category) ? (row.category ?? "") : ""}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                            >
                              <option value="">No category</option>
                              {PRICEBOOK_CATEGORY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                            {!isKnownPricebookCategory(row.category) && row.category ? (
                              <span className="text-[11px] text-amber-700">Legacy value currently stored: {row.category}</span>
                            ) : null}
                          </label>
                          <label className="block space-y-1 text-xs text-slate-700">
                            <span className="font-medium text-slate-900">Unit Price</span>
                            <input
                              type="number"
                              step="0.01"
                              name="default_unit_price"
                              defaultValue={String(row.default_unit_price)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                            />
                          </label>
                          <label className="block space-y-1 text-xs text-slate-700">
                            <span className="font-medium text-slate-900">Unit Label</span>
                            <select
                              name="unit_label"
                              defaultValue={isKnownPricebookUnitLabel(row.unit_label) ? (row.unit_label ?? "") : ""}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                            >
                              <option value="">No unit label</option>
                              {PRICEBOOK_UNIT_LABEL_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                            {!isKnownPricebookUnitLabel(row.unit_label) && row.unit_label ? (
                              <span className="text-[11px] text-amber-700">Legacy value currently stored: {row.unit_label}</span>
                            ) : null}
                          </label>
                          <label className="block space-y-1 text-xs text-slate-700">
                            <span className="font-medium text-slate-900">Description</span>
                            <input
                              type="text"
                              name="default_description"
                              defaultValue={row.default_description ?? ""}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                            />
                          </label>
                          <button
                            type="submit"
                            className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
                          >
                            Save
                          </button>
                        </form>
                      </details>
                      <form action={setPricebookItemActiveFromForm}>
                        <input type="hidden" name="item_id" value={row.id} />
                        <input type="hidden" name="is_active" value={row.is_active ? "0" : "1"} />
                        <button
                          type="submit"
                          className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
                        >
                          {row.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
