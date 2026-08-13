# SLICE 03 — Offline Draft Persistence for ECC Test Forms

You are a senior engineer working in the EveryStep FieldWorks repo (`hvac-saas`).
Read `docs/SLICES/SLICE-01-qbo-correctness.md` §1–§2 first for repo orientation
and the standing rules — they bind this slice too. Design decisions below are
made; implement faithfully, test, and report honestly.

## The problem

ECC raters enter instrument readings (manometer pressures, CFM, watt draw,
saturation temps) on `/jobs/[id]/tests` — often in attics, crawlspaces, and new
construction with no signal. That page is a server component
(`app/jobs/[id]/tests/page.tsx`, ~5,200 lines) containing ~32 uncontrolled
server-action forms (`defaultValue` + `action={...}`), with client field
components like `components/jobs/AirflowEntryFields.tsx`,
`DuctLeakageMethodFields.tsx`, `RefrigerantChargeExceptionFields.tsx`.

Today, any page reload, app switch on mobile, or crashed tab **discards every
value typed since the last successful Save**. A failed Save (no signal) leaves
the tech with no assurance their readings survive. For a rater, re-climbing
into an attic to re-take readings is the single worst UX failure the product
can have.

## What v1 is — and is not

**v1 protects typed data.** Field values persist on-device as the tech types,
survive reloads/app switches, and can be explicitly restored.

**v1 is NOT full offline.** No offline page loads (that needs a service-worker
app shell — a later project), no background submission queue, and no queued
replay of server actions. A queued auto-replay could silently overwrite newer
office edits or double-fire lifecycle actions; for compliance-grade data, the
tech pressing Save with signal is the only submission path. Do not build any
form of automatic re-submission.

Photos are out of scope — drafts cover text/number/select/checkbox/radio
inputs only.

## Design (decided — implement as written)

### D1. One generic client wrapper, not 32 bespoke changes

New client component `components/jobs/FormDraftGuard.tsx` (plus a small module
`lib/field-drafts/form-drafts.ts` for the pure logic, unit-testable). Usage: the
server page wraps each **test data-entry form's fields** in
`<FormDraftGuard draftKey={...} serverStateToken={...}>` around the existing
children. The guard:

1. Listens to `input`/`change` events bubbling from its child form fields and
   debounce-writes (~500 ms) all named field values to `localStorage`.
2. On mount, if a draft exists for `draftKey`, shows a compact banner INSIDE the
   form: "Unsaved readings from {relative time} are saved on this device —
   [Restore] [Discard]". **Restore is explicit, never automatic** — silently
   filling fields could resurface stale readings over newer office-entered
   data without the tech noticing.
3. Clears the draft when the form's `serverStateToken` changes across mounts
   (the server accepted a save and re-rendered with new data), when the user
   clicks Discard, or on successful restore-then-save (which itself changes the
   token).

### D2. Keys and tokens

- `draftKey` = `esfw-draft:v1:{internalUserId}:{jobId}:{formScope}` where
  `formScope` identifies the specific form (e.g. `test-run:{runId}`,
  `custom-test:{runId}`). The user id comes from the server render — drafts on
  a shared device must not leak between logins.
- `serverStateToken` = the row's `updated_at` (e.g. the `ecc_test_runs` row
  backing the form), passed from the server render. If a draft's stored token
  differs from the current one, the banner must say the server data changed
  since the draft ("readings on file changed since this draft — review before
  restoring") — still restorable, but flagged.
- Storage is versioned (`v1` in the key) and every read is wrapped so a corrupt
  or schema-mismatched entry is discarded, never thrown on.

### D3. Restore mechanics

Restore writes values back into the named fields (native value setters +
dispatched `input` events so client field components like the live previews
recompute), then focuses the first restored field. Fields present in the draft
but missing from the DOM (form changed shape since) are skipped silently and
dropped from the draft.

### D4. Offline awareness (small, honest)

- A minimal connectivity indicator on the tests page (client component using
  `online`/`offline` events): when offline, a slim banner: "No connection —
  keep working; your typed readings are saved on this device. Save when signal
  returns."
- When a form's Save fails at the network layer while offline, the typed values
  are already in the draft — that is the safety net. Do not intercept or queue
  the submission.

### D5. Hygiene

- Cap: keep at most ~50 drafts; on write, evict the oldest beyond the cap and
  any draft older than 14 days.
- Drafts for a job are best-effort cleaned when its forms render with no
  pending draft differences (token match + empty diff → delete).
- `localStorage` only — values are small text; no IndexedDB, no new deps.

### D6. Where to apply

Wrap the data-entry forms on `/jobs/[id]/tests` — the per-test field forms
(duct leakage, airflow, fan watt, refrigerant charge incl. exception fields,
air filter, AHRI, local mechanical exhaust, custom test label/data) — i.e.
forms whose loss means re-taking readings. Do NOT wrap: pure status/advance
buttons, not-applicable toggles, or anything on other pages. Scope discipline
matters more than coverage here; a follow-up can extend the guard elsewhere
once it has proven itself.

## Acceptance criteria

- [ ] Type readings into a test form, reload the page → banner offers the
      draft; Restore fills every field (including ones driving client-side
      live previews, which must recompute); Save persists; draft clears.
- [ ] Draft restore is never automatic; Discard removes it.
- [ ] Office edits the run from another session → tech's banner flags the
      newer server data (token mismatch copy).
- [ ] Drafts are scoped per user id — logging in as another user on the same
      device shows no foreign drafts.
- [ ] Corrupt localStorage entries are ignored, never a runtime error; SSR is
      unaffected (guard renders children unchanged on the server).
- [ ] No submission is ever queued, replayed, or auto-fired by the guard.
- [ ] Unit tests for `lib/field-drafts/form-drafts.ts` (serialize/restore/
      evict/token-compare) and a wiring test per the repo's existing pattern;
      `npm run test`, `npm run build`, `tsc --noEmit` clean (call out the
      pre-existing failures explicitly); lint delta explained.
- [ ] Works inside the Capacitor Android/iOS shells and the PWA — localStorage
      is available in all three; no native plugin needed.

## Deliverable / report back

Branch `slice-03-offline-test-drafts`, no PR unless asked. Report in the
Slice-01 format: files changed by group, full test/build output, deviations
with reasons, and a phone-based manual QA script (airplane mode mid-entry →
reload → restore → save on reconnect), plus open questions for Slice 04
(Twilio self-serve tenant provisioning).
