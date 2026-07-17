# Google Address Autocomplete V1 — Audit and Implementation Plan

Status: Phase A approved; Slice B authorized; Slices C-G approval-gated

Branch: `feature/google-address-autocomplete-v1`

Audit date: 2026-07-16

Scope: repository and documentation audit only; no product, schema, environment, provider, or production changes

## Owner approval record — 2026-07-16

- Phase A and its **no schema change required for V1** verdict are approved.
- `PlaceAutocompleteElement` is approved as an optional adjacent assistant; it does not replace canonical editable inputs or submit forms.
- The browser key convention is `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY`. Existing `GOOGLE_MAPS_API_KEY` remains unchanged and must not be exposed or repurposed.
- Separate customer, contractor, invoice, paperwork-recipient, and business billing/mailing addresses are excluded from V1. V1 is limited to physical/service-location entry surfaces.
- Preview deployments default to manual address entry when no separately restricted preview key is configured.
- Slice B shared non-wired foundation is authorized. Slices C-G, production form wiring, environment configuration, and Google Cloud changes remain approval-gated.

## Executive verdict

V1 should use Google Maps JavaScript API's current `PlaceAutocompleteElement` as an optional input assistant. It should be rendered only beside address forms that create or edit a physical service or billing address. On selection, a small shared adapter should request only `addressComponents`, parse the result, and populate the application's existing editable inputs. Existing input names, form submissions, server actions, validation, canonical tables, reuse-first behavior, and manual entry remain authoritative.

The first production-form pilot should be the internal branch of `/jobs/new`, after a non-wired shared foundation and parser tests. The contractor branch shares the component but must be wired later because its submission is proposed intake truth and its durable-first attachment path has separate risk. Customer Add Location and Edit Location are the next appropriate surfaces. Estimates currently select canonical customers and locations and do not create an address; they should not be wired unless a later verified estimate flow adds inline location creation.

**Schema verdict: No schema change required for V1.** Canonical address fields are sufficient. Place IDs, coordinates, provider payloads, and validation results are not required by the stated input-assistance goal and should not be stored.

## Audit basis and locked boundaries

Reviewed current authority and planning material, including:

- `docs/PROJECT_TRUTH.md` (the retired Active Spine points here)
- `docs/CURRENT_ROADMAP.md`
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`
- `docs/ACTIVE/Compliance_Matters_Prelaunch_Confirmation_Checklist.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/source-of-truth-strategy.md`
- `docs/ACTIVE/Estimate_Multi_Option_Proposal_Model_Spec.md`
- `docs/ACTIVE/Owner_Scoped_Permit_Workflow_V1_Model_Spec.md`
- `ENVIRONMENT_RULES.md`
- current job intake, customer profile, location edit, contractor finalization, estimate, invoice snapshot, map preview, schema, migration, and related regression-test code

The implementation must preserve these verified boundaries:

- `customers` owns canonical customer/contact identity; `locations` owns canonical service addresses.
- Internal `/jobs/new` resolves customer first and location second, preferring existing records.
- A job retains convenience/snapshot values such as `job_address` and `city`, but its canonical service-location relationship is `location_id`.
- Contractor intake without an explicit canonical customer/location pair writes proposed address data to `contractor_intake_submissions`; internal finalization alone resolves it to canonical records.
- Selecting a prediction must not write any record. Only the existing submit action may mutate data.
- Draft/issued invoice billing fields are snapshots. Later canonical location edits must not silently rewrite invoice truth.
- Address Line 2 remains independent and editable. Autocomplete may suggest a subpremise, but must never erase a user's line 2.
- Callback and return-visit actions inherit an existing canonical `customer_id` and `location_id`; they do not ask for or create a new address and are out of scope.

## Current Google infrastructure map

### Inventory

| Capability | Current implementation | Loading/client boundary | V1 implication |
| --- | --- | --- | --- |
| Job Street View preview | `components/jobs/JobLocationPreview.tsx` builds Street View Static API image and metadata URLs | Rendered from a server component; metadata fetch is server-side, but the key embedded in an image URL is observable by a browser | Do not reuse this environment variable blindly as a browser Places key; audit/restrict the existing static key separately |
| Job static-map fallback | Same component builds a Maps Static API image URL | Server-rendered URL in browser markup | Existing key needs website and API restrictions appropriate to Static Maps and Street View Static |
| Maps search/directions | Plain `google.com/maps/search` and `/dir` links in job detail, mobile job detail, Today, field cards, customer profile, and location detail | No Maps JS loader or API SDK | Unaffected; these links need no Places library |
| Maps JavaScript API | Not present | No script tag, loader package, or `google.maps.importLibrary` path found | Add one first-party, singleton, on-demand loader only for enabled address assistants |
| Places/autocomplete/geocoding | Not present | No dependency or provider call found | Clean V1 foundation; no legacy path to retain |
| Google dependency | None in `package.json` | N/A | Prefer a tiny first-party loader wrapper; do not add a third-party React autocomplete package |

Repository environment files define `GOOGLE_MAPS_API_KEY`; code reads it only in `JobLocationPreview.tsx`. No `NEXT_PUBLIC_GOOGLE_*` or browser Maps variable exists. Values were not recorded or printed. Local files cannot prove Cloud billing, enabled APIs, referrer restrictions, API restrictions, quota caps, alerts, or the exact production/preview origin allowlist; those require an owner-authorized Cloud Console review.

### Proposed loader posture

- Introduce a purpose-specific public browser variable such as `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY`; do not repurpose or expose a server secret.
- Keep loading behind a client component and only call the loader when an enabled assistant mounts.
- Use a module-level singleton promise so multiple assistants cannot append duplicate scripts.
- Use Google's Dynamic Library Import bootstrap and request only the `places` library. No global layout script and no parent-page data read.
- Configure `v=weekly` initially only if accepted by the owner; otherwise use Google's stable channel. Always set `language=en`, `region=US`, and country restriction `includedRegionCodes = ["us"]` at the widget.
- Missing key, rejected key, script failure, unsupported browser/custom element, or widget error must leave the ordinary fields visible and usable without a submission blocker.

Official technical basis:

- [Place Autocomplete Widget (New)](https://developers.google.com/maps/documentation/javascript/place-autocomplete-new)
- [Place Autocomplete address-form example](https://developers.google.com/maps/documentation/javascript/examples/places-autocomplete-addressform)
- [Dynamic Maps JavaScript API loading](https://developers.google.com/maps/documentation/javascript/load-maps-js-api)
- [Google Maps Platform API-key security guidance](https://developers.google.com/maps/api-security-best-practices)
- [Google Maps Platform cost controls](https://developers.google.com/maps/billing-and-pricing/manage-costs)

## Address surface inventory

| Surface | Form/component | Existing action | Inputs and validation | Target and reuse behavior | Verdict |
| --- | --- | --- | --- | --- | --- |
| Internal `/jobs/new` | `app/jobs/new/NewJobForm.tsx` (controlled client wizard) | `createJobFromForm` in `lib/actions/job-actions.ts` | Existing/new customer and location modes; new address uses `address_line1`, `address_line2`, `city`, `state`, `zip`; server requires line 1/city/state/ZIP and normalizes duplicate matching | Creates/reuses `customers` and `locations`, then creates `jobs`; normalized address comparison prevents duplicate location creation | **Pilot.** Insert assistant only in new-location modes; keep controlled inputs and hidden canonical IDs unchanged |
| Contractor `/jobs/new` | Same form, contractor mode | Same action plus proposal attachment token/finalization path | Same address names; server explicitly requires line 1/city/state/ZIP before proposal insert | Writes `proposed_*` fields to `contractor_intake_submissions`; no canonical customer/location/job creation until internal finalization | **Later Slice E.** Share UI foundation but regression-test durable-first proposal and attachment behavior |
| Standalone New Customer `/customers/new` | Server-native uncontrolled form in `app/customers/new/page.tsx` | `createCustomerOnlyFromForm` | Contact plus optional location; action creates a location only when line 1, city, and ZIP are present; state is currently not part of `hasAddress`, though the UI collects it | Creates `customers`; optionally creates `locations` | **Slice D**, but after controlled pilot. Wrap fields in a small client island without changing action or names; retain optional/manual semantics |
| Customer profile Add Location | Uncontrolled disclosure form in `app/customers/[id]/page.tsx` | `addCustomerServiceLocationFromForm` | line 1/city/state/ZIP required; line 2 optional; default state CA | Inserts `locations`; action performs normalized same-customer address/city/state/ZIP duplicate detection | **Slice D.** Strong candidate for shared client island |
| Customer profile Edit Service Address | Uncontrolled disclosure form in same page | `updateLocationServiceAddressFromForm` | line 1/city/state/ZIP required; line 2 optional | Updates explicit canonical location ID; action syncs matching billing address only under its existing comparison rule and revalidates related views | **Slice D.** Assistant must never auto-submit or change the location ID |
| Standalone Location detail `/locations/[id]` | Uncontrolled form in `app/locations/[id]/page.tsx` | Same location update action | Same location fields and explicit location ID | Same canonical update and job snapshot/revalidation boundary | **Slice D.** Prefer extracting/reusing the same edit field group to prevent two wiring implementations |
| Contractor intake finalization | `GuidedFinalizationWizard.tsx` | `finalizeContractorIntakeSubmissionFromForm` | Existing customer/location, existing customer/new location, or new customer/new location; uses `new_address_line1`, `new_city`, `new_state`, `new_zip` | Finalizer creates canonical customer/location only after internal decision | **Slice E.** Helpful only on the two new-location branches; do not touch existing record selection |
| Estimate `/estimates/new` | `NewEstimateForm.tsx` controlled client form | Estimate creation action | Selects an existing customer and existing canonical location; no address-entry controls | Stores canonical references/snapshots according to estimate model | **No V1 wiring now.** There is nothing to autocomplete; retain selection/filter behavior |
| Customer billing edit | `BillingAddressFields.tsx` within `/customers/[id]/edit` | `upsertCustomerProfileFromForm` | Optional separate billing line 1/2, city, state, ZIP or “same as service” | Updates customer billing identity, not canonical service location | **Optional Slice F** after service-address rollout; autocomplete is useful only when separate billing address is enabled |
| Contractor create/edit billing address | `ContractorForm.tsx` | contractor create/update actions | Billing line 1/2, city, state, ZIP, country | Contractor billing identity | **Optional Slice F**; lower priority and not service-location truth |
| Account/business setup | Company profile and account setup code contains no physical-address entry contract | Existing business-profile actions | No canonical address controls found | N/A | **Out of scope** until an address form exists |
| Callback/return/follow-up | Linked visit actions in `lib/actions/job-actions.ts` and job UI | Callback/return actions | No new address fields | Inherits existing customer/location/job snapshot | **Out of scope** |
| Internal permit request | Existing canonical customer/location resolution in permit workflow | internal permit actions | Selects or resolves canonical location; address is not a free-standing general-purpose form in this lane | Preserves owner-scoped permit boundaries | **No initial wiring**; revisit only if an actual new-location address form is verified during Slice F |

There is no separate standalone “create location” route beyond customer-profile creation; `/locations/[id]` is the standalone edit/detail route. Read-only address displays, map previews, navigation links, invoice print views, and proposal/invoice snapshots must not receive autocomplete.

## Canonical address data flow

1. Internal intake chooses or creates a customer.
2. It chooses an existing `locations.id` or posts editable address fields for a new location.
3. `createJobFromForm` validates owner scope and the customer/location pairing, normalizes address parts for duplicate-location matching, inserts a new location only when needed, and creates the job with canonical IDs plus job convenience snapshots.
4. Contractor intake posts the same human address fields into `contractor_intake_submissions.proposed_address_line1`, `proposed_city`, `proposed_state`, and `proposed_zip`. This is proposal truth only.
5. Internal contractor finalization explicitly selects existing/existing, existing/new, or new/new and then creates/reuses canonical entities before job creation.
6. Estimates select existing customer/location records. Internal invoice creation freezes billing name/contact/address snapshots; subsequent provider assistance or canonical edits must not rewrite issued history.
7. Customer/location displays and job map/navigation surfaces read canonical location data with job snapshot fallback.

### Field formats and normalization

- Canonical location fields: `address_line1`, `address_line2`, `city`, `state`, `zip`, and legacy-compatible `postal_code` (writes commonly mirror ZIP to `postal_code`).
- State is stored as text; current UI convention is a two-letter value, commonly defaulted to `CA`. The parser should prefer `administrative_area_level_1.shortText` and tests should assert uppercase two-letter output when Google supplies it.
- ZIP is stored as text. The parser should join `postal_code` and `postal_code_suffix` as `12345-6789` when both exist and preserve a five-digit ZIP otherwise.
- Address Line 1 is street number plus route in locale-appropriate component order. For the US pilot, join non-empty street number and route with one space.
- Address Line 2 is optional. Preserve the existing value unless the user explicitly accepts a parsed subpremise choice; safest V1 behavior is to leave it untouched and let the user complete it manually.
- City should prefer `locality`, then appropriate US fallbacks such as `postal_town`, `sublocality_level_1`, or `administrative_area_level_2`. The fallback order must be unit-tested and documented in the parser.
- Country is not part of canonical location storage. Restrict predictions to the US and do not add/store a country field for service locations.
- No latitude, longitude, Google Place ID, provider-reference, or uniqueness column exists on the canonical location model. Existing uniqueness is application-level normalized matching plus trigram search indexes, not a provider identity.

## Widget versus Data API decision

### Recommendation: `PlaceAutocompleteElement`

The widget is the lowest-risk V1 choice because Google owns its prediction list, keyboard behavior, screen-reader interaction, mobile layout, localization, attribution, stale-request behavior, and autocomplete session handling. It supports US region restrictions and returns the new `Place` object; after `gmp-placeselect`, the app can call `place.fetchFields({ fields: ["addressComponents"] })` and populate only existing fields.

The widget must be treated as a separate assistant rather than replacing canonical HTML inputs. This avoids relying on custom-element form submission, prevents Shadow DOM styling limitations from forcing a redesign, and keeps the current accessible labels, browser autocomplete attributes, manual editing, validation, and React/server-action payload intact. A short helper text should say that users may search or enter manually. If the widget fails, it disappears or shows a non-blocking unavailable message while ordinary inputs remain.

### Why not the Data API for V1

The Data API provides visual control but would make EveryStep responsible for a combobox/listbox implementation, focus return, active-descendant behavior, screen-reader announcements, mobile overlay/viewport behavior, debounce, cancellation/stale response handling, attribution, empty/error states, and `AutocompleteSessionToken` rotation. None of those responsibilities advances canonical address truth. Visual matching alone is not enough justification.

### Re-evaluation gate

Use the Data API only if an actual pilot proves that the widget cannot meet one of these acceptance conditions: it cannot fit without horizontal overflow, it cannot expose an adequate label/description, it cannot synchronize reliably with the controlled `/jobs/new` state, or its Shadow DOM prevents minimum brand/contrast requirements. Record concrete browser evidence before switching approaches.

## Security and configuration findings

- A browser Places key does not currently exist in repository convention. Add a distinct public variable only after owner Cloud configuration approval.
- The browser key must use Website restrictions for the exact production, preview, and local HTTP origins and API restrictions for **Maps JavaScript API** and **Places API (New)** only.
- The existing static preview key is embedded into browser-visible image URLs even though it is sourced server-side. Per Google's guidance, verify Website restrictions and restrict it to Maps Static API and Street View Static API. Prefer a separate key from Places to isolate quota and rotation impact.
- Do not expose service-role, Supabase, server provider, or unrestricted credentials. Never log key values or include them in screenshots/test fixtures.
- Cloud state is **unverified** by this audit: billing enabled, Places API (New) enabled, key restrictions, allowed origins, quotas, budget, and alerts require owner/Cloud Console confirmation.
- Configure quota limits and usage alerts for Maps JavaScript API/Places API (New), and create a billing budget with alert thresholds. A budget alert does not cap spend; quotas provide the hard usage control and must be set with peak traffic in mind.
- No Cloud Console, API enablement, billing, quota, key, Vercel, `.env`, Supabase, or production change is authorized in Phase A.

## Duplicate-location, performance, and accessibility implications

### Duplicate locations

Google selection does not become identity. Existing normalized same-customer matching remains authoritative. Formatting differences such as `Street` versus `St`, ZIP+4 versus ZIP5, or locality fallbacks can still evade the current comparison, so selection must not bypass reuse-first UI. Do not use Place ID as an automatic dedupe key. In V1, preserve current matching and add parser/wiring tests; consider broader canonical normalization only as a separately audited lane.

### Performance

- No global script or root-layout integration.
- No server-side Google call on form render or submit.
- No extra Supabase/parent-page read.
- One singleton loader and dynamic `places` import only while an enabled address assistant is mounted.
- Existing static preview and ordinary Maps links remain independent.
- Avoid map rendering in the address assistant; it is unnecessary payload and cost.

### Accessibility

- Keep visible labels on every canonical input and preserve native required/error behavior.
- Give the assistant an explicit label/instruction and status region for “loading,” “unavailable,” and “address filled; review details.”
- Test keyboard entry, arrow navigation, selection, Escape, Tab order, focus after selection, zoom, and mobile screen readers.
- Do not clear line 2 or move focus unexpectedly after a selection.
- The widget's documented accessibility is a starting point, not a substitute for browser smoke in the actual form.

## Proposed file-by-file slices

### Slice B — shared non-wired foundation

Proposed files (exact names may be adjusted before implementation if repository conventions require it):

- `lib/google-maps/load-places-library.ts` — singleton, on-demand first-party loader; typed missing-key/load-failure result; no global render integration.
- `lib/addresses/google-place-address.ts` — provider-neutral normalized selection type and pure address-component parser.
- `components/addresses/GoogleAddressAutocomplete.tsx` — client assistant using `PlaceAutocompleteElement`, US restriction, minimal field request, non-blocking fallback.
- `lib/addresses/__tests__/google-place-address.test.ts` — component ordering, city fallback, state short text, ZIP/ZIP+4, absent fields, subpremise behavior, and no-provider-metadata assertions.
- `.env.example` — document the public variable name only, with no value, after owner accepts the key split.

No form wiring, action change, database write, or migration in this slice.

### Slice C — internal `/jobs/new` pilot

- `app/jobs/new/NewJobForm.tsx` — mount assistant only for internal new-customer/new-location and existing-customer/new-location states; update the existing controlled state setters on selection.
- `lib/jobs/__tests__/new-job-address-autocomplete-wiring.test.ts` — assert internal-only pilot placement, existing input names, manual fields, line 2, and unchanged action.
- Add component interaction tests if the current Vitest/jsdom configuration supports custom-element mocking without brittle global behavior.

No `createJobFromForm` change is expected. If a narrow adapter becomes necessary, it requires explicit review and targeted server-action regression coverage.

### Slice D — customer/location create and edit

- `components/addresses/ServiceAddressFields.tsx` (or a narrower client island) — shared field group capable of controlled/uncontrolled initial values without owning submission.
- `app/customers/new/page.tsx` — use assistant for optional initial service location.
- `app/customers/[id]/page.tsx` — Add Location and Edit Service Address.
- `app/locations/[id]/page.tsx` — reuse the same edit field group.
- Relevant tests under `lib/actions/__tests__/customer-service-locations.test.ts`, `location-service-address-actions.test.ts`, and focused UI wiring tests.

Keep `addCustomerServiceLocationFromForm` and `updateLocationServiceAddressFromForm` authoritative. Do not change invoice-history warnings or the current conditional billing-address synchronization rule.

### Slice E — contractor intake and finalization

- `app/jobs/new/NewJobForm.tsx` — enable the already-tested assistant for contractor proposed address entry.
- `app/ops/admin/contractor-intake-submissions/[id]/_components/GuidedFinalizationWizard.tsx` — enable only new-location branches and map to the existing `new_*` names.
- Targeted proposal/finalization tests in `lib/actions/__tests__/contractor-intake-*.test.ts` plus new wiring tests.

Re-run durable proposal/attachment regression coverage. Autocomplete load or selection must have no relationship to proposal persistence or attachment finalization.

### Slice F — remaining verified physical/service-location surfaces

- Wire only remaining physical/service-location entry surfaces verified and separately approved after Slices C-E.
- Separate customer, contractor, invoice, paperwork-recipient, and business billing/mailing addresses remain out of scope for V1.
- Estimate code remains unchanged unless a separately approved inline new-location flow exists by then.

### Slice G — hardening and closeout

- Expand unit/wiring tests, environment documentation, production checklist, and this working document's slice ledger.
- Confirm no duplicate loader/script, no hydration warning, no console error, and no unintended provider metadata persistence.
- Produce merge-readiness report only; do not merge.

## Test and smoke plan

### Automated

- Parser: street number/route ordering; route without number; missing route; locality and fallback city; short/long state; ZIP5; ZIP+4; absent suffix; subpremise; unknown components; empty response.
- Loader: missing key, concurrent calls share one promise, successful Places load, rejected script/library, retry policy, and no duplicate insertion.
- Component: selection requests only `addressComponents`; canonical inputs remain editable; line 2 is preserved; no submit/write on selection; failure leaves manual fields.
- Internal intake: existing customer/location selection unchanged; both new-location paths populated; names remain `address_line1`, `address_line2`, `city`, `state`, `zip`; server requirements unchanged; duplicate/reuse behavior intact.
- Customer/location: Add and Edit post existing names/IDs; normalized duplicate check and conditional billing sync unchanged.
- Contractor: proposal `proposed_*` persistence, required state, finalizer modes, text-first proposal save, attachment durability, and no pre-finalization canonical creation.
- Estimate: regression confirms existing selection-only flow remains unchanged where not wired.
- Repository commands: targeted Vitest suites, `npx.cmd tsc --noEmit`, and `git diff --check` after every slice.

### Browser smoke (must be reported only when actually executed)

- Desktop and narrow-mobile internal `/jobs/new`.
- Existing customer + saved location; existing customer + new location; new customer + new location.
- Search keyboard interaction, Escape/Tab/focus, mouse/touch selection, editing every populated field, line 2 preservation, and manual-only completion.
- Missing key, invalid/rejected key, offline/script failure, and an address Google cannot find.
- Customer Add Location, Customer Edit Location, standalone Location edit.
- Contractor mobile proposal, attachment success/failure paths, and internal finalization new-location modes.
- No horizontal overflow, duplicate script warning, hydration warning, or console error.
- Existing Maps preview/search/directions links remain functional.

## Production configuration checklist

- [ ] Owner confirms the Google Cloud project and billing account intended for EveryStep production.
- [ ] Places API (New) and Maps JavaScript API are enabled intentionally; no unrelated API is enabled.
- [ ] A separate browser key is created with Website restrictions for exact production, preview policy, and local development origins.
- [ ] Browser key API restrictions allow only Maps JavaScript API and Places API (New).
- [ ] Existing static preview key is reviewed and restricted to intended origins/APIs; key separation is preferred.
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY` (or approved name) is configured in local/preview/production without logging or screenshots.
- [ ] Places and Maps JS quota caps and usage alerts are configured at safe peak-aware values.
- [ ] Billing budget and threshold alerts are configured and notification recipients verified.
- [ ] Missing-key production behavior is manually confirmed before enabling the key.
- [ ] Google attribution, current Maps Platform terms, privacy disclosure, and data-use posture are reviewed.
- [ ] Preview deployments use an intentionally bounded origin policy; wildcard exposure is avoided where operationally possible.
- [ ] Rollout and rollback owner are named.

## Risks and rollback posture

| Risk | Mitigation / rollback |
| --- | --- |
| Widget Shadow DOM cannot match required form presentation | Use it as a small adjacent assistant; test pilot. If acceptance fails, disable assistant and retain fields while evaluating Data API at a new approval gate |
| Script/key/API failure blocks intake | Canonical fields render first and never depend on loader state; remove/disable assistant without server changes |
| Duplicate locations from provider formatting differences | Preserve reuse-first selection and existing normalized matching; never treat Place ID as identity |
| Controlled-state desynchronization in `/jobs/new` | One selection adapter updates existing state setters; interaction and actual submit-payload tests |
| Cost or key abuse | Separate restricted key, on-demand load, country/type constraints, minimal fields, quotas, and alerts |
| Existing static key is more exposed than assumed | Cloud audit and key restriction/rotation plan; do not combine remediation silently with Places implementation |
| Contractor boundary regression | Wire only after internal/customer stability and run durable-first/finalization regression suites |
| Google policy/API evolution | Encapsulate provider loader/parser/component; canonical forms and manual entry make rollback deletion-only |

Rollback is feature-local: stop rendering `GoogleAddressAutocomplete` or remove the public browser key. Existing inputs, server actions, records, and schema continue unchanged. No data rollback or migration reversal should be necessary.

## Resolved owner decisions and next approval gate

The owner approved `PlaceAutocompleteElement`, the adjacent-assistant pattern, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY`, the Slice B-G planning sequence, manual-only previews when no preview key is configured, and exclusion of separate billing/mailing addresses from V1. Slice B alone is authorized. Slice C `/jobs/new` wiring requires a new explicit approval after Slice B review.

## Explicit non-actions in Phase A

- No autocomplete component, loader, dependency, or form wiring was added.
- No schema, migration, RLS, index, Supabase data, or canonical record changed.
- No environment file or secret changed; no key value was copied into this document.
- No Google API, billing setting, key restriction, quota, or alert was changed.
- No customer, location, job, contractor proposal, estimate, invoice, map preview, or provider behavior changed.
- No test/browser smoke is claimed for an implementation that does not yet exist.
- No commit, push, merge, rebase, force-push, or history rewrite was performed during the audit artifact creation.

## Slice continuity ledger

| Slice | Status | Files changed | Validation/smoke | Known issues | Next action |
| --- | --- | --- | --- | --- | --- |
| Phase A audit | Approved | This document only | Static repository searches; official Google documentation review; whitespace validation passed | Cloud configuration cannot be verified locally; unrelated untracked `.claude/` directory predates branch and remains untouched | Slice B authorized |
| Slice B | Authorized, not started | None | None | Production forms and Slices C-G remain gated | Implement shared non-wired foundation only |
