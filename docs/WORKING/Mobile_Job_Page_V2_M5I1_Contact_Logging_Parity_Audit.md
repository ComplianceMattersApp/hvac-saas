# Mobile Job Page V2 M5-I1 Contact Logging Parity Audit

Status: Phase M5-I1 audit only  
Date: 2026-06-28  
Scope: determine whether current mobile Contact Logging can be safely promoted into owner-only Mobile Job Page V2

## Sources Reviewed

- `docs/WORKING/Mobile_Job_Page_V2_M5I0_Parity_Checkpoint.md`
- `app/jobs/[id]/_components/MobileJobDetailCurrent.tsx`
- `app/jobs/[id]/_components/MobileJobDetailV2Preview.tsx`
- `app/jobs/[id]/page.tsx`
- `app/jobs/[id]/_components/ContactLoggingQuickActions.tsx`
- `lib/actions/job-contact-actions.ts`
- `lib/actions/__tests__/job-ops-contact-scope-hardening.test.ts`
- `lib/jobs/__tests__/job-detail-mobile-assignment-parity.test.ts`
- `lib/jobs/__tests__/job-tests-page-wiring.test.ts`

## Summary

Contact Logging is a good native-parity candidate for Mobile V2, but the safest next implementation is **not** to place it in the hero Call/Text/Navigate row. Current Contact Logging is a distinct operational log action, not the same thing as initiating a call or text.

Recommended path: **implement native Contact Logging in V2 next using a small route-local wrapper or extracted panel**, mounted from More Details / Tools or a compact Contact Log section. Reuse `ContactLoggingQuickActions` and `logCustomerContactAttemptFromForm` unchanged.

## 1. Current Mobile Behavior

| Item | Current behavior |
| --- | --- |
| Current mobile location | `MobileJobDetailCurrent.tsx`, inside the Field Operations Board area, below the location preview/cleaning support and above `AssignedTeamControls`. |
| Component | `ContactLoggingQuickActions` from `app/jobs/[id]/_components/ContactLoggingQuickActions.tsx`. |
| Current visual label | Outer current-mobile card: `Contact Logging`; helper: `Log attempts only.` The component itself also renders a small `Contact Logging` label. |
| Visibility gates | No separate current-mobile JSX gate was found around the card. It renders as part of the mobile field operations board. The server action enforces internal-user auth, same-account job scope, and operational entitlement before writes. |
| Available actions | Two quick forms: `No Answer` and `Log Text Attempt`. |
| Available contact targets / recipients | No recipient picker is present. The action records a customer contact attempt against the job. It does not bind to a specific role contact, phone number, email, or site-access recipient. |
| Current anchor/id | `ContactLoggingQuickActions` renders `id="contact-logging"` on its root element. There is no `mobile-*` anchor dedicated to this surface. |
| Current return behavior | The client component computes `return_to` from `usePathname()` plus current `useSearchParams()`. It also sends `success_banner=contact_attempt_logged`. |
| Current success behavior | The action redirects back to `return_to` with `banner=contact_attempt_logged`. The page shows `Contact attempt logged.`. The client component stores a session restore marker and scrolls `#contact-logging` back into view when that banner returns. |
| Current fallback redirect | If `return_to` is absent/unsafe, the action redirects to `/jobs/{jobId}?tab=ops&banner=contact_attempt_logged`. |
| Field-facing or admin/tooling-only | Current placement in the mobile Field Operations Board reads as field-facing/internal operational tooling. It is not desktop-only and not invoice/compliance-specific. |

## 2. Action Contract

Server action: `logCustomerContactAttemptFromForm` in `lib/actions/job-contact-actions.ts`.

### Form Fields

| Field | Required | Current values / notes |
| --- | --- | --- |
| `job_id` | Yes | Current component passes `String(job.id)`. Missing value throws `Missing job_id`. |
| `method` | Yes | Current values are `call` and `text`. Any other value throws `Invalid method`. |
| `result` | Optional with default | Current forms pass `no_answer` for call and `sent` for text. If missing, action defaults to `no_answer`. |
| `return_to` | Optional but used by current UI | Current component sends the current local path and query string. Must remain a safe local path. |
| `success_banner` | Optional | Current component sends `contact_attempt_logged`; action normalizes to alphanumeric/underscore and defaults to `contact_attempt_logged`. |

No notes/message field is used by the current quick actions. No customer/contact recipient id is submitted.

### Auth, Scope, Permission, and Truth

The action:

- creates a Supabase server client;
- requires an internal user through `requireInternalUser`;
- redirects unauthenticated users to `/login`;
- redirects unauthorized internal access to `/jobs/{jobId}?notice=not_authorized`;
- verifies same-account job mutation scope through `loadScopedInternalJobForMutation({ accountOwnerUserId, jobId, select: "id" })`;
- checks operational mutation entitlement with `resolveOperationalMutationEntitlementAccess`;
- reads existing `job_events` with `event_type = "customer_attempt"` to count attempts and determine the first attempt date;
- inserts a `job_events` row:
  - `event_type: "customer_attempt"`
  - `message: "Customer contact attempt logged"`
  - `meta.method`
  - `meta.result`
  - `meta.attempt_number`
- updates the job:
  - `action_required_by: "customer"`
  - `follow_up_date` using the current cadence rule;
- may insert a `customer_escalation_suggested` breadcrumb after about one week;
- revalidates `/jobs/{jobId}`;
- conditionally revalidates the return path;
- redirects to the return path with `banner=contact_attempt_logged`, or to `/jobs/{jobId}?tab=ops&banner=contact_attempt_logged` if no safe return path exists.

### Existing Tests

`lib/actions/__tests__/job-ops-contact-scope-hardening.test.ts` covers:

- cross-account denial for `logCustomerContactAttemptFromForm` before writes;
- same-account internal access reaching the allowed path;
- operational entitlement checks being called for the same-account path.

`lib/jobs/__tests__/job-detail-mobile-assignment-parity.test.ts` currently source-checks `ContactLoggingQuickActions` for compact/equal-height controls.

## 3. V2 Prop Readiness

`page.tsx` already passes the relevant props to the selected mobile component:

- `job`
- `tab`
- `attemptCount`
- `lastAttemptLabel`
- `ContactLoggingQuickActions`
- `logCustomerContactAttemptFromForm`
- `PhoneIcon`
- mobile/preview button class building blocks

`MobileJobDetailV2Preview.tsx` does not currently destructure or render the contact logging props, but it receives the same flat props object selected by `page.tsx`. Therefore V2 can render the existing surface without new route reads.

Contact recipient data is not required for the current quick actions because there is no recipient picker. The role-contact reads in `page.tsx` can remain untouched.

## 4. Safe Reuse Path

Classification: **Safe reuse with a small wrapper / presentation prop only.**

Directly dropping `ContactLoggingQuickActions` into V2 is mechanically possible, but a small wrapper is safer because:

- current mobile has an outer card shell and helper copy around the component;
- V2 needs a field-friendly placement that does not confuse Call/Text initiation with Log Contact;
- the existing component repeats the `Contact Logging` label internally, so a V2 wrapper should avoid duplicate headers or accept the repetition temporarily;
- a wrapper can keep the native surface behind a simple tool row/disclosure while preserving the exact forms.

No action changes, server-action imports into V2, schema changes, or route reads are needed.

## 5. Proposed V2 Placement

Recommended initial placement: **More Details / Tools as a direct row that opens/reveals a native Contact Logging panel**, or a compact standalone `Contact Log` section below Evidence & Notes if owner field testing says logging attempts is high-frequency.

Preferred first implementation:

1. Add a `Contact Logging` row inside expanded More Details / Tools.
2. The row targets a native V2 panel with `id="contact-logging"` or a route-local wrapper preserving that id.
3. Render `ContactLoggingQuickActions` with:
   - `jobId={String(job.id)}`
   - `attemptCount={attemptCount}`
   - `lastAttemptLabel={lastAttemptLabel}`
   - `action={logCustomerContactAttemptFromForm}`
   - a V2-appropriate large tap-target `buttonClassName`
4. Let `return_to` naturally preserve the current route/query. Explicit preview keeps `mobileLayout=v2`; owner-default V2 can return to the plain job URL and still render V2 through the env allowlist gate.

Do not place the log buttons in the hero Call/Text/Navigate row in the first native slice. Hero Call/Text are communication launchers; Contact Logging writes operational history and follow-up state.

## 6. Risk Review

| Risk | Assessment | Mitigation |
| --- | --- | --- |
| Duplicate contact records | Medium. Buttons intentionally create events every tap; accidental repeated taps are possible. | Preserve pending button behavior from `ContactLoggingSubmitButton`; do not add extra duplicate forms. |
| Wrong recipient | Low/Medium. Current action does not store a recipient, so no new wrong-recipient risk if reused unchanged. | Do not add recipient selection in this slice. Keep copy clear: attempt log only. |
| Wrong return path | Low if reused unchanged. `return_to` is client-derived and safe-local validated. | Native V2 should preserve current query string; Standard View fallback not needed for native panel. |
| Losing tab/anchor | Low. Current `return_to` preserves query string but no explicit anchor. Restore behavior scrolls to `#contact-logging` after banner. | Keep `id="contact-logging"` stable in the native V2 panel. |
| Permission mismatch | Low. Action is authoritative: internal auth, same-account scope, entitlement. | Avoid adding UI-only permission assumptions. If a display gate is added, match current mobile or keep action as the source of truth. |
| Server action payload mismatch | Low if `ContactLoggingQuickActions` is reused exactly. | Do not rename hidden fields. |
| New route reads | None required. | Use already-passed `attemptCount` and `lastAttemptLabel`. |
| Confusing Call/Text with Log Contact | Medium if placed in hero. | Put native logging in More Details / Tools or a separate Contact Log section, not the hero communication launcher row. |
| Client bundle weight | Low. `ContactLoggingQuickActions` is already a client component used by current mobile on the same route. | Reuse the existing component; do not create a new client logger. |

## 7. Recommendation

Recommendation: **Implement native Contact Logging in V2 next** with a small route-local wrapper or presentation prop.

Do not keep it standard-linked unless owner prefers not to expose it during field testing. The action contract is clear, the props are already available, and the existing component owns the client return/restore behavior.

Implementation guardrails for the next slice:

- Do not change `logCustomerContactAttemptFromForm`.
- Do not change `ContactLoggingQuickActions` hidden fields unless only adding a presentation option.
- Do not add recipient picking.
- Do not add route reads.
- Preserve `id="contact-logging"` for restore behavior.
- Keep Contact Logging visually distinct from Call/Text/Navigate.
- Add or update focused source tests to verify V2 renders the native contact logging component and does not import server actions directly.

## Validation

Documentation-only. No product code changes were made for this audit.
