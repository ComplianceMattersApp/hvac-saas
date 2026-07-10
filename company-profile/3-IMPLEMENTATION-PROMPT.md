# Implementation handoff — Company Profile restructure

**For:** the dev pass (Claude Code / Codex).
**Design source:** mockup turns **14a** (overview) · **14b** (a section) · **14c** (ECC/HERS simplified) · **14d** (mobile) in `Navy vs Slate.dc.html`. Attach the four PNGs in this folder.
**Nature:** **restructure + token pass** — regroup existing settings into a sectioned console. **No settings removed.** Run the audit (`1-AUDIT-PROMPT.md`) + code-health (`2-CODE-HEALTH-AUDIT.md`) first.
**Tokens:** internal navy app system per `VISUAL-ALIGNMENT-SPEC.md` §2–3 (same as Ops / My Work) — **not** the warm portal brand. Navy `#0f1f35` headings, blue-700 `#1d4ed8` eyebrow **+ tick**, blue-600 `#2563eb` primary, slate scaffolding, Geist Mono eyebrows.

## 1. Layout — section rail + one panel
Replace the single long scroll with a **left rail** of five sections, showing one panel at a time:
**Overview · Identity & Branding · Billing & Payments · ECC/HERS Connections · Team & Roles.**
Rail items show state at a glance (green dot = complete, count chip = items, amber = needs attention). Route each to a hash/segment so it's linkable and back-button friendly. On mobile the rail becomes an **accordion** (14d), one section open at a time.

## 2. Overview (loads first)
A summary, not a form: logo + company name + contact, status chips (Account active · plan · Online payments ready), a **Needs attention** list (e.g. "No company logo uploaded", optional items muted), the **first-job-training** as a slim banner (not a full card), and quick **Edit →** cards jumping to each section.

## 3. Section panel pattern (14b) — reuse for every section
Build one `SettingsSection` shell: eyebrow + tick, title, sub, the fields, then a **sticky save bar that appears only on change** ("Unsaved changes" + Discard + Save changes). **Per-section save.** Field state is explicit: `*` required · muted "Optional" · amber "Recommended".
- **Identity & Branding:** logo (Choose file / Remove; formats + 5MB), company name*, business email*, business phone*, Google review link (optional, with helper).
- **Billing & Payments:** subscription (plan / account status / subscription status + comped note + Advanced disclosure), invoice workflow select (EveryStep vs track-outside/QuickBooks) with its explainer, online payments (ready state, Manage, Refresh + last-checked, Advanced disclosure). Keep the existing per-area saves.
- **Team & Roles:** members + roles. **Per the audit**, if this lives on another route, embed a summary + link out rather than rebuilding; if not built yet, show a placeholder that matches the shell.

## 4. ECC/HERS → Partner Network summary + link-out (14c)
The backend now exposes a single **ECC/HERS Partner Network** surface (the old four cards — Default Rater Details, Rater Connections, Contractor Sending, Connected Handoffs — are gone). On the profile, render a **slim summary card**: connected count + partner name(s) + a **Manage connections →** button that routes to the dedicated Partner Network page. Do **not** rebuild the connect/connected UI inline — it lives on that page.
- **Profile section:** eyebrow "ECC/HERS Partner Network", one-line sub, a connected-count chip, Manage connections →.
- **Partner Network page (where it links):** Connected list (company · direction · date · ✓ Connected · Manage) + a single **Connect a company** action (invite by email / accept pending); account-ID/token flows behind an **Advanced** disclosure.
> This matches the shipped backend. Wire the summary to the real connection count/state and the button to the Partner Network route; don't reintroduce the retired cards.

## 5. Save model
Per-section save with an on-change unsaved-changes bar (matches the mockup and the existing per-area Save buttons). No global page Save. Confirm against the audit; if a section autosaves today, keep that and show a saved indicator instead.

## 6. Mobile (14d)
Accordion sections; Overview summary + needs-attention pinned on top; per-section Save inside each open row; touch targets ≥44px. "Run it from your fingertips" is a first-class surface here.

## 7. Guardrails
- Keep every setting and action; keep account scoping + admin authz server-side (fix any audit-flagged gap first).
- Don't change billing/payment/connection behavior — only presentation + grouping + save affordance.
- Navy tokens only; no warm-portal styling.

## Build order
1. `SettingsSection` shell + field components + save bar.
2. Rail + routing + mobile accordion.
3. Overview (summary + needs-attention + jump cards).
4. Identity & Branding into the shell.
5. Billing & Payments into the shell (keep existing saves).
6. ECC/HERS collapsed to connect + connected (+ Advanced).
7. ECC/HERS Partner Network summary card + Manage-connections link (destination page is its own surface).

## Output
A PR that turns Company Profile into a sectioned settings console — rail + Overview + per-section panels, ECC/HERS simplified to connect + connected — on the navy system, desktop + mobile, **no settings removed**, scoping/authz intact. Note anything deferred (e.g. Team & Roles location, backend-pending ECC/HERS bits).
