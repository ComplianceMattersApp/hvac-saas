'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import SubmitButton from '@/components/SubmitButton';
import type { InternalInvoiceItemType, InternalInvoiceLineItemRecord } from '@/lib/business/internal-invoice';
import type { FieldBillingCapabilities } from '@/lib/auth/field-billing-access';
import type { PricebookEntryItem } from '@/components/pricebook/PricebookLineEntryFields';
import type {
  FieldPricebookNameCheckResult,
  FieldPricebookSaveResult,
} from '@/lib/actions/field-pricebook-actions';
import { computeLiveSubtotal } from '@/lib/business/internal-invoice-live-subtotal';

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

type PricebookPickerItem = PricebookEntryItem;

type VisitScopePickerItem = {
  id: string;
  title: string;
  details: string | null;
  kind: 'primary' | 'companion_service';
  expectedUnitPrice: number | null;
  alreadyAdded: boolean;
};

type InternalInvoiceLineItemsTableProps = {
  jobId: string;
  selectedInvoiceId: string;
  tab: string;
  capabilities: FieldBillingCapabilities;
  lineItems: InternalInvoiceLineItemRecord[];
  totalCents: number;
  addLineItemAction: ServerFormAction;
  addPricebookLineItemAction: ServerFormAction;
  addVisitScopeLineItemsAction: ServerFormAction;
  markNoChargeAction: ServerFormAction;
  markExternallyBilledAction: ServerFormAction;
  billingDisposition?: 'externally_billed' | 'no_charge' | null;
  updateLineItemAction: ServerFormAction;
  removeLineItemAction: ServerFormAction;
  pricebookPickerItems: PricebookPickerItem[];
  visitScopePickerItems: VisitScopePickerItem[];
  workspaceFieldLabelClass: string;
  workspaceInputClass: string;
  primaryButtonClass: string;
  secondaryButtonClass: string;
  // Slice B: compressed mobile field workspace. Off by default so desktop is unchanged.
  isMobileWorkspace?: boolean;
  // Use the compact presentation when this builder is nested in a narrower
  // desktop card. This changes layout only; mobile-only field behavior remains
  // controlled by isMobileWorkspace.
  compactWorkspace?: boolean;
  // Slice C: optional field "save custom charge to Pricebook" actions. Only used on
  // the mobile workspace; desktop never calls them.
  saveFieldItemToPricebookAction?: (formData: FormData) => Promise<FieldPricebookSaveResult>;
  checkFieldPricebookItemNameExistsAction?: (formData: FormData) => Promise<FieldPricebookNameCheckResult>;
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

function formatBillingDispositionLabel(disposition?: 'externally_billed' | 'no_charge' | null) {
  if (disposition === 'no_charge') return 'No Charge Recorded';
  if (disposition === 'externally_billed') return 'Externally Billed';
  return null;
}

function invoiceBannerMessage(banner?: string | null) {
  const normalized = String(banner ?? '').trim().toLowerCase();
  const messages: Record<string, string> = {
    external_billing_recorded: 'Billed outside EveryStep FieldWorks. Draft charges were kept for reference. No internal payment or Stripe collection was recorded.',
    internal_invoice_draft_saved: 'Draft invoice saved.',
    internal_invoice_required_fields: 'Invoice number is required.',
    internal_invoice_number_taken: 'Invoice number is already in use.',
    internal_invoice_line_item_added: 'Invoice charge added.',
    internal_invoice_pricebook_line_item_added: 'Pricebook service/charge added.',
    internal_invoice_visit_scope_line_item_added: 'Work Item charges added.',
    internal_invoice_visit_scope_line_item_partial_added: 'Some selected Work Items were already added.',
    internal_invoice_line_item_saved: 'Invoice charge saved.',
    internal_invoice_line_item_removed: 'Invoice charge removed.',
    internal_invoice_line_item_invalid: 'Invoice charge fields are invalid.',
    internal_invoice_line_item_missing: 'Invoice charge is missing or no longer available.',
    internal_invoice_pricebook_item_missing: 'Select a Pricebook item.',
    internal_invoice_pricebook_quantity_invalid: 'Quantity must be greater than zero.',
    internal_invoice_pricebook_item_not_found: 'Pricebook item is unavailable.',
    internal_invoice_pricebook_item_inactive: 'Pricebook item is inactive.',
    internal_invoice_pricebook_negative_price_deferred: 'Adjustment/negative price items are not available here yet.',
    internal_invoice_visit_scope_item_invalid: 'Work Item selection is invalid.',
    internal_invoice_visit_scope_item_missing: 'Select at least one Work Item.',
    internal_invoice_visit_scope_quantity_invalid: 'Quantity must be greater than zero.',
    internal_invoice_visit_scope_item_not_found: 'Work Item is unavailable.',
    internal_invoice_visit_scope_line_item_duplicate: 'Selected Work Items are already added.',
    internal_invoice_no_charge_saved: 'Billing resolved as No Charge.',
    internal_invoice_externally_billed_saved: 'Billed outside EveryStep FieldWorks. Draft charges were kept for reference. No internal payment or Stripe collection was recorded.',
    internal_invoice_disposition_requires_zero_total: 'No Charge is only available for $0.00 draft invoices.',
    internal_invoice_locked: 'Invoice is locked and cannot be edited.',
    internal_invoice_line_items_locked: 'Invoice charges are locked.',
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

// Shared "More details" disclosure trigger for the desktop edit + manual-add
// forms. The mobile edit form keeps its own inline <details> and is
// intentionally not routed through this helper (per Lane 3 boundaries).
function MoreDetailsSummary() {
  return (
    <summary className="mt-2 flex list-none cursor-pointer select-none items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-700 [&::-webkit-details-marker]:hidden">
      <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
      More details — type, quantity, notes
    </summary>
  );
}

const INTERNAL_INVOICE_TYPE_OPTIONS = (
  <>
    <option value="service">Service</option>
    <option value="material">Material</option>
    <option value="diagnostic">Diagnostic</option>
    <option value="adjustment">Adjustment</option>
    <option value="other">Other</option>
  </>
);

type DesktopLineItemEditFormProps = {
  lineItem: InternalInvoiceLineItemRecord;
  index: number;
  isPrimaryRow: boolean;
  jobId: string;
  selectedInvoiceId: string;
  tab: string;
  handleUpdateLineItem: (formData: FormData) => void | Promise<void>;
  handleRemoveLineItem: (formData: FormData) => void | Promise<void>;
  onHideDetails: () => void;
  canEditDescription: boolean;
  canEditQuantity: boolean;
  canEditPrice: boolean;
  canEditAnyLine: boolean;
  canRemoveLine: boolean;
  workspaceFieldLabelClass: string;
  workspaceInputClass: string;
  secondaryButtonClass: string;
};

// Lane 3: desktop charge edit form with progressive disclosure. Item Name +
// Unit Price + live Subtotal stay in Tier 1; Type / Quantity / Description
// collapse behind "More details". Extracted from the row map so each row owns
// its own live-subtotal state (hooks cannot live inside .map()).
function DesktopLineItemEditForm({
  lineItem,
  index,
  isPrimaryRow,
  jobId,
  selectedInvoiceId,
  tab,
  handleUpdateLineItem,
  handleRemoveLineItem,
  onHideDetails,
  canEditDescription,
  canEditQuantity,
  canEditPrice,
  canEditAnyLine,
  canRemoveLine,
  workspaceFieldLabelClass,
  workspaceInputClass,
  secondaryButtonClass,
}: DesktopLineItemEditFormProps) {
  const priceRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const [liveSubtotal, setLiveSubtotal] = useState<number | null>(
    () => Number(lineItem.unit_price) * Number(lineItem.quantity),
  );

  // Open the disclosure automatically when it would otherwise hide real data:
  // a non-Service type, a quantity other than 1, or an existing description.
  const hasNonDefaultDetails =
    lineItem.item_type_snapshot !== 'service'
    || Number(lineItem.quantity) !== 1
    || Boolean(lineItem.description_snapshot?.trim());

  function recomputeLiveSubtotal() {
    const price = priceRef.current?.value ?? '';
    // Quantity lives behind the disclosure; when untouched/blank use the server
    // default of 1 so the preview matches what will actually be saved.
    const qty = quantityRef.current?.value.trim() || '1';
    setLiveSubtotal(computeLiveSubtotal(price, qty));
  }

  async function saveWithLivePreviewReset(formData: FormData) {
    await handleUpdateLineItem(formData);
    // Authoritative subtotal returns via router.refresh(); drop the preview.
    setLiveSubtotal(null);
  }

  const subtotalDisplay =
    liveSubtotal !== null
      ? formatCurrencyFromCents(Math.round(liveSubtotal * 100))
      : formatCurrencyFromAmount(lineItem.line_subtotal);

  return (
    <div className="bg-white/72">
      <form action={saveWithLivePreviewReset} className="px-5 py-5">
        <input type="hidden" name="job_id" value={jobId} />
        <input type="hidden" name="invoice_id" value={selectedInvoiceId} />
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="line_item_id" value={lineItem.id} />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Line {index + 1}</div>
            <div className="mt-1 text-xs text-slate-500">{isPrimaryRow ? 'Main invoice charge' : 'Editing details'}</div>
          </div>
          <div className="flex items-center gap-2">
            {!isPrimaryRow ? (
              <button
                type="button"
                onClick={onHideDetails}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition-[background-color,border-color,transform] hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 active:translate-y-[0.5px]"
              >
                Hide Details
              </button>
            ) : null}
            <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:hidden">
              {subtotalDisplay}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className={workspaceFieldLabelClass}>Item Name</label>
            <input
              name="item_name_snapshot"
              defaultValue={lineItem.item_name_snapshot}
              className={workspaceInputClass}
              disabled={!canEditDescription}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            <div>
              <label className={workspaceFieldLabelClass}>Unit Price</label>
              <input
                ref={priceRef}
                name="unit_price"
                inputMode="decimal"
                defaultValue={formatDecimalInput(lineItem.unit_price)}
                onChange={recomputeLiveSubtotal}
                className={workspaceInputClass}
                disabled={!canEditPrice}
                required
              />
            </div>

            <div>
              <label className={workspaceFieldLabelClass}>Subtotal</label>
              <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-slate-900">
                {subtotalDisplay}
              </div>
            </div>
          </div>

          <details className="group" open={hasNonDefaultDetails}>
            <MoreDetailsSummary />
            <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:items-start">
              <div>
                <label className={workspaceFieldLabelClass}>Type</label>
                <select
                  name="item_type_snapshot"
                  defaultValue={lineItem.item_type_snapshot}
                  className={workspaceInputClass}
                  disabled={!canEditDescription}
                >
                  {INTERNAL_INVOICE_TYPE_OPTIONS}
                </select>
              </div>

              <div>
                <label className={workspaceFieldLabelClass}>Quantity</label>
                <input
                  ref={quantityRef}
                  name="quantity"
                  inputMode="decimal"
                  defaultValue={formatDecimalInput(lineItem.quantity)}
                  onChange={recomputeLiveSubtotal}
                  className={workspaceInputClass}
                  disabled={!canEditQuantity}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={workspaceFieldLabelClass}>Description / Work Instruction</label>
                <textarea
                  name="description_snapshot"
                  defaultValue={String(lineItem.description_snapshot ?? '')}
                  className={`${workspaceInputClass} min-h-[5.5rem]`}
                  disabled={!canEditDescription}
                  placeholder="Scope detail, work instruction, or install note"
                />
              </div>
            </div>
          </details>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-3.5">
          <div className="text-xs text-slate-500">
            {canEditAnyLine
              ? 'Save after editing this row to keep totals and issued charges in sync.'
              : 'This row is read-only for edits under your current direct invoice permissions.'}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEditAnyLine ? (
              <SubmitButton loadingText="Saving..." className={secondaryButtonClass}>
                Save Charge
              </SubmitButton>
            ) : null}
            {canRemoveLine ? (
              <button
                type="submit"
                form={`remove-line-item-${lineItem.id}`}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 active:translate-y-[0.5px]"
              >
                Remove Charge
              </button>
            ) : null}
          </div>
        </div>
      </form>

      <div className="sr-only">
        <form id={`remove-line-item-${lineItem.id}`} action={handleRemoveLineItem}>
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="invoice_id" value={selectedInvoiceId} />
          <input type="hidden" name="tab" value={tab} />
          <input type="hidden" name="line_item_id" value={lineItem.id} />
        </form>
      </div>
    </div>
  );
}

type ManualAddChargeFormProps = {
  handleAddManual: (formData: FormData) => void | Promise<void>;
  jobId: string;
  selectedInvoiceId: string;
  tab: string;
  workspaceFieldLabelClass: string;
  workspaceInputClass: string;
  secondaryButtonClass: string;
};

// Lane 3: manual-add charge form with progressive disclosure. Charge name +
// Unit Price + live Subtotal in Tier 1; Type / Quantity / Description behind
// "More details". Slice C snapshot field names (item_name_snapshot, unit_price,
// item_type_snapshot) are preserved for the save-to-pricebook suggestion.
function ManualAddChargeForm({
  handleAddManual,
  jobId,
  selectedInvoiceId,
  tab,
  workspaceFieldLabelClass,
  workspaceInputClass,
  secondaryButtonClass,
}: ManualAddChargeFormProps) {
  const priceRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const [liveSubtotal, setLiveSubtotal] = useState<number | null>(null);

  function recomputeLiveSubtotal() {
    const price = priceRef.current?.value ?? '';
    const qty = quantityRef.current?.value.trim() || '1';
    setLiveSubtotal(computeLiveSubtotal(price, qty));
  }

  // The manual-add form unmounts on a successful add (isAddFormOpen flips to
  // false), so the live-subtotal preview resets to null on next open without an
  // explicit wrapper — keeping the action wired straight to handleAddManual.
  return (
    <form action={handleAddManual} className="rounded-xl border border-slate-200 bg-white/90 px-4 py-4">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="invoice_id" value={selectedInvoiceId} />
      <input type="hidden" name="tab" value={tab} />
      <div className="text-sm font-semibold text-slate-950">Manual Charge</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">
        Type a one-off invoice charge when the Pricebook does not have the item you need.
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="manual_invoice_item_name" className={workspaceFieldLabelClass}>
            Charge name
          </label>
          <input
            id="manual_invoice_item_name"
            name="item_name_snapshot"
            placeholder="Type invoice charge..."
            className={workspaceInputClass}
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
          <div>
            <label htmlFor="manual_invoice_unit_price" className={workspaceFieldLabelClass}>
              Unit Price
            </label>
            <input
              id="manual_invoice_unit_price"
              ref={priceRef}
              name="unit_price"
              inputMode="decimal"
              placeholder="0.00"
              onChange={recomputeLiveSubtotal}
              className={workspaceInputClass}
              required
            />
          </div>

          <div>
            <label className={workspaceFieldLabelClass}>Subtotal</label>
            <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-slate-900">
              {liveSubtotal !== null ? formatCurrencyFromCents(Math.round(liveSubtotal * 100)) : '—'}
            </div>
          </div>
        </div>

        <details className="group">
          <MoreDetailsSummary />
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="manual_invoice_item_type" className={workspaceFieldLabelClass}>
                Type
              </label>
              <select id="manual_invoice_item_type" name="item_type_snapshot" className={workspaceInputClass} defaultValue="service">
                {INTERNAL_INVOICE_TYPE_OPTIONS}
              </select>
            </div>

            <div>
              <label htmlFor="manual_invoice_quantity" className={workspaceFieldLabelClass}>
                Quantity
              </label>
              <input
                id="manual_invoice_quantity"
                ref={quantityRef}
                name="quantity"
                inputMode="decimal"
                defaultValue="1.00"
                onChange={recomputeLiveSubtotal}
                className={workspaceInputClass}
              />
            </div>

            <div>
              <label htmlFor="manual_invoice_description" className={workspaceFieldLabelClass}>
                Description
              </label>
              <textarea
                id="manual_invoice_description"
                name="description_snapshot"
                className={`${workspaceInputClass} min-h-[5rem]`}
                placeholder="Optional charge detail"
              />
            </div>
          </div>
        </details>
      </div>
      <SubmitButton loadingText="Adding..." className={`${secondaryButtonClass} mt-4 w-full`}>
        Add Manual Charge
      </SubmitButton>
    </form>
  );
}

export default function InternalInvoiceLineItemsTable({
  jobId,
  selectedInvoiceId,
  tab,
  capabilities,
  lineItems,
  totalCents,
  addLineItemAction,
  addPricebookLineItemAction,
  addVisitScopeLineItemsAction,
  markNoChargeAction,
  markExternallyBilledAction,
  billingDisposition = null,
  updateLineItemAction,
  removeLineItemAction,
  pricebookPickerItems,
  visitScopePickerItems,
  workspaceFieldLabelClass,
  workspaceInputClass,
  primaryButtonClass,
  secondaryButtonClass,
  isMobileWorkspace = false,
  compactWorkspace = false,
  saveFieldItemToPricebookAction,
  checkFieldPricebookItemNameExistsAction,
}: InternalInvoiceLineItemsTableProps) {
  const router = useRouter();
  const useCompactLayout = isMobileWorkspace || compactWorkspace;
  const [expandedAdditionalRowId, setExpandedAdditionalRowId] = useState<string | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<InlineFeedback | null>(null);
  const [selectedPricebookItemId, setSelectedPricebookItemId] = useState<string>('');
  const [pricebookSearchQuery, setPricebookSearchQuery] = useState('');
  const [selectedVisitScopeItemIds, setSelectedVisitScopeItemIds] = useState<string[]>([]);
  // Slice C: ephemeral "save this custom item to your price list?" suggestion.
  const [pendingSaveSuggestion, setPendingSaveSuggestion] = useState<{
    itemName: string;
    unitPrice: string;
    itemType: string;
  } | null>(null);
  const [savingSuggestion, setSavingSuggestion] = useState(false);
  const suggestionCardRef = useRef<HTMLDivElement | null>(null);

  // Dismiss the suggestion when the user taps anywhere outside it.
  useEffect(() => {
    if (!pendingSaveSuggestion) return;
    function onDocumentClick(event: MouseEvent) {
      if (suggestionCardRef.current && !suggestionCardRef.current.contains(event.target as Node)) {
        setPendingSaveSuggestion(null);
      }
    }
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [pendingSaveSuggestion]);

  function openAddForm() {
    // Opening another add form clears any pending suggestion (one prompt at a time).
    setPendingSaveSuggestion(null);
    setIsAddFormOpen(true);
  }

  // Slice C: after a manual charge is added on mobile, offer to save it to the
  // Pricebook when no active item with that name already exists. Best-effort — a
  // failure here never disrupts the charge that was already created.
  async function maybeOfferPricebookSave(candidate: { itemName: string; unitPrice: string; itemType: string }) {
    if (!isMobileWorkspace || !checkFieldPricebookItemNameExistsAction || !saveFieldItemToPricebookAction) return;
    const name = candidate.itemName.trim();
    const price = Number(String(candidate.unitPrice).replace(/[$,\s]/g, ''));
    if (!name || !Number.isFinite(price) || price <= 0) return;
    try {
      const checkForm = new FormData();
      checkForm.set('item_name', name);
      const result = await checkFieldPricebookItemNameExistsAction(checkForm);
      if (!result?.exists) {
        setPendingSaveSuggestion({ itemName: name, unitPrice: price.toFixed(2), itemType: candidate.itemType });
      }
    } catch {
      // Suggestion is optional; ignore failures.
    }
  }

  async function handleSaveSuggestionToPricebook() {
    if (!pendingSaveSuggestion || !saveFieldItemToPricebookAction) return;
    setSavingSuggestion(true);
    try {
      const form = new FormData();
      form.set('item_name', pendingSaveSuggestion.itemName);
      form.set('unit_price', pendingSaveSuggestion.unitPrice);
      form.set('item_type', pendingSaveSuggestion.itemType);
      const result = await saveFieldItemToPricebookAction(form);
      setFeedback(
        result?.ok
          ? { type: 'success', message: result.status === 'already_exists' ? 'Already in your price list.' : 'Added to your price list.' }
          : { type: 'error', message: 'Could not save to your price list.' },
      );
    } catch {
      setFeedback({ type: 'error', message: 'Could not save to your price list.' });
    } finally {
      setSavingSuggestion(false);
      setPendingSaveSuggestion(null);
    }
  }
  const canAddPricebookLine = capabilities.can_select_pricebook_invoice_lines;
  const canAddManualLine = capabilities.can_add_manual_invoice_line;
  const canAddInvoiceLine = canAddPricebookLine || canAddManualLine;
  const canAddVisitScopeLine = capabilities.can_convert_visit_scope_to_invoice_lines;
  const canEditDescription = capabilities.can_edit_invoice_line_description;
  const canEditQuantity = capabilities.can_edit_invoice_line_quantity;
  const canEditPrice = capabilities.can_edit_invoice_line_price;
  const canEditAnyLine = canEditDescription || canEditQuantity || canEditPrice;
  const canRemoveLine = capabilities.can_remove_invoice_line;
  const canMutateDraftLines =
    canAddInvoiceLine
    || canAddVisitScopeLine
    || canEditAnyLine
    || canRemoveLine;
  const eligibleVisitScopeItems = visitScopePickerItems.filter((item) => !item.alreadyAdded);
  const billingDispositionLabel = formatBillingDispositionLabel(billingDisposition);
  const totalCentsValue = Number(totalCents ?? 0);
  const isZeroDollarDraft = totalCentsValue === 0;
  const pricebookSearch = pricebookSearchQuery.trim().toLowerCase();
  const filteredPricebookPickerItems = pricebookSearch
    ? pricebookPickerItems.filter((item) => {
        const searchCorpus = [
          item.item_name,
          item.default_description,
          item.item_type,
          item.category,
        ].filter(Boolean).join(' ').toLowerCase();
        return searchCorpus.includes(pricebookSearch);
      }).slice(0, 8)
    : pricebookPickerItems.slice(0, 6);
  const selectedPricebookItem = pricebookPickerItems.find((item) => item.id === selectedPricebookItemId) ?? null;

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
      successFallback: 'Pricebook service/charge added.',
      errorFallback: 'Could not add Pricebook service/charge.',
      onSuccess: () => {
        setSelectedPricebookItemId('');
        setPricebookSearchQuery('');
        setIsAddFormOpen(false);
      },
    });
  }

  async function handleAddManual(formData: FormData) {
    // Capture the typed values before the mutation so we can offer a Pricebook save.
    const candidate = {
      itemName: String(formData.get('item_name_snapshot') ?? '').trim(),
      unitPrice: String(formData.get('unit_price') ?? '').trim(),
      itemType: String(formData.get('item_type_snapshot') ?? '').trim() || 'service',
    };
    setPendingSaveSuggestion(null);
    await runInlineMutation({
      formData,
      action: addLineItemAction,
      successFallback: 'Invoice charge added.',
      errorFallback: 'Could not add invoice charge.',
      onSuccess: () => {
        setPricebookSearchQuery('');
        setIsAddFormOpen(false);
        void maybeOfferPricebookSave(candidate);
      },
    });
  }

  async function handleAddVisitScope(formData: FormData) {
    await runInlineMutation({
      formData,
      action: addVisitScopeLineItemsAction,
      successFallback: 'Work Item charges added.',
      errorFallback: 'Could not add Work Item charges.',
      onSuccess: () => setSelectedVisitScopeItemIds([]),
    });
  }

  async function handleBillingDisposition(formData: FormData, action: ServerFormAction) {
    await runInlineMutation({
      formData,
      action,
      successFallback: 'Billing disposition saved.',
      errorFallback: 'Could not save billing disposition.',
    });
  }

  async function handleExternalBillingDisposition(formData: FormData) {
    await markExternallyBilledAction(formData);
  }

  async function handleUpdateLineItem(formData: FormData) {
    await runInlineMutation({
      formData,
      action: updateLineItemAction,
      successFallback: 'Invoice charge saved.',
      errorFallback: 'Could not save invoice charge.',
    });
  }

  async function handleRemoveLineItem(formData: FormData) {
    await runInlineMutation({
      formData,
      action: removeLineItemAction,
      successFallback: 'Invoice charge removed.',
      errorFallback: 'Could not remove invoice charge.',
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

      {billingDisposition === 'externally_billed' ? (
        <div className="border-b border-emerald-200/80 bg-emerald-50/75 px-5 py-3">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold text-emerald-950">Billed outside EveryStep FieldWorks</div>
            <div className="text-xs leading-5 text-emerald-900">
              Draft charges were kept for reference. No internal payment or Stripe collection was recorded.
            </div>
          </div>
        </div>
      ) : isZeroDollarDraft && billingDispositionLabel ? (
        <div className="border-b border-emerald-200/80 bg-emerald-50/75 px-5 py-3">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold text-emerald-950">{billingDispositionLabel}</div>
            <div className="text-xs leading-5 text-emerald-900">
              Billing is handled for this $0.00 invoice. No payment was recorded.
            </div>
          </div>
        </div>
      ) : isZeroDollarDraft ? (
        <div className="border-b border-amber-200/80 bg-amber-50/75 px-5 py-3">
          <div className={`flex flex-col gap-3 ${useCompactLayout ? '' : 'lg:flex-row lg:items-center lg:justify-between'}`}>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-amber-950">$0.00 invoice - choose how to handle it</div>
              <div className="mt-1 text-xs leading-5 text-amber-900">
                Add a charge if billing is missing. No Charge resolves billing without collecting money. External Billing Complete resolves billing handled outside EveryStep FieldWorks.
              </div>
            </div>
            <div className={`grid shrink-0 gap-2 ${useCompactLayout ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:flex sm:flex-wrap sm:justify-end'}`}>
              <button
                type="button"
                onClick={openAddForm}
                disabled={!canAddInvoiceLine}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[background-color,border-color,transform] hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
              >
                Add Charge
              </button>
              <form action={(formData) => handleBillingDisposition(formData, markNoChargeAction)}>
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="invoice_id" value={selectedInvoiceId} />
                <input type="hidden" name="tab" value={tab} />
                <SubmitButton
                  loadingText="Saving..."
                  className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[background-color,border-color,transform] hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 active:translate-y-[0.5px]"
                >
                  Mark No Charge
                </SubmitButton>
              </form>
              <form action={handleExternalBillingDisposition}>
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="invoice_id" value={selectedInvoiceId} />
                <input type="hidden" name="tab" value={tab} />
                <input type="hidden" name="return_to" value={`/jobs/${jobId}/invoice?banner=external_billing_recorded#invoice-workspace`} />
                <SubmitButton
                  loadingText="Saving..."
                  className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[background-color,border-color,transform] hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 active:translate-y-[0.5px]"
                >
                  External Billing Complete
                </SubmitButton>
              </form>
              <button
                type="button"
                disabled
                title="Sending a no-payment-due invoice needs an approved zero-dollar issued invoice model."
                className="inline-flex min-h-9 cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400"
              >
                Send $0 Invoice
              </button>
            </div>
          </div>
        </div>
      ) : !billingDispositionLabel ? (
        (() => {
          // Single source for the external-billing block (one form, label before the
          // return_to). Rendered directly on desktop (unchanged); wrapped in a
          // disclosure on mobile so it stays collapsed by default.
          const externalBillingBlock = (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-sky-950">External billing option</div>
                <div className="mt-1 text-xs leading-5 text-sky-900">
                  Mark this job as billed outside EveryStep FieldWorks. Existing draft line items will stay here for reference, but this draft will not be treated as the invoice sent through the app.
                </div>
              </div>
              <form className="shrink-0" action={handleExternalBillingDisposition}>
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="invoice_id" value={selectedInvoiceId} />
                <input type="hidden" name="tab" value={tab} />
                <input type="hidden" name="return_to" value={`/jobs/${jobId}/invoice?banner=external_billing_recorded#invoice-workspace`} />
                <SubmitButton
                  loadingText="Saving..."
                  className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[background-color,border-color,transform] hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 active:translate-y-[0.5px]"
                >
                  External Billing Complete
                </SubmitButton>
              </form>
            </div>
          );
          return (
            <div className="border-b border-sky-200/80 bg-sky-50/75 px-5 py-3">
              {/* Slice B cleanup (Fix 3): collapse behind a disclosure on mobile. */}
              {useCompactLayout ? (
                <details>
                  <summary className="cursor-pointer list-none text-sm font-semibold text-sky-950">External billing option</summary>
                  <div className="mt-2">{externalBillingBlock}</div>
                </details>
              ) : (
                externalBillingBlock
              )}
            </div>
          );
        })()
      ) : null}

      <div className={`${useCompactLayout ? 'hidden' : 'hidden md:grid'} grid-cols-[minmax(0,2.35fr)_minmax(8.5rem,0.9fr)_minmax(6.25rem,0.74fr)_minmax(7.25rem,0.84fr)_minmax(8rem,0.9fr)_auto] gap-4 border-b border-slate-200/80 bg-white/88 px-5 py-3`}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice Charge</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Type</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Qty</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Unit Price</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Subtotal</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Edit</div>
      </div>

      {lineItems.length === 0 ? (
        <div className="border-b border-dashed border-slate-200 bg-white/72 px-5 py-3.5 text-sm text-slate-600">
          Start with the first charge below. Each row is an invoice charge for this invoice.
        </div>
      ) : null}

      <div className="divide-y divide-slate-200/80">
        {canAddVisitScopeLine && eligibleVisitScopeItems.length > 0 ? (
          <form action={handleAddVisitScope} className="bg-sky-50/50 px-5 py-5">
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="invoice_id" value={selectedInvoiceId} />
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="quantity" value="1.00" />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">Recommended Path: Start with Work Items</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  Use Work Items when this charge comes from work completed on the job. These can become invoice charges when ready.
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  Work Item price carries into the draft charge when available. Review quantity and price before issuing.
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {eligibleVisitScopeItems.map((item) => {
                const isChecked = selectedVisitScopeItemIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className="block rounded-xl border border-slate-200 bg-white px-3.5 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="visit_scope_item_ids"
                        value={item.id}
                        checked={isChecked}
                        onChange={() => toggleVisitScopeItem(item.id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            {item.kind === 'companion_service' ? 'Companion Service' : 'Primary'}
                          </span>
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-700">
                            Price {formatCurrencyFromAmount(item.expectedUnitPrice)}
                          </span>
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
                Select one or more Work Items to add as draft charges.
              </div>
              <SubmitButton
                loadingText="Adding..."
                className={primaryButtonClass}
                disabled={selectedVisitScopeItemIds.length === 0}
              >
                Add from Work Items
              </SubmitButton>
            </div>
          </form>
        ) : null}

        {lineItems.map((lineItem, index) => {
          // Slice B: on mobile no row is auto-expanded; all rows are tap-to-expand.
          const isPrimaryRow = !useCompactLayout && index === 0;
          const isExpanded = isPrimaryRow || expandedAdditionalRowId === lineItem.id;
          const rowCanInteract = canEditAnyLine || canRemoveLine;

          if (!isExpanded && useCompactLayout) {
            const summaryLine = (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-950">{lineItem.item_name_snapshot}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {formatDecimalInput(lineItem.quantity)} × {formatCurrencyFromAmount(lineItem.unit_price)}
                  {' = '}
                  <span className="font-semibold text-slate-700">{formatCurrencyFromAmount(lineItem.line_subtotal)}</span>
                </div>
              </div>
            );
            const trailing = (
              <span className="shrink-0 text-sm font-semibold text-slate-950">
                {formatCurrencyFromAmount(lineItem.line_subtotal)}
              </span>
            );
            return rowCanInteract ? (
              <button
                key={lineItem.id}
                type="button"
                onClick={() => setExpandedAdditionalRowId(lineItem.id)}
                className="flex w-full items-center justify-between gap-3 bg-white/78 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
              >
                {summaryLine}
                {trailing}
              </button>
            ) : (
              <div key={lineItem.id} className="flex items-center justify-between gap-3 bg-white/78 px-4 py-3.5">
                {summaryLine}
                {trailing}
              </div>
            );
          }

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
                    {canEditAnyLine || canRemoveLine ? (
                      <button
                        type="button"
                        onClick={() => setExpandedAdditionalRowId(lineItem.id)}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-14px_rgba(2,132,199,0.65)] transition-[background-color,box-shadow,transform] hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 active:translate-y-[0.5px]"
                      >
                        {canEditAnyLine ? 'Edit Details' : 'Manage Row'}
                      </button>
                    ) : (
                      <span className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                        View only
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          if (useCompactLayout) {
            return (
              <div key={lineItem.id} className="bg-white/72">
                <form action={handleUpdateLineItem} className="px-4 py-4">
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="invoice_id" value={selectedInvoiceId} />
                  <input type="hidden" name="tab" value={tab} />
                  <input type="hidden" name="line_item_id" value={lineItem.id} />

                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Line {index + 1}
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedAdditionalRowId(null)}
                      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
                    >
                      Done
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className={workspaceFieldLabelClass}>Item Name</label>
                      <input
                        name="item_name_snapshot"
                        defaultValue={lineItem.item_name_snapshot}
                        className={workspaceInputClass}
                        disabled={!canEditDescription}
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
                        disabled={!canEditPrice}
                        required
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Subtotal</span>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrencyFromAmount(lineItem.line_subtotal)}</span>
                    </div>

                    <details className="rounded-lg border border-slate-200 bg-white/70 px-3.5 py-2.5">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700">
                        More details
                      </summary>
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className={workspaceFieldLabelClass}>Type</label>
                          <select
                            name="item_type_snapshot"
                            defaultValue={lineItem.item_type_snapshot}
                            className={workspaceInputClass}
                            disabled={!canEditDescription}
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
                            disabled={!canEditQuantity}
                            required
                          />
                        </div>

                        <div>
                          <label className={workspaceFieldLabelClass}>Description / Work Instruction</label>
                          <textarea
                            name="description_snapshot"
                            defaultValue={String(lineItem.description_snapshot ?? '')}
                            className={`${workspaceInputClass} min-h-[5.5rem]`}
                            disabled={!canEditDescription}
                            placeholder="Scope detail, work instruction, or install note"
                          />
                        </div>
                      </div>
                    </details>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    {canEditAnyLine ? (
                      <SubmitButton loadingText="Saving..." className={`${secondaryButtonClass} flex-1`}>
                        Save Charge
                      </SubmitButton>
                    ) : null}
                    {canRemoveLine ? (
                      <button
                        type="submit"
                        form={`remove-line-item-${lineItem.id}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </form>

                <div className="sr-only">
                  <form id={`remove-line-item-${lineItem.id}`} action={handleRemoveLineItem}>
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="invoice_id" value={selectedInvoiceId} />
                    <input type="hidden" name="tab" value={tab} />
                    <input type="hidden" name="line_item_id" value={lineItem.id} />
                  </form>
                </div>
              </div>
            );
          }

          return (
            <DesktopLineItemEditForm
              key={lineItem.id}
              lineItem={lineItem}
              index={index}
              isPrimaryRow={isPrimaryRow}
              jobId={jobId}
              selectedInvoiceId={selectedInvoiceId}
              tab={tab}
              handleUpdateLineItem={handleUpdateLineItem}
              handleRemoveLineItem={handleRemoveLineItem}
              onHideDetails={() => setExpandedAdditionalRowId(null)}
              canEditDescription={canEditDescription}
              canEditQuantity={canEditQuantity}
              canEditPrice={canEditPrice}
              canEditAnyLine={canEditAnyLine}
              canRemoveLine={canRemoveLine}
              workspaceFieldLabelClass={workspaceFieldLabelClass}
              workspaceInputClass={workspaceInputClass}
              secondaryButtonClass={secondaryButtonClass}
            />
          );
        })}

        {/* Slice C: optional "save to price list" suggestion, mobile only. */}
        {isMobileWorkspace && pendingSaveSuggestion ? (
          <div ref={suggestionCardRef} className="bg-sky-50/70 px-4 py-3">
            <div className="rounded-xl border border-sky-200 bg-white/80 px-3.5 py-3">
              <div className="text-sm text-slate-700">
                Save <span className="font-semibold text-slate-950">&ldquo;{pendingSaveSuggestion.itemName}&rdquo;</span> at{' '}
                <span className="font-semibold text-slate-950">${pendingSaveSuggestion.unitPrice}</span> to your price list for next time?
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveSuggestionToPricebook}
                  disabled={savingSuggestion}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {savingSuggestion ? 'Saving...' : 'Save to Price List'}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingSaveSuggestion(null)}
                  disabled={savingSuggestion}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                >
                  No thanks
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {canAddInvoiceLine && isAddFormOpen ? (
          <div className="bg-slate-50/94 px-5 py-5">

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Add another charge</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  Use this for fees, add-ons, or anything not already listed on the invoice.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddFormOpen(false);
                  setSelectedPricebookItemId('');
                }}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
              >
                Cancel
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
              {canAddPricebookLine ? (
                <form action={handleAddPricebook} className="rounded-xl border border-slate-200 bg-white/90 px-4 py-4">
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="invoice_id" value={selectedInvoiceId} />
                  <input type="hidden" name="tab" value={tab} />
                  <div className="text-sm font-semibold text-slate-950">Search Pricebook</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Type to find a service or charge, then add it with the saved Pricebook description and price.
                  </div>
                  <label htmlFor="invoice_pricebook_search" className={`${workspaceFieldLabelClass} mt-4`}>
                    Search service or charge
                  </label>
                  <input
                    id="invoice_pricebook_search"
                    type="search"
                    value={pricebookSearchQuery}
                    onChange={(event) => {
                      setPricebookSearchQuery(event.target.value);
                      setSelectedPricebookItemId('');
                    }}
                    placeholder="Search Pricebook services..."
                    className={workspaceInputClass}
                  />

                  {pricebookPickerItems.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {filteredPricebookPickerItems.length > 0 ? (
                        filteredPricebookPickerItems.map((item) => {
                          const isSelected = selectedPricebookItemId === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setSelectedPricebookItemId(item.id)}
                              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${isSelected ? 'border-blue-300 bg-blue-50 text-blue-950' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 text-sm font-semibold">{item.item_name}</div>
                                <div className="shrink-0 text-xs font-semibold">{formatCurrencyFromAmount(item.default_unit_price)}</div>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                <span>{formatInternalInvoiceItemType(item.item_type)}</span>
                                {item.category ? <span>{item.category}</span> : null}
                                {item.unit_label ? <span>Unit: {item.unit_label}</span> : null}
                              </div>
                              {item.default_description ? (
                                <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.default_description}</div>
                              ) : null}
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                          No Pricebook items match that search. Use the manual charge form.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3.5 py-3 text-sm leading-6 text-amber-900">
                      No active non-credit Pricebook items are available for draft invoice adds yet.
                    </div>
                  )}

                  <input type="hidden" name="pricebook_item_id" value={selectedPricebookItemId} />
                  <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div>
                      <label htmlFor="invoice_pricebook_quantity" className={workspaceFieldLabelClass}>
                        Quantity
                      </label>
                      <input
                        id="invoice_pricebook_quantity"
                        name="quantity"
                        inputMode="decimal"
                        defaultValue="1.00"
                        required
                        className={workspaceInputClass}
                      />
                    </div>
                    <SubmitButton
                      loadingText="Adding..."
                      className={`${primaryButtonClass} w-full sm:w-auto`}
                      disabled={!selectedPricebookItemId}
                    >
                      Add Pricebook Charge
                    </SubmitButton>
                  </div>

                  {selectedPricebookItem ? (
                    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2.5 text-xs leading-5 text-blue-950">
                      Selected: <span className="font-semibold">{selectedPricebookItem.item_name}</span>
                    </div>
                  ) : null}
                </form>
              ) : null}

              {canAddManualLine ? (
                <ManualAddChargeForm
                  handleAddManual={handleAddManual}
                  jobId={jobId}
                  selectedInvoiceId={selectedInvoiceId}
                  tab={tab}
                  workspaceFieldLabelClass={workspaceFieldLabelClass}
                  workspaceInputClass={workspaceInputClass}
                  secondaryButtonClass={secondaryButtonClass}
                />
              ) : null}
            </div>
          </div>
        ) : canAddInvoiceLine ? (
          <div className="bg-slate-50/94 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/82 px-4 py-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Add another charge</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">Use this for fees, add-ons, or anything not already listed on the invoice.</div>
              </div>
              <button
                type="button"
                onClick={openAddForm}
                className={`${primaryButtonClass}${isMobileWorkspace ? ' w-full' : ''}`}
              >
                {isMobileWorkspace ? '+ Add Item' : 'Add Charge'}
              </button>
            </div>
          </div>
        ) : canMutateDraftLines ? null : (
          <div className="bg-slate-50/94 px-5 py-4">
            <div className="rounded-xl border border-slate-200/80 bg-white/82 px-4 py-3 text-xs leading-5 text-slate-500">
              Draft invoice charges are visible, but charge changes are not available under your current permissions.
            </div>
          </div>
        )}
      </div>

      <div
        className={
          isMobileWorkspace
            ? "sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-8px_20px_-16px_rgba(15,23,42,0.4)]"
            : "flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-white/88 px-5 py-3.5"
        }
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Running Total</div>
        <div className="text-sm font-semibold text-slate-950">{formatCurrencyFromCents(totalCents)}</div>
      </div>
    </div>
  );
}
