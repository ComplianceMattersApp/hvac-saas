# EveryStep FieldWorks — Visual Alignment Spec

**For:** the dev pass (Claude Code).
**Scope:** Today, Job ID, Customers, Test Workflows, Equipment.
**Nature:** a token + component pass. **Direction is locked. Do not redesign.**
**Baseline:** Geist is already resolved app-wide — do not touch fonts.

> ⚠️ **No functionality changes.** Only visual containers and tokens change. Test entry fields, readings, pass/fail math, save & complete logic, routing, and data sources stay exactly as they are. There are only **two** structural edits (§4 Tests, §4 Equipment); everything else is color/class swaps.

---

## 1. Decision

Navy is the standard:
- **Heading** `#0f1f35` (navy)
- **Eyebrow / link / accent** `#1d4ed8` (blue-700)
- **Primary action** `#2563eb` (blue-600) — one action color, everywhere. No dark/near-black buttons.
- **Slate** is the neutral scaffolding.

**Today** and **Job ID** already run this system — they are the reference. Change nothing on them except confirming the eyebrow tick (§3) is present.

---

## 2. Color tokens

| Token | Hex | Tailwind | Use |
|---|---|---|---|
| Navy | `#0f1f35` | (custom) | Headings |
| Blue-700 | `#1d4ed8` | `blue-700` | Eyebrows, links, the tick |
| Blue-600 | `#2563eb` | `blue-600` | Primary action (fills) |
| Blue-50 | `#eff6ff` | `blue-50` | Identity chip fill |
| Slate-700 | `#334155` | `slate-700` | Body text |
| Slate-500 | `#64748b` | `slate-500` | Muted text |
| Slate-400 | `#94a3b8` | `slate-400` | Field labels (no tick) |
| Slate-200 | `#e2e8f0` | `slate-200` | Borders |
| Slate-100 | `#f1f5f9` | `slate-100` | Canvas / rails |
| Green | `#f0fdf4` / `#bbf7d0` / `#15803d` | `green-50/200/700` | Done · pass |
| Rose | `#fff1f2` / `#ffe4e6` / `#9f1239` | `rose-50/200/800` | Fail · danger |
| Amber | `#fffbeb` / `#fde68a` / `#b45309` | `amber-50/200/700` | Attention · blocks closeout |

---

## 3. Component rules

### Section eyebrow — WITH TICK (new; applies to every page)
A `3px × 13px` blue-600 bar (radius 2), an `8px` gap, then the label: `11px / 600`, `letter-spacing: 0.09em`, uppercase, `#1d4ed8`.

```html
<div class="flex items-center gap-2 mb-1">
  <span class="w-[3px] h-[13px] rounded-sm bg-blue-600"></span>
  <span class="text-[11px] font-semibold tracking-[0.09em] uppercase text-blue-700">Section Eyebrow</span>
</div>
```
Today already does this. Propagate to Customers, Tests, Equipment, Job ID.
**Field labels** (inside forms) use `slate-400` and get **no** tick — the tick is reserved for section eyebrows.

### Card
White fill · `1px` `slate-200` border · `border-radius: 16px` (`rounded-2xl`) · layered soft shadow: `0 1px 2px rgba(15,23,42,.04), 0 8px 24px -14px rgba(15,23,42,.12)`.

### Buttons
- **Primary:** `blue-600` fill, white text, `rounded-[10px]`.
- **Secondary:** white fill, `1px slate-200` border, `blue-700` text.
- No dark/near-black buttons — convert to primary blue.

### Chips
Rounded-full, `padding: 3–4px 9–11px`. **Identity** = blue-50 fill / blue-700 text. **Status** = semantic (green done, rose fail, amber attention, slate neutral).

### Disclosure (replaces raw `<details>/<summary>`)
Bordered card, `rounded-xl`, header row (title + affordance) on `slate-50`. **Danger/destructive** variant: rose tint — `#fff8f8` fill, `#ffe4e6` border, `rose-800` title.

---

## 4. Work per area

### Today & Job ID — NO CHANGE
Reference / anchor. Already on-system. Only confirm the eyebrow tick (§3) is present (Job ID gains it).

### Customers — RETINT (no layout moves)
1. Headings (`Find a Customer`, `Customers A–Z`): slate-950 → **navy**.
2. Eyebrows (`CUSTOMER DIRECTORY`, `ALPHABETICAL DIRECTORY`, `SEARCH GUIDANCE`): slate-500 → **blue-700 + tick**.
3. `Search` & `Export CSV` buttons: slate-900 → **blue-600**. Active A–Z letter chip → **blue-600**.

### Test Workflows — RETINT + STRUCTURE
Retint: headings → navy, eyebrows → blue-700 + tick. Then the one structural change:
- **Remove the four-tile status block** (Required Left / Done / Draft / Not Started). Replace with a **one-line status bar**:
  - `0 left` → green `✓ All tests complete · x/y`
  - `> 0 left` → blue progress bar: `N left · x/y` with a filled track.
  - **Same completion data source** — presentation only.
- **Danger zone:** raw `<details>` → styled rose disclosure (§3).
- **Complete Test** button: navy → **blue-600**.
- This is the **shared test wrapper**, so every test screen (Duct Leakage, Airflow, Fan Watt Draw, …) inherits it. **Test-specific entries are untouched.**

### Equipment forms — REBUILD (the only real redesign)
Files: `ProfileEquipmentCreateForm.tsx`, `EquipmentEditCard.tsx` (embedded in Customer detail & Job Info).
- `gray-*` → `slate-*` token family.
- Raw `<details>/<summary>` → styled disclosure components (§3).
- Add the card treatment: white `rounded-2xl` + soft shadow (was flat, no shadow).
- Split destructive actions into a semantic **rose danger card**.
- Navy heading, blue-700 eyebrow + tick.

---

## 5. Mobile — Tests layout

- Fold the standalone "System Label" line into the header; drop the "Tests Complete" banner.
- **Status bar** (the one-liner from §4) sits between the action row and Tests to Run — one line, never a grid of tiles.
- Actions (Equipment / Report / CHEERS) collapse to one compact row.
- **Current Tests grid:** single test = one full-width card; **2+ tests = 2×2 grid**.
- Dots: open test = **blue**, done = **green**. **"Add another test"** is a dashed cell, shown **only while tests are open**.
- **One primary button** — the up-next test (blue fill); the rest are secondary/outline. **No separate "Continue" button.**
- Touch targets ≥ 44px.

---

## 7. Customer detail page (`app/customers/[id]/`)

**Nature:** keep all 8 tabs and 100% of capability (every field, ~30 actions, permission gates, banners). This is an **Overview reorganization + token/disclosure pass**, plus two flagged decisions — not a data change.

### 7.1 Overview → call-in command center
The Overview is the landing surface and gets restructured around the "customer calls in" flow (verify identity/address → see last visit → reschedule). Reorder so history leads, zeros collapse:

- **Identity header** — name + type chip, primary phone/email with **Call / Text / Email**, service address + Map, and a prominent **Last Visit** stat. Fix: **Create Job** near-black → **blue-600**.
- **Service History leads** — promote the Work-tab timeline onto Overview: recent visits (open = blue dot, done = green), each linking to its job, with a primary **Schedule Next Visit** (blue) + Create Estimate. This is the centerpiece; it was previously one click away.
- **Needs Attention (right rail)** — collapse the nine `0` ops-status chips + empty Attention/Service-Plan cards into ONE panel that shows only non-zero signals (e.g. "1 job pending info", payment attention); otherwise "all clear." No walls of zeros.
- **Systems at this address** — surface the HVAC units (condenser/furnace: make/model/tonnage/refrigerant/AFUE) on Overview. Critical "what do they have" context that was buried in a tab.
- **Quick Facts + Account & Access** — condense contact/billing/money into a snapshot (locations, contacts, plan status, lifetime jobs, balance). **Surface the site-access contact** (often a different person, e.g. "Manuel — call before arrival") — a real call-in need. The deep tabs still own the full detail.
- **Redundancy rule:** Overview shows *snapshots*; the tabs own *detail*. Do not re-render the full Money Overview / Account Summary on Overview — link to the owning tab.

### 7.2 Service Plans — read-first (tames the "monster")
Today every heavy form renders always-open and stacked inside each agreement card (the ~12-field Add Billing Period + 8-line posture policy, the full Edit Details form, the Add-Work builder). Restructure to **read first, write on demand**:

- **Plan card defaults to a READ view:** Plan Snapshot (status/frequency/dates/visits grid) + What's Included + a scannable **billing-period LIST** (coverage dates · cadence · amount · posture · status chip · Edit). No open forms by default.
- **Heavy forms move into a focused drawer/modal** opened by explicit actions (**Add Billing Period**, **Edit Plan & Work**). One task at a time.
- **Group the billing-period form** into Coverage / Amount / Status / Reference sections; tuck the posture policy copy into a "what do these mean?" disclosure instead of always-on.
- Overview tiles (Active Plans / Next Due / Billing Attention / Scheduling) stay as a compact stat row. **Add service plan** button → blue-600.
- No fields, cadences, postures, statuses, or actions removed — only sequenced.

### 7.3 Lighter tabs — mechanical (no bespoke mockup)
Apply the existing system directly:
- **Raw `<details>/<summary>` disclosures are pervasive here** — "Add account contact", "Add site/access contact", "Edit Service Address", "Add Location", "Add System" — all → the styled Disclosure component (§3).
- **Settings:** the three oversized single-stat cards (Total Jobs / Active Work / Completed) → one compact stat row. Danger Zone → rose danger card.
- **All tabs:** headings → navy, eyebrows → blue-700 **+ tick**, active tab + any near-black button → the correct navy/blue tokens.

### 7.4 Two decisions (resolved)
- **Customer Notes:** KEEP as customer-level notes independent of jobs. **Wire up the real `CustomerNotesTextarea` component** (with its "No notes on file" placeholder) — adopt it, don't delete. Replaces the inline `<textarea>` currently rendered.
- **Tab loading (the full-page reload):** the reload-on-tab-click is the issue. Move to **client-side tab switching** (swap panels without navigation) + **lazy-load per tab** (fetch a tab's data on first open, then cache) instead of pre-fetching everything and re-rendering the whole page. Engineering change, no visual impact — big perceived-speed win.

---

## 8. Systems & Equipment + equipment lifecycle (SCHEMA-FIRST — its own project)

> ⚠️ This is **not** a UI pass. An audit found the data model can't support the feature yet, so build the schema first, then the screens. Mockups: **8a** (browse redesign) and **8b** (lifecycle + system labels) in `Navy vs Slate.dc.html`.

### 8.1 The model (target)
- **Equipment belongs to the address (location), not the job.** A job is *provenance* (an event that installed/replaced a unit), never the owner.
- **Location → System → Components.** A **system** is a user-labeled grouping (default `System 1/2/3`, renameable to "Upstairs"/"Downstairs"). A **component** (furnace, condenser, coil, package unit, mini-split head…) is the unit with specs and its own lifecycle.
- **Lifecycle per component:** `Active` → **Replace** retires the old unit (never deletes) and installs the new active one. Retire reasons: **Failure / Warranty / Upgrade**. Provenance on install: **this job / other contractor / standalone**.
- **Serves both sides:** compliance (Title-24 alteration paper trail) + service (what's installed + how old, per address).

### 8.2 Current state (from audit) — why schema-first
- **Two parallel schemas**, merged only at render: job-scoped (`job_systems` / `job_equipment`, both `job_id` NOT NULL) and the newer location-scoped (`customer_location_systems` / `equipment`). Same physical unit across 3 jobs = 3 systems today.
- **No lifecycle columns anywhere** (`status` / `retired_at` / `replaced_by`) — the core gap.
- **Provenance is implicit** (which table the row is in), not a column.
- Location path is **add-only** (no edit/archive/delete) and **missing** tonnage/refrigerant/heating fields.
- RLS on `equipment` requires `system_id IS NOT NULL` (in tension with standalone units).
- "View Equipment" and "Manage Equipment" **resolve to the same URL** (one is a redirect hop) — genuinely redundant, drop one.

### 8.3 Decision (locked)
**Historical `job_equipment` = immutable snapshots** (shown on their job, never rewritten). **The location-owned schema is canonical going forward.** Do NOT fuzzy-migrate old rows into physical units — for compliance the job records stay frozen. Optionally a one-time *assisted* "link this active unit to the location" step, never automatic.

### 8.4 Migration shape (describe → review → then write)
- **Canonical system** = `customer_location_systems` (already location-scoped, has `archived_at`, a `name` for the label). Default label `System N`; user-renameable.
- **Extend `equipment`** with: `status` (active|retired), `retired_at`, `retire_reason` (failure|warranty|upgrade), `replaced_by_equipment_id` (self-FK), `install_source` (job|contractor|standalone), `source_job_id` (nullable FK — provenance made explicit). **Backfill** the tonnage/refrigerant/heating fields it currently lacks.
- **Loosen** the `system_id IS NOT NULL` RLS if standalone equipment must be internally readable.
- Extend `job_system_filters` to reference the persistent system (later, not blocking).

### 8.5 Build order (within this project)
1. **Migration + field backfill** (§8.4) — schema before anything.
2. **CRUD on the location path** — add edit / archive / delete (missing today) for systems + components.
3. **Lifecycle** — the Replace flow (retire reason → new unit → provenance) writing the new columns.
4. **UI 8a/8b** — label-led systems, spec-grid components, triad → **Open Job + ⋯** (and drop the redundant View/Manage duplicate), Replace drawer, retired-inline + "view full history", empty → "Add details", Add System → blue drawer, ticks/navy.
5. Re-point consumers (Overview glance, job detail badge, ECC scenario resolution) at the canonical reads; verify the flagged `ecc_test_runs.equipment_id` FK.

---

## 9. Suggested build order (whole engagement)

1. **Global tokens + the eyebrow tick** (touches everything; do first).
2. **Equipment rebuild** — the real work.
3. **Customers + Test Workflows retint** — mechanical once tokens land.
4. **Mobile Tests layout** — status bar + grid rules.
5. **Customer Overview reorganization** (§7.1) + lighter-tab token/disclosure pass (§7.3).
6. **Customer Notes wire-up + tab client-side switching** (§7.4).
7. **Service Plans read-first restructure** (§7.2) — larger; its own project.
8. **Systems & Equipment + equipment lifecycle** (§8) — schema-first; its own project.

---

## Visual reference
Mockups live in `Navy vs Slate.dc.html` (open in a browser). Turn map:
- **1a/1b** navy-vs-slate decision · **2a** token spec · **2b** Equipment before→after
- **3a–3f** mobile Tests flow (3f = final: option-C status bar) · **3d** status-aid rationale
- **4a/4b** Customers retint · **5a/5b** the eyebrow tick · **6a** Equipment mobile · **6b** Test Workflows desktop
- **7a** Customer Overview desktop (call-in) · **7b** Service Plans read-first + drawer · **7c** Customer Overview mobile
- **8a** Systems & Equipment browse redesign · **8b** equipment lifecycle + system labels (Replace drawer, retired chain)

Attach screenshots of the relevant turns alongside this file when prompting.
