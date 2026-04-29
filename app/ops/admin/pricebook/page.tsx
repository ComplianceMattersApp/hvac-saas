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

type SearchParams = Promise<{ notice?: string; view?: string }>;

type PricebookView = "all" | "active" | "inactive" | "starter" | "custom";

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
  seed_key: string | null;
  starter_version: string | null;
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

function sourceBadgeClass(source: "starter" | "custom") {
  if (source === "starter") return "border-yellow-200 bg-yellow-50 text-yellow-900";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function deferredBadgeClass() {
  return "border-violet-200 bg-violet-50 text-violet-900";
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

function normalizeStarterVersion(value: string | null): "v1" | "v2" | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "v1" || normalized === "starter_v1") return "v1";
  if (normalized === "v2" || normalized === "starter_v2") return "v2";
  return null;
}

function getSourceTag(row: PricebookRow): "starter" | "custom" {
  const version = normalizeStarterVersion(row.starter_version);
  if (version === "v1" || version === "v2") return "starter";
  if (row.is_starter || row.seed_key) return "starter";
  return "custom";
}

function getSourceLabel(source: ReturnType<typeof getSourceTag>) {
  if (source === "starter") return "Starter";
  return "Custom";
}

function isDeferredPlaceholder(row: PricebookRow) {
  return row.is_starter && !row.is_active && row.item_type === "adjustment";
}

function parseView(raw: unknown): PricebookView {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "inactive") return "inactive";
  if (normalized === "starter" || normalized === "starter_v1" || normalized === "starter_v2") return "starter";
  if (normalized === "custom") return "custom";
  return "all";
}

function filterLabel(view: PricebookView) {
  if (view === "active") return "Active";
  if (view === "inactive") return "Inactive";
  if (view === "starter") return "Starter";
  if (view === "custom") return "Custom";
  return "All";
}

function filterButtonClass(isSelected: boolean) {
  if (isSelected) {
    return "border-slate-900 bg-slate-900 text-white shadow-[0_12px_22px_-16px_rgba(15,23,42,0.55)]";
  }
  return "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
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
  const view = parseView(sp.view);

  const { supabase, internalUser } = await requireAdminOrRedirect();

  const { data, error } = await supabase
    .from("pricebook_items")
    .select(
      "id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter, seed_key, starter_version, created_at, updated_at",
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
    seed_key: row.seed_key ? String(row.seed_key) : null,
    starter_version: row.starter_version ? String(row.starter_version) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  }));

  const filteredRows = rows.filter((row) => {
    const source = getSourceTag(row);
    if (view === "active") return row.is_active;
    if (view === "inactive") return !row.is_active;
    if (view === "starter") return source === "starter";
    if (view === "custom") return source === "custom";
    return true;
  });

  const activeCount = rows.filter((row) => row.is_active).length;
  const inactiveCount = rows.length - activeCount;
  const starterCount = rows.filter((row) => getSourceTag(row) !== "custom").length;
  const customCount = rows.filter((row) => getSourceTag(row) === "custom").length;
  const deferredCount = rows.filter((row) => isDeferredPlaceholder(row)).length;

  const viewOptions: Array<{ key: PricebookView; label: string }> = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "inactive", label: "Inactive" },
    { key: "starter", label: "Starter" },
    { key: "custom", label: "Custom" },
  ];

  const hrefForView = (nextView: PricebookView) => {
    const params = new URLSearchParams();
    if (notice) params.set("notice", String(sp.notice ?? ""));
    if (nextView !== "all") params.set("view", nextView);
    const qs = params.toString();
    return qs ? `/ops/admin/pricebook?${qs}` : "/ops/admin/pricebook";
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_55%,rgba(224,242,254,0.68))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)]">
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-sky-200/70 blur-3xl" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Center</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">Pricebook</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Manage reusable catalog items for your account. Pricebook values are editable defaults and do not mutate historical invoice line snapshots.
            </p>
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
              {activeCount} active • {inactiveCount} inactive • {starterCount} starter • {customCount} custom
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Starter rows: {starterCount}
              {deferredCount > 0 ? ` • Deferred placeholders: ${deferredCount}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Pricebook clarity</p>
          <p className="mt-1 leading-6">
            Pricebook rows are reusable defaults for future estimates and invoices. Editing a Pricebook row affects future selections only and does not change historical invoice lines.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {viewOptions.map((option) => {
            const selected = option.key === view;
            return (
              <Link
                key={option.key}
                href={hrefForView(option.key)}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${filterButtonClass(selected)}`}
                aria-current={selected ? "page" : undefined}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Create Item</p>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">Add a reusable catalog item</h2>
          <p className="text-sm text-slate-600">Create a pricing template for future estimates and invoices. Changes affect new selections only—existing invoices remain unchanged.</p>
        </div>

        <form action={createPricebookItemFromForm} className="mt-6 space-y-6">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
              <span className="font-semibold text-slate-900">Item Name</span>
              <input
                type="text"
                name="item_name"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                placeholder="Example: Blower Motor Replacement"
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Type</span>
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

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Unit Price</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  name="default_unit_price"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white pl-6 pr-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  placeholder="0.00"
                />
              </div>
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Unit Label</span>
              <select
                name="unit_label"
                defaultValue=""
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">None</option>
                {PRICEBOOK_UNIT_LABEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Category</span>
              <select
                name="category"
                defaultValue=""
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">None</option>
                {PRICEBOOK_CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
              <span className="font-semibold text-slate-900">Default Description</span>
              <input
                type="text"
                name="default_description"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                placeholder="Optional default line-item description"
              />
            </label>
          </div>

          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
          >
            Create item
          </button>
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
                <th className="px-4 py-3">Price & Unit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-700">
                        No {filterLabel(view).toLowerCase()} items found.
                      </p>
                      <p className="text-xs text-slate-500">
                        {view !== "all" ? (
                          <>Try <Link href="/ops/admin/pricebook" className="font-medium text-slate-600 hover:text-slate-900 underline">clearing filters</Link> to see all items.</>
                        ) : (
                          <>Create your first item above to get started.</>
                        )}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className={!row.is_active ? "bg-slate-50/60" : undefined}>
                    <td className="px-4 py-3 align-top">
                      <div className="min-w-[200px]">
                        <div className="font-semibold text-slate-900">{row.item_name}</div>
                        {row.default_description ? (
                          <div className="mt-1 text-xs text-slate-500">{row.default_description}</div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${typeBadgeClass(row.item_type)}`}>
                        {row.item_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="min-w-[140px] text-sm text-slate-700">{displayCategory(row.category)}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="min-w-[100px]">
                        <div className="text-sm font-semibold text-slate-900">{currency(row.default_unit_price)}</div>
                        <div className="text-xs text-slate-600">{displayUnitLabel(row.unit_label)}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex min-w-[170px] flex-wrap gap-1.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(row.is_active)}`}>
                          {row.is_active ? "Active" : "Inactive"}
                        </span>
                        {isDeferredPlaceholder(row) ? (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${deferredBadgeClass()}`}>
                            Deferred placeholder
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {(() => {
                        const source = getSourceTag(row);
                        return (
                          <div className="min-w-[140px] space-y-1">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${sourceBadgeClass(source)}`}>
                              {getSourceLabel(source)}
                            </span>
                            <div className="text-[11px] text-slate-500">
                              {source !== "custom" ? "Starter seed row" : "Custom row"}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        <details className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                          <summary className="cursor-pointer text-xs font-semibold text-slate-800 hover:text-slate-900">
                            Edit fields
                          </summary>
                          <form action={updatePricebookItemFromForm} className="mt-3 space-y-3">
                            <input type="hidden" name="item_id" value={row.id} />
                            <label className="block space-y-1 text-xs text-slate-700">
                              <span className="font-semibold text-slate-900">Item Name</span>
                              <input
                                type="text"
                                name="item_name"
                                defaultValue={row.item_name}
                                required
                                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                              />
                            </label>
                            <label className="block space-y-1 text-xs text-slate-700">
                              <span className="font-semibold text-slate-900">Type</span>
                              <select
                                name="item_type"
                                defaultValue={row.item_type}
                                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                              >
                                <option value="service">Service</option>
                                <option value="material">Material</option>
                                <option value="diagnostic">Diagnostic</option>
                                <option value="adjustment">Adjustment</option>
                              </select>
                            </label>
                            <label className="block space-y-1 text-xs text-slate-700">
                              <span className="font-semibold text-slate-900">Category</span>
                              <select
                                name="category"
                                defaultValue={isKnownPricebookCategory(row.category) ? (row.category ?? "") : ""}
                                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                              >
                                <option value="">None</option>
                                {PRICEBOOK_CATEGORY_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                              {!isKnownPricebookCategory(row.category) && row.category ? (
                                <span className="text-[10px] text-amber-700">Legacy value: {row.category}</span>
                              ) : null}
                            </label>
                            <label className="block space-y-1 text-xs text-slate-700">
                              <span className="font-semibold text-slate-900">Unit Price</span>
                              <input
                                type="number"
                                step="0.01"
                                name="default_unit_price"
                                defaultValue={String(row.default_unit_price)}
                                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                              />
                            </label>
                            <label className="block space-y-1 text-xs text-slate-700">
                              <span className="font-semibold text-slate-900">Unit Label</span>
                              <select
                                name="unit_label"
                                defaultValue={isKnownPricebookUnitLabel(row.unit_label) ? (row.unit_label ?? "") : ""}
                                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                              >
                                <option value="">None</option>
                                {PRICEBOOK_UNIT_LABEL_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                              {!isKnownPricebookUnitLabel(row.unit_label) && row.unit_label ? (
                                <span className="text-[10px] text-amber-700">Legacy value: {row.unit_label}</span>
                              ) : null}
                            </label>
                            <label className="block space-y-1 text-xs text-slate-700">
                              <span className="font-semibold text-slate-900">Description</span>
                              <input
                                type="text"
                                name="default_description"
                                defaultValue={row.default_description ?? ""}
                                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                              />
                            </label>
                            <button
                              type="submit"
                              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
                            >
                              Save changes
                            </button>
                          </form>
                        </details>

                        <form action={setPricebookItemActiveFromForm} className="flex flex-col gap-2">
                          <input type="hidden" name="item_id" value={row.id} />
                          <input type="hidden" name="is_active" value={row.is_active ? "0" : "1"} />
                          <div>
                            <button
                              type="submit"
                              className="w-full rounded-md border px-2.5 py-1.5 text-xs font-semibold transition"
                              title={row.is_active ? "Mark as inactive—existing invoices stay unchanged" : "Mark as active—will appear in selections"}
                              style={{
                                borderColor: row.is_active ? "#fca5a5" : "#86efac",
                                backgroundColor: row.is_active ? "#fee2e2" : "#f0fdf4",
                                color: row.is_active ? "#dc2626" : "#16a34a",
                              }}
                            >
                              {row.is_active ? "Deactivate" : "Activate"}
                            </button>
                            <p className="mt-1 text-[10px] text-slate-500 px-0.5">
                              {row.is_active ? "Prevents future selection" : "Enables in selections"}
                            </p>
                          </div>
                        </form>
                      </div>
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
