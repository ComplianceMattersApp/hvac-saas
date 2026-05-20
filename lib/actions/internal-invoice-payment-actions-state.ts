export type TenantInvoiceCheckoutSessionActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
  checkoutSessionId: string | null;
  checkoutSessionUrl: string | null;
};

export const INITIAL_TENANT_INVOICE_CHECKOUT_SESSION_ACTION_STATE: TenantInvoiceCheckoutSessionActionState = {
  status: 'idle',
  message: '',
  checkoutSessionId: null,
  checkoutSessionUrl: null,
};
