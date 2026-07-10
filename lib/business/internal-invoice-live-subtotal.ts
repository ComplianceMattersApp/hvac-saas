// Lane 3: live per-line subtotal preview for the invoice charge forms.
// Pure and dependency-free so it can be unit-tested without importing the
// client component. Returns price × qty for valid non-negative inputs, else
// null so callers fall back to the authoritative server value.
export function computeLiveSubtotal(price: string, qty: string): number | null {
  const parsedPrice = parseFloat(price);
  const parsedQty = parseFloat(qty);
  if (
    !Number.isNaN(parsedPrice)
    && !Number.isNaN(parsedQty)
    && parsedPrice >= 0
    && parsedQty >= 0
  ) {
    return parsedPrice * parsedQty;
  }
  return null;
}
