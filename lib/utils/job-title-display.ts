export function normalizeRetestLinkedJobTitle(value: unknown) {
  const title = String(value ?? "").trim();
  if (!title) return "";
  return title.replace(/^(?:Retest\s+[—-]\s+){2,}/i, "Retest — ");
}