export function normalizePhone10(raw: string | null | undefined) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeFullName(first: string, last: string) {
  return `${first ?? ""} ${last ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim();
}

export type DuplicateCustomerMatch = {
  id: string;
  phone?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

function normalizeNameLoose(raw: string) {
  return String(raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function isSameCustomerByNamePhone(opts: {
  inputFullName: string;
  inputPhone10: string;
  candidate: DuplicateCustomerMatch;
}) {
  const candPhone10 = normalizePhone10(opts.candidate.phone);
  if (!candPhone10 || candPhone10 !== opts.inputPhone10) return false;

  const candName = normalizeNameLoose(
    opts.candidate.full_name ??
      `${opts.candidate.first_name ?? ""} ${opts.candidate.last_name ?? ""}`.trim()
  );

  return candName === opts.inputFullName;
}