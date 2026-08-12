/**
 * Cent-safe comparison for QuickBooks amounts.
 *
 * QBO returns money as JSON floats, so comparing dollars directly (or with an
 * epsilon chosen per call site) drifts. Every QBO lane — invoice verification,
 * payment verification, the void payment guard — compares through this one
 * helper so "does QuickBooks agree with us" means the same thing everywhere.
 */
export function toCents(amount: number): number {
  return Math.round(Number(amount ?? 0) * 100);
}

/** True when two QBO dollar amounts agree to the cent (one cent of slack for float noise). */
export function centsMatch(a: number, b: number): boolean {
  return Math.abs(toCents(a) - toCents(b)) <= 1;
}
