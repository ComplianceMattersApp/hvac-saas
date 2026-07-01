# Handoff: Job Detail Desktop Redesign (`/jobs/[id]`)

## Overview
This is a redesign of the **desktop `/jobs/[id]` page** in EveryStep JobWorks — the single most important page in the app. It is the "operating room" for one job: where a user understands *what the job is, who owns it, what's blocking it, what work should happen, what was captured, what should be billed, and what history explains it.*

The redesign replaces the current accreted layout (nested same-styled cards, weak hierarchy, long undifferentiated sprawl) with **one continuous "sheet"** of hairline-divided sections plus a **pinned command rail**. It groups information by *who owns the next step* (field → office/dispatch → billing → compliance) and surfaces a live **"blocks closeout"** routing summary.

The page serves a mixed audience: field techs/raters (run the visit), office/dispatch (responsibility, scheduling, exceptions, returns/callbacks), billing/AR/owner (invoicing & closeout), and ECC/HERS/compliance users (permit, tests, certs, retest).

> **Goal:** ship this as a **parallel V2 route** (e.g. `/jobs/[id]/v2` or behind a feature flag) — do **not** modify the live page. Once the V2 is verified across real job states and roles, cut over and keep the old page one release for rollback. **V1 is slated to become obsolete** — V2 is the intended permanent replacement, so build every path (including action redirects) as if V2 is the destination, not a preview.

## Action return paths (mutations must stay on V2)
**Symptom to avoid:** performing an action on V2 (close/finish job, save note, assign, invoice, log contact) bounces the user back to the old `/jobs/[id]` page. This happens because the shared server actions `redirect('/jobs/${id}')` on success — the read surface is V2 but the write path points home. In a real beta this kicks testers out of the exact thing they're testing.

**Requirement:** every mutation reachable from the V2 page must return the user to the **V2** route.

Implement whichever fits the codebase; prefer the one that survives the V1→obsolete cutover:

1. **Preferred — thread a return path through the shared action.** Add a `returnTo` (hidden form field) or `?from=v2` param that each action reads, and redirect to it on success (default `/jobs/${id}` when absent). One handler serves both routes; V2 users land on `/jobs/${id}/v2`, everyone else on the old page. This is the safe parallel-route pattern and needs no logic change at cutover.
2. **If actions are not shared** (V2 has its own action module) — hardcode success redirects to `/jobs/${id}/v2`.
3. **Post-cutover simplification** — once V1 is retired, the canonical `/jobs/[id]` route *is* this design; collapse `/v2` back to `/jobs/[id]`, point all redirects there, and add a redirect/alias from any lingering `/v2` links. Until then, keep V2 self-contained.

**Coverage checklist — audit every mutation for its success redirect:** finish/closeout, mark on-the-way / undo, schedule, save note (internal & shared), contact-logging outcomes, team assign/remove/set-primary, create/issue/void invoice, mark externally billed / no-charge, record payment, create return / callback visit, EveryStep part-ordered/arrived & approval-received, permit/cert/test actions. Each must resolve back to the V2 route (or the threaded `returnTo`). Also check client-side `router.push`/`<Link>` targets and any `revalidatePath('/jobs/[id]')` calls — add the `/v2` path to revalidation so the V2 view refreshes after a mutation.

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing the intended look and behavior. They are **not production code to copy directly**.

- `Job Detail Desktop.dc.html` is a "Design Component" prototype. It renders in a browser via the included `support.js` runtime. **Do not port `support.js` or the `<x-dc>` / `sc-for` / `sc-if` / `renderVals()` machinery** — that is prototype scaffolding. Read it only to extract layout, styling, copy, and the state-derived display logic.
- The task is to **recreate this design in EveryStep JobWorks' existing environment** (its current framework, component library, and styling conventions), using established patterns — not to ship the HTML.

### How to read the prototype
- **Template** (the markup) = the visual structure and inline styles. All styling is inline `style="…"`; lift the values directly.
- **Logic class** (`class Component extends DCLogic { renderVals() {…} }`) = the **state-derived display logic** — this is the important part. `renderVals()` returns the values the template renders. The `inProg` branch (driven by the `jobState` prop) is the single source of truth for how the page changes between lifecycle states. **Port this branching faithfully** — it encodes the gating rules below.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions are all specified. Recreate the UI pixel-faithfully using the codebase's existing libraries and patterns. Where the codebase already has a primitive (button, pill/badge, tabs), use it and match these visual values.

## The single most important rule
**Every section's visible / active / locked state must be DERIVED FROM JOB STATUS — never always-on.** The current page's biggest flaw is showing steps that don't apply yet. The prototype demonstrates this with a `jobState` prop that flips the whole page between two lifecycle states:

- **`scheduling`** (fresh, not scheduled): finish outcomes are **LOCKED** (shown as a preview behind a "unlock at Step 3" notice), Work Items show an empty state, the EveryStep part/approval tracker shows "No active hold," status pill = `NEEDS SCHEDULE`, 3 closeout blockers.
- **`in_progress`** (scheduled, tech on site): finish outcomes are **live and interactive** (selecting one shows a routing preview), Work Items are populated with a ready-to-invoice total, status pill = `IN PROGRESS · ON SITE`, 2 closeout blockers.

In production, replace the `jobState` prop with the real job status and derive each section the same way. Map the prototype's two states onto your real statuses, and extend the same pattern to the others (waiting-on-part, approval-needed, completed-pending-closeout, ECC failed/retest, cancelled/archived).

## Layout

**Page frame:** centered, `max-width: 1300px`, `padding: 0 28px`. Two-column CSS grid: `grid-template-columns: minmax(0,1fr) 290px; gap: 32px; align-items: start`.

- **Left (main):** one white "sheet" — `background:#fff; border:1px solid oklch(0.91 0.006 250); border-radius:16px; padding:0 40px`. All content sections live inside it, separated by **top hairline rules** (`border-top:1px solid oklch(0.93 0.005 250)`) and `padding:30px 0`. No nested cards — sections flow as one document.
- **Right (command rail):** `position:sticky; top:0; align-self:start; padding:24px 0; max-height:100vh; overflow-y:auto`. Holds job id, status pills, primary actions, the section jump-nav (scroll-spy), and the blocker list.

**Section order down the sheet:** Alert strip → Header band → Job Brief → People & Place → Job Memory → Field & Finish → Work & Billing → Follow-Up & Service Chain → ECC & Compliance → Records.

**Scroll-spy:** an `IntersectionObserver` (`rootMargin: '-12% 0px -78% 0px'`) watches each `[data-jobsection]` and highlights the matching rail nav item. Rail nav links are in-page anchors (`#brief`, `#people`, …); sections use `scroll-margin-top:20px`.

## Sections / Components

Exact copy is in the prototype; below are structure, sizing, and the state logic per section.

### Alert / feedback strip
Dismissible band at the top of the sheet. `margin-top:20px; padding:11px 16px; border-radius:11px; background:oklch(0.97 0.03 150); border:1px solid oklch(0.89 0.05 150)`. Green dot + message + "Dismiss". Message is contextual (e.g. "Note saved · …", "Arrived on site · …"). This is route-level action feedback — render above the workbench so the user sees results before continuing.

### Header band
Breadcrumb (`Ops / Jobs / #1118`, mono, 11px) + H1 job title (`28px/700`, `letter-spacing:-0.015em`). No status pill here — status lives in the rail.

### Job Brief
Label "JOB BRIEF" (mono, 11px, `letter-spacing:0.14em`, uppercase, color `oklch(0.55 0.015 262)`) — this is the **standard section-label style, reused on every section**. Body is a 2-column definition grid (`gap:24px 48px`) of distinct fields: **Visit Reason, Customer Concern, Service Details, Work Summary**. Keep these conceptually distinct (do not merge into one blob). Field label = mono 10px uppercase; value = `14.5px/1.55`, color `oklch(0.33 0.02 262)`. *Work Summary* text changes by state.

### People & Place
2-column grid `1fr 320px`.
- **Left:** customer name (`19px/700`), phone·email (mono 12.5px). Call / Text / Email buttons (`height:36px`, radius 9, 1px border `oklch(0.9 0.006 250)`, bg `oklch(0.98 0.003 250)`).
  - **Contact logging** — a single full-width row under the buttons, separated by a top hairline. Left: "CONTACT LOGGING" label + "8 attempts · last …". Right: three outcome buttons **No Answer · Sent Text · Reached** (`height:32px`, radius 8). These are three *distinct* contact outcomes (no redundant "log call").
  - **Contractor / Billing** — hairline-separated block (label + name).
  - **Assigned team** — label row with a **Manage** action (blue text button). Member chips: pill-shaped (`border-radius:30px`), 26px round avatar with initials, name, optional `PRIMARY` tag (green, mono 9px). A dashed **+ Add** chip ends the row. Manage / Add / set-primary / remove are the assignment controls.
- **Right:** map preview (172px tall, placeholder diagonal hatch — replace with real map tile), dark address bar overlaid at bottom. Below: text links Navigate · Open in Maps · Change location. Note the distinction (from product spec) between *correcting a saved address* and *changing which location the job belongs to* — the latter can affect billing/history.

### Job Memory (notes hub)
Promoted near the top (NOT buried in Records). Label row + "View full timeline →". Composer row: faux input ("Add a note…", `height:42px`), an **Internal / Shared** audience segmented toggle (internal selected by default), and a dark **Save** button (`bg:oklch(0.27 0.02 262)`). Below: notes feed, each row = audience tag (CONTRACTOR = amber `bg oklch(0.96 0.05 75)/fg oklch(0.5 0.12 65)`; INTERNAL = blue `bg oklch(0.96 0.025 255)/fg oklch(0.5 0.13 255)`) + body (`13.5px/1.55`) + mono meta. Keep internal vs shared separated by audience.

### Field & Finish  ← critical gating
Section label + `EVERYSTEP` badge. Intro line (changes by state).
- **Status track:** 3 equal cards (grid `repeat(3,1fr)`) — *On the Way → On Site & Working → Finish & Report*. Each card has a step tag, title, detail. Card state ∈ `done | now | todo`:
  - `now`: blue border `oklch(0.85 0.04 255)` + bg `oklch(0.97 0.02 255)`, tag "STEP n · NOW" (blue).
  - `done`: green border `oklch(0.88 0.05 150)` + bg `oklch(0.98 0.025 150)`, tag "STEP n · DONE" (green).
  - `todo`: plain border `oklch(0.93 0.005 250)`, muted tag/title.
  - `scheduling` → steps are [now, todo, todo]; `in_progress` → [done, done, now].
- **Finish outcomes:** 4 cards (grid `repeat(4,1fr)`): **Work Completed, Parts Needed, Approval Needed, Unable to Complete**. Each = colored dot + bold label + description. Dot/selected colors: Work Completed green `oklch(0.58 0.13 150)`; Parts Needed & Approval Needed amber `oklch(0.66 0.14 68)`; Unable to Complete red `oklch(0.58 0.18 25)`.
  - **`in_progress`:** outcomes are interactive `<button>`s. Selecting one shows a **routing preview** panel (tinted by the outcome color) explaining where the job routes + a CTA. Routing (matches existing waiting mechanics — reuse, don't invent):
    - Work Completed → routes to closeout (stays with user for invoice/certs review).
    - Parts Needed → `pending_info` + `waiting_on_part`; suggests a return visit to dispatch.
    - Approval Needed → `pending_info` + `waiting_on_customer_approval`.
    - Unable to Complete → `pending_info` + `waiting_on_information`; no auto-return.
    - In all three non-complete cases the *tech's* responsibility is complete and the job routes to **office** follow-up. No return visit is auto-created; no invoice/payment behavior is added.
  - **`scheduling`:** a **LOCKED** notice ("Finish outcomes unlock at Step 3, once the visit is in progress") + the same 4 cards rendered non-interactive (`opacity:0.5; pointer-events:none`).
  - **ECC guardrail:** there is **no generic "failed" outcome.** ECC failed/retest is driven only by ECC test records (see Compliance) — keep it that way.

### Work & Billing
Label row + "+ Add Work".
- **Work Items** (operational truth): `in_progress` → list rows (name + mono detail + green "Captured" status pill + mono right-aligned price). `scheduling` → dashed empty state. Work Items are the operational visit scope; **distinct from invoice line items** (billed/commercial snapshot) and from the Pricebook (reusable catalog).
- **Closeout readiness:** bordered list of *Field work complete · Certs / compliance · Billing resolved*, each = status dot + label + detail + status pill. Values/colors change by state (e.g. field = "Pending"/amber in scheduling, "On site"/blue in progress). Closeout blockers must stay visible without hiding field/certs blockers.
- **Invoice bar:** "Ready to invoice" label + big mono total (`$0.00` scheduling / `$485.00` in progress) + **Mark Externally Billed** (outline) and **Create Invoice** (dark) buttons. Billing controls must be gated by existing capabilities; external billing stays separate from internal invoice workflow; payment controls stay with issued-invoice/payment state.

### Follow-Up & Service Chain
Label + `EVERYSTEP` badge. 2-column grid:
- **Schedule a next visit:** **Create Return Visit** (blue outline) vs **Create Callback** (plain). Explainer: a *return* continues unresolved work and links to this visit; a *callback* opens a new issue after completion and leaves original history intact. (Return-needed work goes to office/dispatch first, not directly into tech backlog.)
- **EveryStep sync:** dashed "No active hold" panel explaining that when the field flags Parts/Approval Needed, the ordered → arrived → released tracker appears here and **stays synced to this job and the next visit** (the core EveryStep concept). When a hold is active, render the tracker steps (Part ordered / Part arrived / Job released) with done/pending/auto states.
- **Service chain:** list of linked visits (current visit = blue dot + "#1118"). Do **not** show a "suggested return" row unless a return is actually pending.

### ECC & Compliance
Label. Bordered list: **Permit number · Tests complete · Certs sent · Retest** with status pills (Missing/0 runs = amber; others neutral). Buttons: **Open Tests Workspace** (blue) + **Add Permit Number** (outline). ECC failed/retest tied to ECC test truth; missing-test acts as a closeout blocker.

### Records
Label + tab bar (underline-active tabs): **Timeline · Attachments · Equipment · ECC · Permit · Follow-Up · Service Chain**. Active tab = dark text + 2px accent underline + tinted count chip. Below: list rows (status dot + primary/secondary + mono meta). Timeline content grows with state (in-progress adds On-the-Way / Arrived / Work-captured events). **Preserve the existing hash-target panel IDs** during first implementation so existing deep links keep working. (Notes intentionally do NOT appear here — Job Memory owns them.)

### Command rail (right)
- Job `#1118` (mono).
- Status pills: static `ECC` + dynamic status pill (`NEEDS SCHEDULE` amber / `IN PROGRESS · ON SITE` blue) with a leading dot.
- Primary action button (`Mark On the Way` / `Finish Visit`, blue `oklch(0.55 0.17 255)`) + secondary **Schedule** / **Tests** (outline).
- **Jump nav:** the page's single navigation. Each item = 3px active bar + label; active = blue, inactive = muted. Active state driven by scroll-spy.
- **Blocker list:** heading "`N` item(s) block closeout" + rows (amber dot + text). Count derives from job status.

## Interactions & Behavior
- **Scroll-spy nav:** IntersectionObserver highlights the current section; nav links smooth-scroll (`html { scroll-behavior:smooth }`).
- **Finish outcome selection** (in_progress only): clicking a card selects it and reveals the routing-preview panel tinted to the outcome.
- **Alert dismiss:** hides the strip.
- **Records tabs:** switch the rows list below.
- **Audience toggle, contact-logging, team Manage/Add, map links, billing buttons, compliance buttons:** wire to existing handlers/endpoints.
- **Transitions:** outcome cards use `transition:all .12s`. Keep motion minimal/utilitarian.
- No mobile/responsive work in scope — **this is the desktop page only** (mobile is unchanged).

## State Management
Replace the prototype's `jobState` prop with **real job status** and derive per-section display from it. State/data needed:
- Job: status, schedule, field state, ECC flag.
- Derived: status pill, primary action label, blocker list (the closeout readiness model: field / certs / billing), finish-step states, finish lock/interactive, work-items presence, invoice total, timeline entries.
- Local UI: selected finish outcome, active records tab, active scroll-spy section, alert dismissed.
- Source-of-truth discipline (from product spec): jobs = visit/execution unit; service_cases = continuity/history; job_events = timeline truth; ECC test records = compliance truth; Work Items = operational truth; invoice line items = billed truth; payments = collected-money truth. Keep these boundaries in the data layer.

## Build order (each section independently shippable)
1. Static shell on the V2 route (sheet + sticky rail + scroll-spy), pixel-matching the mock with hardcoded data.
2. Header/rail + blocker model (closeout readiness derived from field/certs/billing).
3. Brief / People / Place (read-only → then actions).
4. Job Memory (notes feed + composer + audience).
5. **Field & Finish** (the gating logic + routing to existing waiting states).
6. Work & Billing (work items → invoice/external, gated by capabilities).
7. Follow-Up (return/callback, EveryStep sync).
8. Compliance / Records (tests; tabbed records, preserve hash IDs).

## Acceptance criteria
- **State-derived rendering:** verified across needs-schedule, in-progress, waiting-on-part, approval-needed, completed-pending-closeout, ECC failed/retest, cancelled/archived — **no premature/out-of-state step is ever shown as actionable.**
- **Roles:** correct for field, dispatch, billing, ECC (contractors are redirected to the portal, not this page).
- **Input completeness (standing check, not one-off):** every mutation reachable from V2 — *including nested/expanded UI, deferred panels, and second-level actions inside components, not just top-level buttons* — must collect and submit **every field its server action requires**. A control that submits with a missing required field lands on a guard banner (`*_required` / `*_invalid`) instead of performing the task. Audit the *form behind the button*, not just that the button exists. (Regression seen: "Add Permit Number" fired the permit-save action with no permit value → `permit_number_required`.)
- **No V2→V1 leaks on guard paths:** redirect audits must cover **guard/rejection redirects**, not just success paths. Every guard redirect (`schedule_required`, `ecc_test_required`, auth, etc.) must honor `return_to` and keep the user on `/jobs/${id}/v2`, falling back to the V1 path only when `return_to` is absent. The ECC "not yet tested" guard is the *normal* state of most ECC jobs before the rater runs tests — it fires constantly, so it must never bounce to V1.
- **Guard banners must be visually distinct from success banners:** the V2 alert strip renders success in green and guard/rejection (`*_required`, `*_invalid`, `not_eligible`, `not_authorized`, wrong-state) in amber/red. A silent rejection must never look like a confirmation. (This is *why* the permit regression was invisible — a rejection read as success.) When a mutation's success and failure both return `?banner=X`, the distinct styling + copy must let the user tell them apart.
- **Contact-method integrity:** contact-logging outcomes submit the correct `method` — "Sent Text" → `method="text"`, call outcomes → `method="call"`. Do not log a text as a call (corrupts contact history and call/text reporting).
- **Preserve EveryStep detail (do not canned-string it):** Parts Needed / Approval Needed / Unable to Complete each collect an **optional free-text note** (which part, whose approval, why unable) — default to the constant only when the tech leaves it blank. A fixed hidden note on every outcome throws away exactly the micro-detail this product exists to capture.
- **Dead-code sweep** (the page grew by accretion — leave cruft behind on the new route, don't port it): remove unused hash-target panels, duplicate note/contact/timeline render paths, orphaned handlers, unreachable status branches, and components the redesign obsoletes.
- **Performance:** derive status/blocker/gating once (server or one memoized selector) rather than recomputing per section; lazy-load below-the-fold, tab-gated Records panels (timeline/attachments/equipment); defer the map and tests workspace until opened.
- **Preserve** existing Records hash-target IDs and deep-link behavior in the first cut.

## Design Tokens
Colors are authored in **oklch** (lift verbatim for fidelity; convert to your token system as needed).
- **Surface/sheet:** white `#fff`; page bg `oklch(0.975 0.004 250)`.
- **Borders:** card `oklch(0.91 0.006 250)`; hairline divider `oklch(0.93 0.005 250)`; faint row rule `oklch(0.96 0.004 250)`.
- **Text:** primary `oklch(0.27 0.02 262)`; body `oklch(0.33–0.35 0.02 262)`; muted `oklch(0.55–0.62 0.015 262)`.
- **Accent (primary/blue):** `oklch(0.55 0.17 255)`; tints `oklch(0.96–0.97 0.02–0.025 255)`, text-blue `oklch(0.5 0.13 255)`.
- **Amber (waiting/blocked):** dot `oklch(0.72 0.15 70)`; bg `oklch(0.96 0.05 75)`; fg `oklch(0.5 0.12 65)`.
- **Green (done/positive):** `oklch(0.58 0.13 150)`; bg `oklch(0.95–0.98 0.025–0.04 150)`; fg `oklch(0.45–0.5 0.13 150)`.
- **Red (danger):** `oklch(0.58 0.18 25)`.
- **Dark (neutral CTA):** `oklch(0.27 0.02 262)`.
- **Radius:** sheet 16; cards/panels 11–12; buttons 9–10; small buttons/pills 6–8; chips 30 (pill).
- **Type:** **IBM Plex Sans** (content) + **IBM Plex Mono** (labels, IDs, status, metrics, prices). Sizes: H1 28/700; section value 14.5; body 13–13.5; labels mono 10–11 uppercase `letter-spacing:0.1–0.14em`; big total mono 26/600. Button text 12.5–13.5/600.
- **Shadow:** minimal — primary button `0 1px 2px rgba(40,80,180,0.25)`; selected outcome `0 0 0 1px <tone>`. Utilitarian, near-flat.

## Assets
- **Fonts:** IBM Plex Sans + IBM Plex Mono (Google Fonts) — or your codebase's equivalents.
- **Map:** the street-view preview is a CSS hatch **placeholder** — wire to the real map provider already used in the app.
- **Icons:** none baked in (a couple of inline glyphs/arrows only). Use your existing icon set for Call/Text/Email/Navigate etc.
- No brand-specific raster assets are included.

## Reference screenshots (`screenshots/`)
- `01-scheduling-state.png` — top of page, **scheduling** state (status `NEEDS SCHEDULE`, primary `Mark On the Way`, 3 blockers, Work Summary = pending).
- `02-in-progress-state.png` — top of page, **in_progress** state (status `IN PROGRESS · ON SITE`, primary `Finish Visit`, 2 blockers, Work Summary = on site).
- `03-field-finish-locked.png` — **Field & Finish in `scheduling`:** Step 1 = NOW, finish outcomes **LOCKED/greyed** behind the "unlock at Step 3" notice. This is the gating to replicate.
- `04-field-finish-in-progress.png` — **Field & Finish in `in_progress`:** Steps 1–2 DONE, Step 3 = NOW, finish outcomes **live**, with *Parts Needed* selected showing the routing preview ("ROUTES TO OFFICE · WAITING ON PART" → *Submit & Flag Return*).

## Files
- `Job Detail Desktop.dc.html` — the hifi prototype (template = layout/styling/copy; logic class `renderVals()` = the state-derived display logic, incl. the `jobState` scheduling/in_progress branch to port).
- `support.js` — prototype runtime **only**; do not port.
- `screenshots/` — the four reference images above.
