'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import SubmitButton from '@/components/SubmitButton';
import type { InternalInvoiceItemType, InternalInvoiceLineItemRecord } from '@/lib/business/internal-invoice';

type InternalInvoiceActionResult = {
  ok: boolean;
  banner?: string;
  fieldErrors?: Record<string, string>;
};

type ServerFormAction = (
  formData: FormData,
) => void | InternalInvoiceActionResult | Promise<void | InternalInvoiceActionResult>;

type InlineFeedback = {
  type: 'success' | 'error';
  message: string;
};

type PricebookPickerItem = {
  id: string;
  item_name: string;
  item_type: string;
  category: string | null;
  unit_label: string | null;
  default_unit_price: number;
  default_description: string | null;
};

type VisitScopePickerItem = {
  id: string;
  title: string;
  details: string | null;
  kind: 'primary' | 'companion_service';
  alreadyAdded: boolean;
};

type InternalInvoiceLineItemsTableProps = {
  jobId: string;
  tab: string;
  lineItems: InternalInvoiceLineItemRecord[];
  totalCents: number;
  addLineItemAction: ServerFormAction;
  addPricebookLineItemAction: ServerFormAction;
  addVisitScopeLineItemsAction: ServerFormAction;
  updateLineItemAction: ServerFormAction;
  removeLineItemAction: ServerFormAction;
  pricebookPickerItems: PricebookPickerItem[];
  visitScopePickerItems: VisitScopePickerItem[];
  workspaceFieldLabelClass: string;
  workspaceInputClass: string;
  primaryButtonClass: string;
  secondaryButtonClass: string;
};

function formatCurrencyFromCents(cents?: number | null) {
  const amount = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatCurrencyFromAmount(amount?: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(amount ?? 0) || 0);
}

function formatDecimalInput(value?: number | null) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return '0.00';
  return normalized.toFixed(2);
}

function formatInternalInvoiceItemType(type?: InternalInvoiceItemType | string | null) {
  const normalized = String(type ?? '').trim().toLowerCase();
  if (!normalized) return 'Service';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function invoiceBannerMessage(banner?: string | null) {
  const normalized = String(banner ?? '').trim().toLowerCase();
  const messages: Record<string, string> = {
    internal_invoice_draft_saved: 'Draft invoice saved.',
    internal_invoice_required_fields: 'Invoice number is required.',
    internal_invoice_number_taken: 'Invoice number is already in use.',
    internal_invoice_line_item_added: 'Line item added.',
    internal_invoice_pricebook_line_item_added: 'Pricebook line item added.',
    internal_invoice_visit_scope_line_item_added: 'Visit Scope line item added.',
    internal_invoice_visit_scope_line_item_partial_added: 'Some selected Visit Scope items were already added.',
    internal_invoice_line_item_saved: 'Line item saved.',
    internal_invoice_line_item_removed: 'Line item removed.',
    internal_invoice_line_item_invalid: 'Line item fields are invalid.',
    internal_invoice_line_item_missing: 'Line item is missing or no longer available.',
    internal_invoice_pricebook_item_missing: 'Select a Pricebook item.',
    internal_invoice_pricebook_quantity_invalid: 'Quantity must be greater than zero.',
    internal_invoice_pricebook_item_not_found: 'Pricebook item is unavailable.',
    internal_invoice_pricebook_item_inactive: 'Pricebook item is inactive.',
    internal_invoice_pricebook_negative_price_deferred: 'Adjustment/negative price items are not available here yet.',
    internal_invoice_visit_scope_item_invalid: 'Visit Scope selection is invalid.',
    internal_invoice_visit_scope_item_missing: 'Select at least one Visit Scope item.',
    internal_invoice_visit_scope_quantity_invalid: 'Quantity must be greater than zero.',
    internal_invoice_visit_scope_item_not_found: 'Visit Scope item is unavailable.',
    internal_invoice_visit_scope_line_item_duplicate: 'Selected Visit Scope items are already added.',
    internal_invoice_locked: 'Invoice is locked and cannot be edited.',
    internal_invoice_line_items_locked: 'Invoice line items are locked.',
    internal_invoice_missing: 'Invoice was not found.',
  };

  return messages[normalized] ?? null;
}

function resolveErrorMessage(result?: InternalInvoiceActionResult | void, fallback = 'Could not save changes.') {
  const fieldError = result && typeof result === 'object' && result.fieldErrors
    ? Object.values(result.fieldErrors).find((value) => String(value ?? '').trim().length > 0)
    : null;

  if (fieldError) return String(fieldError);
  return invoiceBannerMessage(result && typeof result === 'object' ? result.banner : null) ?? fallback;
}

export function InternalInvoiceDraftSaveForm(props: {
  action: ServerFormAction;
  className?: string;
  children: ReactNode;
}) {
  const { action, className, children } = props;
  const router = useRouter();
  const [feedback, setFeedback] = useState<InlineFeedback | null>(null);

  async function submitDraftSave(formData: FormData) {
    formData.set('no_redirect', '1');
    const result = await action(formData);

    if (result && typeof result === 'object' && 'ok' in result) {
      if (!result.ok) {
        setFeedback({
          type: 'error',
          message: resolveErrorMessage(result, 'Could not save draft invoice.'),
        });
        return;
      }

      setFeedback({
        type: 'success',
        message: invoiceBannerMessage(result.banner) ?? 'Draft invoice saved.',
      });
      router.refresh();
      return;
    }

    setFeedback({ type: 'success', message: 'Draft invoice saved.' });
    router.refresh();
  }

  return (
    <form action={submitDraftSave} className={className}>
      {feedback ? (
        <div
          className={`rounded-lg border px-3.5 py-2.5 text-sm ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}
        >
          {feedback.message}
        </div>
      ) : null}
      {children}
    </form>
  );
}

export default function InternalInvoiceLineItemsTable({
  jobId,
  tab,
  lineItems,
  totalCents,
  addLineItemAction,
  addPricebookLineItemAction,
  addVisitScopeLineItemsAction,
  updateLineItemAction,
  removeLineItemAction,
  pricebookPickerItems,
  visitScopePickerItems,
  workspaceFieldLabelClass,
  workspaceInputClass,
  primaryButtonClass,
  secondaryButtonClass,
}: InternalInvoiceLineItemsTableProps) {
  const router = useRouter();
  const [expandedAdditionalRowId, setExpandedAdditionalRowId] = useState<string | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<InlineFeedback | null>(null);
  const [selectedPricebookItemId, setSelectedPricebookItemId] = useState<string>(
    pricebookPickerItems[0]?.id ?? '',
  );
  const [selectedVisitScopeItemIds, setSelectedVisitScopeItemIds] = useState<string[]>([]);
  const selectedPricebookItem =
    pricebookPickerItems.find((item) => item.id === selectedPricebookItemId) ?? null;
  const eligibleVisitScopeItems = visitScopePickerItems.filter((item) => !item.alreadyAdded);

  function toggleVisitScopeItem(itemId: string) {
    setSelectedVisitScopeItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((value) => value !== itemId)
        : [...prev, itemId],
    );
  }

  async function runInlineMutation(params: {
    formData: FormData;
    action: ServerFormAction;
    successFallback: string;
    errorFallback: string;
    onSuccess?: (result: InternalInvoiceActionResult | void) => void;
  }) {
    const { formData, action, successFallback, errorFallback, onSuccess } = params;
    formData.set('no_redirect', '1');
    const result = await action(formData);

    if (result && typeof result === 'object' && 'ok' in result) {
      if (!result.ok) {
        setFeedback({
          type: 'error',
          message: resolveErrorMessage(result, errorFallback),
        });
        return;
      }

      setFeedback({
        type: 'success',
        message: invoiceBannerMessage(result.banner) ?? successFallback,
      });
      onSuccess?.(result);
      router.refresh();
      return;
    }

    setFeedback({ type: 'success', message: successFallback });
    onSuccess?.(result);
    router.refresh();
  }

  async function handleAddPricebook(formData: FormData) {
    await runInlineMutation({
      formData,
      action: addPricebookLineItemAction,
      successFallback: 'Pricebook line item added.',
      errorFallback: 'Could not add Pricebook line item.',
    });
  }

  async function handleAddVisitScope(formData: FormData) {
    await runInlineMutation({
      formData,
      action: addVisitScopeLineItemsAction,
      successFallback: 'Visit Scope line items added.',
      errorFallback: 'Could not add Visit Scope line items.',
      onSuccess: () => setSelectedVisitScopeItemIds([]),
    });
  }

  async function handleUpdateLineItem(formData: FormData) {
    await runInlineMutation({
      formData,
      action: updateLineItemAction,
      successFallback: 'Line item saved.',
      errorFallback: 'Could not save line item.',
    });
  }

  async function handleAddManualLineItem(formData: FormData) {
    await runInlineMutation({
      formData,
      action: addLineItemAction,
      successFallback: 'Line item added.',
      errorFallback: 'Could not add line item.',
      onSuccess: () => setIsAddFormOpen(false),
    });
  }

  async function handleRemoveLineItem(formData: FormData) {
    await runInlineMutation({
      formData,
      action: removeLineItemAction,
      successFallback: 'Line item removed.',
      errorFallback: 'Could not remove line item.',
    });
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/72 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.28)]">
      {feedback ? (
        <div
          className={`mx-5 mt-4 rounded-lg border px-3.5 py-2.5 text-sm ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="hidden grid-cols-[minmax(0,2.35fr)_minmax(8.5rem,0.9fr)_minmax(6.25rem,0.74fr)_minmax(7.25rem,0.84fr)_minmax(8rem,0.9fr)_auto] gap-4 border-b border-slate-200/80 bg-white/88 px-5 py-3 md:grid">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Line Item</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Type</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Qty</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Unit Price</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Subtotal</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Edit</div>
      </div>

      {lineItems.length === 0 ? (
        <div className="border-b border-dashed border-slate-200 bg-white/72 px-5 py-3.5 text-sm text-slate-600">
          Start with the first scope line below. Each row becomes the billed scope and the technician-facing work instruction.
        </div>
      ) : null}

      <div className="divide-y divide-slate-200/80">
        <form action={handleAddPricebook} className="bg-white/92 px-5 py-5">
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="tab" value={tab} />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Add From Pricebook</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                Add an active catalog item as a frozen billed snapshot. Credits/negative adjustments are deferred.
              </div>
            </div>
          </div>

          {pricebookPickerItems.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-[minmax(0,2.35fr)_minmax(6.25rem,0.74fr)_auto] md:items-end">
                <div>
                  <label className={workspaceFieldLabelClass}>Pricebook Item</label>
                  <select
                    name="pricebook_item_id"
                    value={selectedPricebookItemId}
                    onChange={(event) => setSelectedPricebookItemId(event.target.value)}
                    className={workspaceInputClass}
                    required
                  >
                    {pricebookPickerItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.item_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={workspaceFieldLabelClass}>Quantity</label>
                  <input name="quantity" inputMode="decimal" defaultValue="1.00" className={workspaceInputClass} required />
                </div>

                <SubmitButton loadingText="Adding..." className={primaryButtonClass}>
                  Add Pricebook Item
                </SubmitButton>
              </div>

              {selectedPricebookItem ? (
                <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <span>{formatInternalInvoiceItemType(selectedPricebookItem.item_type)}</span>
                    {selectedPricebookItem.category ? <span>• {selectedPricebookItem.category}</span> : null}
                    {selectedPricebookItem.unit_label ? <span>• Unit: {selectedPricebookItem.unit_label}</span> : null}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    Default Unit Price: {formatCurrencyFromAmount(selectedPricebookItem.default_unit_price)}
                  </div>
                  {selectedPricebookItem.default_description ? (
                    <div className="mt-1 text-sm leading-6 text-slate-600">{selectedPricebookItem.default_description}</div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3.5 py-3 text-sm leading-6 text-amber-900">
              No active non-credit Pricebook items are available for draft invoice adds yet.
            </div>
          )}
        </form>

        {visitScopePickerItems.length > 0 ? (
          <form action={handleAddVisitScope} className="bg-white/92 px-5 py-5">
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="quantity" value="1.00" />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Build Invoice from Visit Scope</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  Add selected scope items as draft invoice lines. Pricing starts at $0.00 and should be reviewed before issuing.
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {visitScopePickerItems.map((item) => {
                const isChecked = selectedVisitScopeItemIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`block rounded-xl border px-3.5 py-3 ${item.alreadyAdded ? 'border-slate-200 bg-slate-50/80' : 'border-slate-200 bg-white'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="visit_scope_item_ids"
                        value={item.id}
                        checked={isChecked}
                        disabled={item.alreadyAdded}
                        onChange={() => toggleVisitScopeItem(item.id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            {item.kind === 'companion_service' ? 'Companion Service' : 'Primary'}
                          </span>
                          {item.alreadyAdded ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                              Already added
                            </span>
                          ) : null}
                        </div>
                        {item.details ? (
                          <div className="mt-1 text-xs leading-5 text-slate-600">{item.details}</div>
                        ) : null}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-3.5">
              <div className="text-xs text-slate-500">
                {eligibleVisitScopeItems.length === 0
                  ? 'All available Visit Scope items are already on this draft invoice.'
                  : 'Select one or more scope items to add them as draft invoice lines.'}
              </div>
              <SubmitButton
                loadingText="Adding..."
                className={primaryButtonClass}
                disabled={selectedVisitScopeItemIds.length === 0}
              >
                Add Selected Scope Items
              </SubmitButton>
            </div>
          </form>
        ) : null}

        {lineItems.map((lineItem, index) => {
          const isPrimaryRow = index === 0;
          const isExpanded = isPrimaryRow || expandedAdditionalRowId === lineItem.id;

          if (!isExpanded) {
            return (
              <div key={lineItem.id} className="bg-white/78 px-5 py-3.5">
                <div className="grid gap-3 md:grid-cols-[minmax(0,2.35fr)_minmax(8.5rem,0.9fr)_minmax(6.25rem,0.74fr)_minmax(7.25rem,0.84fr)_minmax(8rem,0.9fr)_auto] md:items-center">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Line {index + 1}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-950">{lineItem.item_name_snapshot}</div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:hidden">Type</div>
                    <div className="text-sm text-slate-700">{formatInternalInvoiceItemType(lineItem.item_type_snapshot)}</div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:hidden">Qty</div>
                    <div className="text-sm text-slate-700">{formatDecimalInput(lineItem.quantity)}</div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:hidden">Unit Price</div>
                    <div className="text-sm text-slate-700">{formatCurrencyFromAmount(lineItem.unit_price)}</div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:hidden">Subtotal</div>
                    <div className="text-sm font-semibold text-slate-950">{formatCurrencyFromAmount(lineItem.line_subtotal)}</div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setExpandedAdditionalRowId(lineItem.id)}
                      className="inline-flex min-h-9 items-center justify-center rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-14px_rgba(2,132,199,0.65)] transition-[background-color,box-shadow,transform] hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 active:translate-y-[0.5px]"
                    >
                      Edit Details
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={lineItem.id} className="bg-white/72">
              <form action={handleUpdateLineItem} className="px-5 py-5">
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="tab" value={tab} />
                <input type="hidden" name="line_item_id" value={lineItem.id} />

                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Line {index + 1}</div>
                    <div className="mt-1 text-xs text-slate-500">{isPrimaryRow ? 'Main line item' : 'Editing details'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isPrimaryRow ? (
                      <button
                        type="button"
                        onClick={() => setExpandedAdditionalRowId(null)}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition-[background-color,border-color,transform] hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 active:translate-y-[0.5px]"
                      >
                        Hide Details
                      </button>
                    ) : null}
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:hidden">
                      {formatCurrencyFromAmount(lineItem.line_subtotal)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,2.35fr)_minmax(8.5rem,0.9fr)_minmax(6.25rem,0.74fr)_minmax(7.25rem,0.84fr)_minmax(8rem,0.9fr)] md:items-start">
                  <div>
                    <label className={workspaceFieldLabelClass}>Item Name</label>
                    <input
                      name="item_name_snapshot"
                      defaultValue={lineItem.item_name_snapshot}
                      className={workspaceInputClass}
                      required
                    />
                  </div>

                  <div>
                    <label className={workspaceFieldLabelClass}>Type</label>
                    <select
                      name="item_type_snapshot"
                      defaultValue={lineItem.item_type_snapshot}
                      className={workspaceInputClass}
                    >
                      <option value="service">Service</option>
                      <option value="material">Material</option>
                      <option value="diagnostic">Diagnostic</option>
                      <option value="adjustment">Adjustment</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className={workspaceFieldLabelClass}>Quantity</label>
                    <input
                      name="quantity"
                      inputMode="decimal"
                      defaultValue={formatDecimalInput(lineItem.quantity)}
                      className={workspaceInputClass}
                      required
                    />
                  </div>

                  <div>
                    <label className={workspaceFieldLabelClass}>Unit Price</label>
                    <input
                      name="unit_price"
                      inputMode="decimal"
                      defaultValue={formatDecimalInput(lineItem.unit_price)}
                      className={workspaceInputClass}
                      required
                    />
                  </div>

                  <div>
                    <label className={workspaceFieldLabelClass}>Subtotal</label>
                    <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-slate-900">
                      {formatCurrencyFromAmount(lineItem.line_subtotal)}
                    </div>
                  </div>

                  <div className="md:col-span-5">
                    <label className={workspaceFieldLabelClass}>Description / Work Instruction</label>
                    <textarea
                      name="description_snapshot"
                      defaultValue={String(lineItem.description_snapshot ?? '')}
                      className={`${workspaceInputClass} min-h-[5.5rem]`}
                      placeholder="Scope detail, work instruction, or install note"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-3.5">
                  <div className="text-xs text-slate-500">Save after editing this row to keep totals and issued scope in sync.</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SubmitButton loadingText="Saving..." className={secondaryButtonClass}>
                      Save Line Item
                    </SubmitButton>
                    <button
                      type="submit"
                      form={`remove-line-item-${lineItem.id}`}
                      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 active:translate-y-[0.5px]"
                    >
                      Remove Line Item
                    </button>
                  </div>
                </div>
              </form>

              <div className="sr-only">
                <form id={`remove-line-item-${lineItem.id}`} action={handleRemoveLineItem}>
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="tab" value={tab} />
                  <input type="hidden" name="line_item_id" value={lineItem.id} />
                </form>
              </div>
            </div>
          );
        })}

        {isAddFormOpen ? (
          <form action={handleAddManualLineItem} className="bg-slate-50/94 px-5 py-5">
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="tab" value={tab} />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">+ Add Line Item</div>
              <button
                type="button"
                onClick={() => setIsAddFormOpen(false)}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
              >
                Cancel
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,2.35fr)_minmax(8.5rem,0.9fr)_minmax(6.25rem,0.74fr)_minmax(7.25rem,0.84fr)_minmax(8rem,0.9fr)] md:items-start">
              <div>
                <label className={workspaceFieldLabelClass}>Item Name</label>
                <input
                  name="item_name_snapshot"
                  className={workspaceInputClass}
                  placeholder="Diagnostic visit"
                  required
                />
              </div>

              <div>
                <label className={workspaceFieldLabelClass}>Type</label>
                <select name="item_type_snapshot" defaultValue="service" className={workspaceInputClass}>
                  <option value="service">Service</option>
                  <option value="material">Material</option>
                  <option value="diagnostic">Diagnostic</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className={workspaceFieldLabelClass}>Quantity</label>
                <input name="quantity" inputMode="decimal" defaultValue="1.00" className={workspaceInputClass} required />
              </div>

              <div>
                <label className={workspaceFieldLabelClass}>Unit Price</label>
                <input name="unit_price" inputMode="decimal" defaultValue="0.00" className={workspaceInputClass} required />
              </div>

              <div>
                <label className={workspaceFieldLabelClass}>Subtotal</label>
                <div className="flex min-h-11 items-center rounded-lg border border-dashed border-slate-300 bg-white px-3.5 text-sm text-slate-500">
                  Saves after add
                </div>
              </div>

              <div className="md:col-span-5">
                <label className={workspaceFieldLabelClass}>Description / Work Instruction</label>
                <textarea
                  name="description_snapshot"
                  className={`${workspaceInputClass} min-h-[5.5rem]`}
                  placeholder="Optional scope note or technician-facing work detail"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-3.5">
              <div className="text-xs leading-5 text-slate-500">Add the next scope row when the job needs another billable step, material, or work instruction.</div>
              <SubmitButton loadingText="Adding..." className={primaryButtonClass}>
                + Add Line Item
              </SubmitButton>
            </div>
          </form>
        ) : (
          <div className="bg-slate-50/94 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/82 px-4 py-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">+ Add Line Item</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">Open a fresh scope row only when you need it, so the table stays compact in the field.</div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddFormOpen(true)}
                className={primaryButtonClass}
              >
                + Add Line Item
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-white/88 px-5 py-3.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Running Total</div>
        <div className="text-sm font-semibold text-slate-950">{formatCurrencyFromCents(totalCents)}</div>
      </div>
    </div>
  );
}