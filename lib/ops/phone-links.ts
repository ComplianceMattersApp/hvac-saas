export function digitsOnly(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

export function smsHref(phone?: string | null) {
  const digits = digitsOnly(phone);
  return digits ? `sms:${digits}` : "";
}

export function telHref(phone?: string | null) {
  const digits = digitsOnly(phone);
  return digits ? `tel:${digits}` : "";
}
