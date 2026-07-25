# EveryStep FieldWorks — Ops Board Visual Spec
> Historical concept specification. The approved implementation is recorded in
> `../OPS_DESKTOP_QUEUE_CONTRACT.md`. Later decisions supersede this file,
> including permanent centered desktop actions, removal of desktop scheduling
> Call/Text, removal of the duplicate Go to Today control, current aging rules,
> and rejection of mockup-only load-bar classifications.

### `/ops` — Operations Workspace · queue ledger + shared right rail
**Status: approved direction (Jul 24 2026). Supersedes `vs-agent-handoff.md` §5b–5g and `implementation-audit.md` §7.**
**Visual only. Every data field, every handler, every behavior stays.**

Visual target: `screens/13-ops-board-right-rail.png` · design source: `Navy-vs-Slate-mockups.html` → `16a`, rail parity in `16b`.

---

## 0. What changed since the first handoff

The earlier doc put the queue selector in the **right sidebar as a widget** and kept a gray page with white rounded cards. Both are out. Read this file instead of those sections.

| # | Decision | Why |
|---|---|---|
| 1 | Queue selector becomes the **right rail's index**, built on the grammar the **job detail page rail already uses** | One rail, one reading order, on every screen. Muscle memory instead of a per-page invention. |
| 2 | **No next-action block on the board rail** | Most of the queue is waiting on a contractor, rater, or permit office. A rail that says "do this" when the answer is "we're blocked" gets ignored. Counts do the pointing. |
| 3 | Rail is **sticky**, not internally scrolled | Queue switching stays reachable at row 40. (The job page rail's own scrollbar is a weakness we are not copying.) |
| 4 | **Go to Today stays in the sticky header band** — removed from the rail | The band is already sticky, so the button is always reachable. It's global navigation, not a queue action. One instance only. |
| 5 | Page canvas moves to **beige (sand)** — a **three-fill change**, not a neutral-ramp refactor | Differentiates from ServiceTitan / Housecall Pro (both blue-on-white) at near-zero migration cost. |
| 6 | Job cards → **flat ruled ledger rows**; all numerics in **monospace, tabular** | Hierarchy from rule weight + type weight + one accent. Ages become shapes you scan, not text you read. |

**Retired from the earlier spec:** the sidebar "Operations Snapshot" widget, its `Open →` header link, the hot/warm count-badge coloring (the rail tick carries that now), and the bottom status-dot footer (replaced by the load bar — see §5.2).

---

## 1. Commit order

Ship in this order. Do not combine 1 and 2.

1. **`ui: sand canvas tokens`** — §2 only, app-wide. Whole-app diff, no layout changes. Review before continuing.
2. **`ui: ops board ledger + column headers`** — §5.
3. **`ui: ops board right rail`** — §4.
4. **`ui: ops sticky header band`** — §3.2.

---

## 2. Sand canvas tokens (app-wide, its own commit)

Three fills move warm. **Borders, ink, and blue do not move.** Half-migrated is the only state that looks broken, so this is one pass across the app, not per page.

### Add to the theme

| Token | Hex | Replaces | Use |
|---|---|---|---|
| `sand-50` | `#faf9f5` | `slate-50` `#f8fafc` as a *fill* | Subtle strips: table header rows, filter bars, footers, input fills |
| `sand-100` | `#f5f4f0` | `slate-100` `#f1f5f9` as *canvas* | Page background, every internal screen |
| `sand-150` | `#f2f1ec` | — | Column-header strip (one step darker than a subtle strip) |
| `sand-200` | `#e5e3dc` | *optional* warm hairline | Only where a cool border on warm ground visibly bothers you. Not required. |
| row hover | `#fbfaf6` | `slate-50` hover | Row / nav hover tint |

### Do not touch
Navy `#0f1f35` · blue-700 `#1d4ed8` · blue-600 `#2563eb` · slate-700/500/400 ink · slate-200 `#e2e8f0` borders · green / rose / amber status ramps. A slightly cool hairline on warm ground reads fine. A cool-gray **fill** on warm ground does not — that's the whole reason this is a fills-only change.

### The one caveat that will bite
**Inputs and search fields using a gray fill go muddy on sand.** Every `bg-slate-50` / `bg-gray-100` input must become `sand-50` or white-with-border. Grep for input/search/select fills before you call the commit done.

### Scope check
Warm surfaces are for the **contractor portal** (outside the company). Sand inside the app must read as *paper-ish neutral*, not as the portal's brand warmth — that's why `sand-100` is barely-warm rather than the portal's cream. White surfaces stay pure white; the contrast against sand is what makes cards read as surfaces.

### Monospace numerals
Numeric cells use `font-mono` (Geist Mono, fallback `ui-monospace`) with `font-variant-numeric: tabular-nums`. Confirm Geist Mono is loaded before relying on it; the fallback is acceptable but the column alignment is the point, so tabular-nums is not optional.

---

## 3. Page shell

```
┌──────────────────────────────────────────────────────────┐
│ navy chrome — top nav (unchanged content)                 │  #0f1f35
├──────────────────────────────────────────────────────────┤
│ STICKY BAND — eyebrow · Operations Workspace · Go to Today│  sand-100
├────────────────────────────────────────┬─────────────────┤
│ LEDGER CARD (white, bordered, radius)  │ RAIL (sticky)   │  sand-100 canvas
└────────────────────────────────────────┴─────────────────┘
```

### 3.1 Navy chrome
The top nav sits on navy `#0f1f35`. Content, links, dropdown indicators, badge counts and handlers are **unchanged**. Adaptations only:
- Search field: `rgba(255,255,255,0.07)` fill, `rgba(255,255,255,0.09)` border, placeholder `#7d8ea6`.
- Nav links `#a9b6c9`; active link white/600 with a **2px blue-600 underline** (not a filled pill).
- `+ Create` keeps blue-600 fill **and its `▾` dropdown indicator** (gap #4 in the old audit — do not drop it again).
- Settings: `rgba(255,255,255,0.14)` border, `#e2e8f0` label.
- Brand sub-line "BY COMPLIANCE MATTERS" in mono 9.5px, `0.08em`, `#7d8ea6`.

### 3.2 Sticky header band
`position: sticky` under the chrome, on `sand-100`, with `border-bottom: 1px slate-200` and a soft shadow (`0 6px 14px -12px rgba(15,31,53,0.22)`) so it reads as lifted when content scrolls under it.

Contents: mono eyebrow `Compliance Matters · Operations` → `Operations Workspace` (26px/700, `-0.02em`, navy) → the existing description → **Go to Today** on the right (white fill, slate-200 border, existing `/today` handler). No other buttons in the band.

### 3.3 Content row
`display: flex; gap: 18px; padding: 0 24px 24px` — ledger card `flex: 1; min-width: 0`, rail `288px; flex-shrink: 0`.

---

## 4. The shared right rail

### 4.1 The grammar (applies to the board, the job page, and every surface after)

Position and order are fixed. Content is not.

1. **Where you are** — context line / actions, if the screen has an actionable subject
2. **Where else you can go** — a tick-marked index
3. **What's off** — a dot list of state
4. **Where else to jump** — quick links

Devices mean one thing everywhere:

| Device | Meaning | Spec |
|---|---|---|
| `2px` tick | "jump to this" | `2px × 14px`, radius 1. Active: blue-600 + label 700 navy. Inactive: `#cfd2cd` + label slate-600. |
| `5px` dot | state | Amber `#f79009` = needs you. Gray `#cfd2cd` = fine. Never decorative. |
| mono numeral | a number you compare | Right-aligned, tabular. |
| blue-700 text | a link | Nothing else is blue-700 text. |

Break any of those and the mirroring is cosmetic. Section eyebrows: mono 9.5px, `0.14em`, uppercase, slate-400. Dividers: `1px slate-200`, `14px` margins.

### 4.2 Board rail — three blocks

`position: sticky; top: 16px; align-self: flex-start`.

**QUEUES** — the queue selector. One row per queue, `grid-template-columns: 2px 1fr auto`, `gap: 10px`, `padding: 6px 0`, in this order:

`Needs Scheduling · Exceptions · Waiting / Pending Info · Updates · Field Work · Follow Ups · Contractor Intake · Closeout & Review · Permits · Needs Assignment`

- Row = the existing `setActiveQueue(queue.key)` handler. Same handlers, same live counts, same order of precedence — only the location changed.
- Active row: blue-600 tick, label 700 navy, count as a blue-600 chip with white mono text.
- Tick color: Exceptions `#d92d20`, Waiting / Pending Info `#f79009`, all others `#cfd2cd`. Active queue's tick is blue-600 regardless.
- Count color: Exceptions `#b42318`, Waiting `#b54708`, others slate-600.
- **Empty queues (count 0): `opacity: 0.4` and non-interactive** — unchanged behavior.
- Tick thresholds are per-queue, not per-count. If ops wants them data-driven instead, that's a separate decision — do not invent one.

**QUEUE HEALTH** — one dot list, replacing the two-numeral widget *and* the Team Clock card:
- `{n}` aging over 30 days — gray dot at 0, amber above
- `{n}` unassigned — gray dot at 0, amber above
- clock-in status line — amber dot when nobody is clocked in

Values come from the **same data sources as today**. The inline number is mono/navy inside a slate-600 sentence.

**QUICK LINKS** — blue-700, 13px/500, `gap: 8px`: `Open time clock` (existing time-clock handler — this is where that button went), `Export this queue`, `Operations settings`.

### 4.3 Job page rail — parity rules

Do **not** restructure the job page in this pass. When you next touch it, align it to §4.1: same edge, same 288px, same order, same devices. Its differences are legitimate and should stay:

- It leads with **actions** (`Mark On the Way` / `Schedule Job`) because one record is actionable. The board has no action block.
- Its index (`Job Brief`, `People & Place`, …) has **no counts**. The board's does — a queue has a size, a section doesn't.
- Its dot list is `N items block closeout`; the board's is `Queue health`. Same shape, same dot meanings.
- Its rail takes its own scrollbar. New surfaces should **stick** instead.

The test for any future surface: *can a user describe the rail once and be right on both screens?* — "the right side tells me where I am, where else I can go, and what's off." Validate the pattern on **My Work** before treating it as locked; patterns earn system status at three surfaces, not two.

---

## 5. The ledger

White card, `1px slate-200`, radius 12, `overflow: hidden`. Contains, top to bottom: queue header + load bar → filter row → column headers → rows → footer.

### 5.1 Queue header
Mono eyebrow `ACTIVE QUEUE` (this is the missing label from audit gap #3 — keep it), then queue name 19px/700 navy + mono `{n} jobs` in slate-400. Right side: the three-count legend (`2 urgent · 3 aging · 3 new`) with `7px` square swatches.

### 5.2 Load bar
A `4px` stacked bar, radius 2, on `#eceeea`, directly under the header: urgent (`#d92d20`) / aging (`#f79009`) / new (`#17b26a`) as **percentages of visible jobs**. This replaces the old spec's bottom status-dot footer — same three numbers, shown as proportion where the queue title is, not buried under the fold.

Thresholds (used by the bar, the legend, and the row rail — one source, one helper):
- urgent `daysInQueue >= 13`
- aging `6 ≤ daysInQueue < 13`
- new `daysInQueue < 6`

> **Confirm with Eddie before shipping.** These came from the mockup, not from ops policy. If they change, they change in one place.

### 5.3 Filter row
`sand-50`, `border-bottom: 1px`, one line, `gap: 7px`. Contractor chip (active state: `#eaf0fe` fill / `#c3d4fd` border / blue-700 label, with mono `· {n}`) → reason chip (white / slate-200) → hairline divider → `Sort {label} ↕` → **Export ▾** pushed right (`margin-left: auto`, white fill, blue-700 label).

All four keep their **existing handlers, dropdown contents, state management, and persistence across queue switches**. This is a presentation change: `<select>` elements becoming chip-triggered popovers must open the same options and fire the same callbacks.

### 5.4 Row grid

```
grid-template-columns: 3px minmax(220px, 1fr) 168px 66px 158px 158px;
```

The `minmax(220px, …)` floor is required — with a bare `1fr` the customer column collapses at narrow widths and the header stops aligning with the cells.

| Col | Contents |
|---|---|
| `3px` | **urgency rail** — full-height, `#d92d20` / `#f79009` / `#17b26a` by the §5.2 thresholds. Replaces the "In queue Xd" pill. |
| `1fr` | mono uppercase **job type** 9.5px slate-400 → **customer name** 14px/600 navy → **address** 11.5px slate-400 → **`Reason` {value}** 11.5px, label in `#a3abb8` |
| `168px` | **contractor name** 12.5px/500 → **phone** mono 11px |
| `66px` | **age** — mono 13px/500, colored to match the rail (`#b42318` / `#b54708` / `#067647`). The value is unchanged; only the display is. |
| `158px` | **last action** label 12px/500 → its **timestamp** mono 10.5px |
| `158px` | **last attempt** label + timestamp, same treatment. `No attempts yet` in `#a3abb8` when absent. |

Rows: white, `border-bottom: 1px #eceeea`, `cursor: pointer`, hover `#fbfaf6`. No radius, no shadow, no nested boxes.

**This closes both Priority-1 gaps from the audit:** Reason is the fourth line of the customer cell; Last Attempt is its **own column**, never merged with Last Action.

### 5.5 Hover actions

A panel absolutely positioned over the **last two columns only**:

```
box-sizing: border-box;   /* required — without it the padding widens the box onto the age column */
position: absolute; top: 0; right: 0; bottom: 0;
width: 316px;             /* exactly 158 + 158 */
background: #fbfaf6;      /* solid — no gradient */
border-left: 1px solid #eceeea;
display: flex; align-items: center; justify-content: flex-end;
gap: 6px; padding-right: 14px;
```

Contains `Open Job` (blue-600 fill) · `Call` · `Text` (white, slate-200 border) — **existing handlers/`tel:`/SMS targets unchanged**. Desktop: revealed on row hover, `opacity` only, no layout shift. Touch/mobile: always visible.

Two rules learned the hard way, do not re-litigate:
- **No gradient ramp.** Any ramp inside the box lands on the Last Action label, which starts 12px into the column, and renders half-erased glyphs. Solid fill + hairline left edge.
- **Width must equal the exact column span.** Wider and it covers the age column — the one thing the design relies on for scanning.

Last Attempt is occluded on the hovered row only. Accepted: you're acting on that row, and it's one keystroke back. If ops disagrees, the fix is a permanent actions gutter, which costs the customer column ~200px — don't do it without asking.

### 5.6 Footer
`sand-50`: mono `{n} of {total} shown` · `Show all →` (blue-700) · mono `Updated {time}` pushed right.

---

## 6. Field preservation matrix

Nothing may be dropped. Confirm each against the real field names from your audit.

| Field | Was | Is now |
|---|---|---|
| Job type | blue link, card top | mono uppercase, customer cell line 1 |
| Customer name | card | customer cell line 2 (primary read) |
| Address | card | customer cell line 3 |
| **Reason** | bottom grid col 1 | **customer cell line 4** |
| Days in queue | "In queue Xd" pill | age column (mono) + 3px rail color |
| Contractor | bottom grid col 4 | contractor column line 1 |
| Phone | nested phone box | contractor column line 2 (mono) |
| Last Action + time | bottom grid col 2 | last action column |
| **Last Attempt** | bottom grid col 3 | **own column** |
| Open Job / Call / Text | always visible in card | hover panel (always visible on touch) |
| Queue counts | main-column pills | rail index counts |
| Aging > 30d · Unassigned | Queue Health widget | rail dot list |
| Team clock status + button | Team Clock card | rail dot list + `Open time clock` quick link |
| Go to Today | hero card | sticky band |
| Export · contractor · reason · sort | filter area | filter row (§5.3) |
| `ACTIVE QUEUE` label | above job list | queue header eyebrow |
| `+ Create ▾` indicator | top nav | top nav — **keep the `▾`** |

---

## 7. Verification

**Behavior** — rail row loads that queue in place (no full reload); active queue highlighted; 0-count queues dimmed and inert; contractor / reason / sort / Export open the same UI and fire the same handlers; filter state survives queue switches; Open Job / Call / Text hit the same targets; Go to Today → `/today`; `Open time clock` opens the time clock; notification badge intact.

**Data** — every row shows job type, customer, address, **reason**, age, contractor, phone, last action, **last attempt**; counts match live data; rail, load bar and legend all read from the one threshold helper.

**Visual** — no rounded cards or shadows on rows; 3px rail on every row; column headers align with cells at 1280px **and** at the narrowest supported width; hover panel covers exactly the last two columns with no clipped glyphs and never touches the age column; rail sticks; band sticks; no cool-gray fills left on sand (inputs included); numerals are tabular.

---

## 8. Open questions

1. Age thresholds (13 / 6) — ops policy or mockup guess?
2. Tick colors on Exceptions and Waiting are hardcoded per queue. Data-driven instead?
3. Which columns are sortable? The header shows `Age ↑` as the sorted column; confirm the backend supports sorting the others before making them look clickable.
4. Rail on **My Work** — the third surface that decides whether this is a system. Want it in the same pass?
