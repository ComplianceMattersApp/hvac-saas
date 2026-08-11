export type InvoiceCollectionSourceKind =
  | 'stripe_checkout'
  | 'manual_saved_method'
  | 'scheduled_autopay'
  | 'manual_off_platform'
  | 'field_payment_verification';

function clean(value: unknown) {
  return String(value ?? '').trim();
}

export async function claimInvoiceCollectionReservation(params: {
  supabase: any;
  accountOwnerUserId: string;
  invoiceId: string;
  sourceKind: InvoiceCollectionSourceKind;
  reservationKey: string;
  amountCents: number;
  ttlSeconds: number;
}): Promise<boolean> {
  const { data, error } = await params.supabase.rpc('claim_internal_invoice_collection_reservation', {
    p_account_owner_user_id: clean(params.accountOwnerUserId),
    p_invoice_id: clean(params.invoiceId),
    p_source_kind: params.sourceKind,
    p_reservation_key: clean(params.reservationKey),
    p_amount_cents: Number(params.amountCents ?? 0) || 0,
    p_ttl_seconds: Number(params.ttlSeconds ?? 0) || 0,
  });

  if (error) {
    throw new Error(`Failed to claim invoice collection reservation: ${error.message ?? 'unknown error'}`);
  }
  return data === true;
}

export async function releaseInvoiceCollectionReservation(params: {
  supabase: any;
  accountOwnerUserId: string;
  invoiceId: string;
  reservationKey: string;
}): Promise<boolean> {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const invoiceId = clean(params.invoiceId);
  const reservationKey = clean(params.reservationKey);
  if (!accountOwnerUserId || !invoiceId || !reservationKey) return false;

  const { data, error } = await params.supabase.rpc('release_internal_invoice_collection_reservation', {
    p_account_owner_user_id: accountOwnerUserId,
    p_invoice_id: invoiceId,
    p_reservation_key: reservationKey,
  });

  if (error) {
    throw new Error(`Failed to release invoice collection reservation: ${error.message ?? 'unknown error'}`);
  }
  return data === true;
}
