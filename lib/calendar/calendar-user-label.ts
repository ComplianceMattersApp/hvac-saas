export function compactCalendarUserLabel(input: {
  displayName?: string | null;
  email?: string | null;
  fallback?: string;
  maxLength?: number;
}) {
  const fallback = String(input.fallback ?? 'User').trim() || 'User';
  const maxLength = Math.max(6, input.maxLength ?? 18);
  const displayName = String(input.displayName ?? '').trim();
  const email = String(input.email ?? '').trim();

  let label = displayName;
  if (label.includes('@')) {
    label = label.split('@')[0]?.trim() || '';
  }
  if (!label && email) {
    label = email.split('@')[0]?.trim() || email;
  }
  if (!label) label = fallback;

  return label.length > maxLength ? `${label.slice(0, Math.max(1, maxLength - 3))}...` : label;
}
