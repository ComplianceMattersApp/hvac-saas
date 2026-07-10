# Code-health audit — Company Profile (`/ops/admin/company-profile`)

Paste into Claude Code or Codex. **Read-only. Do NOT change files.** Bucketed report we'll discuss before implementing. Cite paths + line ranges.

## 1. Surface map
- Files rendering the page + queries/actions. Data flow (auth → fetch → render; server vs client boundaries). Is it one giant component or composed?

## 2. Dead & unused
- Unused imports/vars/props/exports/types; unreachable branches; dead handlers/links; commented-out blocks; any "Advanced …" disclosure that renders nothing.

## 3. Duplication & sharing
- Repeated form-field / card / save-button patterns across the ~10 sections (candidates for a shared `SettingsSection` + field components).
- Formatters (phone, timestamp, status) duplicated from elsewhere (e.g. `lib/ops/phone-links.ts`).
- The four ECC/HERS blocks: quantify shared vs duplicated logic.

## 4. Makes-sense / correctness
- Oversized fetch+transform+render component; magic strings (plan/status/workflow enum values) that should be named constants.
- Type gaps (`any`, untyped account/settings rows).
- Save handlers: per-section vs global — any partial-save or stale-state bug? Optimistic vs server-confirmed?
- Logo upload: size/type validation (page says ≤5MB, PNG/JPG/SVG/WebP) — enforced server-side too?

## 5. Security & correctness (admin surface)
- Is every read/mutation scoped to the current account and gated by an admin role check server-side (not just UI)?
- The ECC/HERS invite/connect actions: authz + validation (can't invite yourself, can't leak another account's data via the account-ID field)?

## 6. Performance & a11y
- Over-fetching (loading everything even though Overview needs a summary), N+1s.
- Labels tied to inputs, required indicated non-visually (aria-required), disclosure buttons aria-expanded, touch targets, contrast, focus order.

## Output — bucketed
- **A. Safe cleanup** · **B. Refactors** (esp. a shared section/field component) · **C. Improvements** (correctness, perf, a11y, save model).
- Each: path, why, effort (S/M/L), risk. Any account-scoping/authz gap is top priority. **Do not implement — list it.**
