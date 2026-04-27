'use client';

import { useState } from 'react';
import SubmitButton from '@/components/SubmitButton';
import type { InternalInvoiceItemType, InternalInvoiceLineItemRecord } from '@/lib/business/internal-invoice';

type ServerFormAction = (formData: FormData) => void | Promise<void>;

type PricebookPickerItem = {
  id: string;
  item_name: string;
  item_type: string;
  category: string | null;
  unit_label: string | null;
  default_unit_price: number;
  default_description: string | null;
};

type InternalInvoiceLineItemsTableProps = {
  jobId: string;
  tab: string;
  lineItems: InternalInvoiceLineItemRecord[];
  totalCents: number;
  addLineItemAction: ServerFormAction;
  addPricebookLineItemAction: ServerFormAction;
  updateLineItemAction: ServerFormAction;
  removeLineItemAction: ServerFormAction;
  pricebookPickerItems: PricebookPickerItem[];
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

export default function InternalInvoiceLineItemsTable({
  jobId,
  tab,
  lineItems,
  totalCents,
  addLineItemAction,
  addPricebookLineItemAction,
  updateLineItemAction,
  removeLineItemAction,
  pricebookPickerItems,
  workspaceFieldLabelClass,
  workspaceInputClass,
  primaryButtonClass,
  secondaryButtonClass,
}: InternalInvoiceLineItemsTableProps) {
  const [expandedAdditionalRowId, setExpandedAdditionalRowId] = useState<string | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [selectedPricebookItemId, setSelectedPricebookItemId] = useState<string>(
    pricebookPickerItems[0]?.id ?? '',
  );
  const selectedPricebookItem =
    pricebookPickerItems.find((item) => item.id === selectedPricebookItemId) ?? null;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/72 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.28)]">
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
        <form action={addPricebookLineItemAction} className="bg-white/92 px-5 py-5">
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
              <form action={updateLineItemAction} className="px-5 py-5">
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
                <form id={`remove-line-item-${lineItem.id}`} action={removeLineItemAction}>
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="tab" value={tab} />
                  <input type="hidden" name="line_item_id" value={lineItem.id} />
                </form>
              </div>
            </div>
          );
        })}

        {isAddFormOpen ? (
          <form action={addLineItemAction} className="bg-slate-50/94 px-5 py-5">
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