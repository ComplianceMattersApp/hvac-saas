# Compliance Matters UI Blueprint

> Reference document for the approved page-layout system.  
> Established from the `/jobs/[id]` redesign. All future pages should reference this before introducing new layout patterns.

---

## Product UI Philosophy

The app should feel like a **live operational workspace**, not a form editor.

| Principle | Description |
|---|---|
| **Clear next action first** | The most actionable control for the current job state is always the most prominent element |
| **Context grouped by workflow meaning** | Panels are ordered by operational sequence, not data schema |
| **Read state separate from edit state** | Summary/status is always visible; edit panels are collapsible and secondary |
| **Job type drives module visibility** | ECC-only panels, permit UI, and compliance modules only render for relevant job types |
| **Hierarchy over equal tiles** | Avoid uniform card grids when some panels clearly matter more than others |

---

## Core Page Blueprint

### Wrapper

```
mx-auto w-full max-w-[88rem] p-6 space-y-6 overflow-x-hidden
```

Every page uses this centered container. No wider. No narrower for content.

---

### Zone 1 — Hero / Job Center

**Purpose:** Identity, destination context, and quick-launch actions.

```
rounded-3xl border bg-gradient-to-br from-white via-slate-50 to-blue-50/40 shadow-sm
```

#### Internal layout (three-column at xl, stacks on mobile)

| Column | Content |
|---|---|
| **Left** | Customer/job identity: name, type, contact info, contact actions |
| **Center** | Primary visual: map/location image with address overlay (top-right of image), no duplicate address below |
| **Right** | Contextual sidecar: permit, jurisdiction, job metadata — only renders for relevant job types |

#### Top utility row (inside hero, above columns)

- Section label (e.g. "Job Center") — `text-[11px] font-semibold uppercase text-blue-600`
- Navigation links: Back, Open Customer
- **Primary CTA top-right**: field action button or Field Complete state — `bg-blue-600`

#### Status chips row (below columns)

- Field status chip: **green** when complete, **blue** when in progress
- Ops status chip: blue tint
- Pending Info chip: amber — only when signal is active
- Font: `text-xs font-medium`

---

### Zone 2 — Main Work Area (two-column grid)

```
xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.92fr)]
```

#### Left column — Operational workflow

Ordered top to bottom by workflow sequence:

1. **Job Status** — ops_status selector, lifecycle state display
2. **Follow Up** — active edit, always open
3. **Follow-Up History** — collapsible `<details>`
4. **Retest / Correction Review** — conditional on job state
5. **Contractor Report** — conditional

#### Right column — Context rail

Ordered top to bottom:

1. **Equipment** — location-based equipment context
2. **Attachments** — internal file attachments
3. **Service Chain** — parent/sibling/child job relationships
4. **ECC Summary** — visible only when `job.job_type === "ecc"`

---

### Zone 3 — Edit Zone

Collapsible `<details>` panels. Collapsed by default except where active editing is expected.

**Ordering within the edit zone:**

1. Larger operational panels first (Scheduling, Permit & Compliance)
2. Small utility controls below (Change job type, Change contractor)
3. Admin/destructive actions last (Archive)

Permit & Compliance panel defaults `open` for ECC jobs. All others default closed.

---

### Zone 4 — Knowledge Layer (bottom)

Single bordered `<section>` containing connected `<details>` panels:

1. **Shared Notes** — customer-visible note log, open by default
2. **Internal Notes** — staff-only, open by default
3. **Timeline** — full event log, collapsed by default

Attachments that are operationally relevant should be promoted to the right context rail (Zone 2). Bottom placement is for archive/reference only.

---

## Visibility Rules

| Rule | Detail |
|---|---|
| ECC-only panels | Hide unless `job.job_type === "ecc"` — applies to ECC Summary, Permit & Compliance edit panel |
| Permit/compliance UI | Only render where the job type requires it |
| Summary first, edit second | Never lead with edit controls; status/read view comes first |
| No duplicate actions | An action should appear in one place only — e.g. `Edit Customer` should not appear in both the hero and a sub-panel |
| Address shown once | If overlaid on the map image, remove the separate address line below |
| Pending Info signal | Only shown as an amber chip when the business signal is active; never as a default state |

---

## Visual Rules

| Rule | Detail |
|---|---|
| **Blue = primary action** | `bg-blue-600 hover:bg-blue-700` for all primary buttons and saves |
| **Green = success / complete** | Use `bg-green-100 text-green-800` for completed/closed/field-ready states |
| **Amber = attention / pending** | Pending Info, hold states |
| **Red = error / destructive only** | Do not use red for neutral or informational states |
| **Gray = neutral / inactive** | Default background chips, secondary labels |
| **Avoid equal tile grids** | When hierarchy matters, use fractional column sizing not equal columns |
| **Focus rings** | `focus:ring-blue-500` on all form controls |
| **Label weight** | Form field labels: `font-semibold text-slate-700` |
| **Helper text** | `text-xs text-gray-600` — not gray-400 or gray-500 |
| **Section labels** | `text-[11px] font-semibold uppercase tracking-wide text-slate-400` for secondary group headings |
| **Panel headings** | `text-base font-semibold text-slate-900` |
| **Card borders** | `border border-slate-200 rounded-xl bg-white shadow-sm` |
| **Hero section** | `rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50/40` |

---

## Reuse Targets

This blueprint should be adapted for:

| Page | Hero Left | Hero Center | Hero Right | Notes |
|---|---|---|---|---|
| **Jobs** | Customer/contact | Location map | Permit (ECC) | Reference implementation |
| **Customers** | Customer identity | Primary location map | Account summary | Adapt hero columns |
| **Locations** | Location identity | Address/map | Equipment summary | Image panel same pattern |
| **Service Cases** | Case identity | Related jobs | Status/history | Knowledge layer prominent |
| **Future HVAC workflows** | Job/asset identity | Site visual | Compliance context | Follow same zone ordering |

---

## Do Not Drift

> Before introducing a new layout pattern on any page, reference this document first.

If a proposed design requires:
- a new column arrangement
- a new zone order
- a new chip/badge color semantic
- a duplicate action placement
- a new section below the knowledge layer

...it should be evaluated against this blueprint and only adopted if it genuinely improves the workflow for that page type. Cosmetic variation is not a reason to diverge.

The goal is a cohesive operational UI — every page should feel like it belongs to the same system.
