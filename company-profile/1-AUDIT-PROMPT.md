# Audit prompt — Company Profile (`/ops/admin/company-profile`)

Paste into Claude Code or Codex. **Read-only inventory. Do not change any files.** Report structure, cite paths; where unsure, say so.

We're restructuring the internal **Company Profile** admin page into a **sectioned settings console** on the navy app system (mockup turns **14a** overview / **14b** a section / **14c** ECC/HERS simplified / **14d** mobile in `Navy vs Slate.dc.html`). **No settings removed** — regrouped into a left rail (one panel at a time) with an Overview that loads first. Confirm the real field set and save model so the restructure is faithful.

## 1. Page & data
- File(s) rendering `/ops/admin/company-profile` (page + components + server actions/queries).
- Who can access it (roles/permissions) and any redirect for non-admins.
- One-paragraph data flow: request → auth → fetch account/company → render.

## 2. Section inventory (every card on the page today)
For each, list fields, their source, and the **save mechanism** (per-field, per-section button, none):
- **Header:** Admin Center eyebrow, title, subtitle, "Used on invoices…" chip, Admin Center button.
- **Customer-facing identity (preview)** + **Company details:** logo (upload / remove; formats; size cap), company name, business email, business phone, Google review link (+ its helper behavior — review-ask button on completed jobs).
- **First job training:** Open Training Room — where it links.
- **Subscription:** plan, account status, subscription status, the comped/internal note, "Advanced subscription details" disclosure.
- **Invoice Settings:** company invoice workflow (options: use EveryStep invoices vs track outside/QuickBooks), the explanatory copy, Save invoice settings.
- **Online Payments:** ready state, Manage online payments, Refresh payment status, last-checked timestamp, "Advanced payment details" disclosure.
- **Default ECC/HERS Rater Details:** empty state + "Advanced" disclosure.
- **ECC/HERS Rater Connections:** "rater accounts this company can send to", pending invites, empty state.
- **Contractor Sending Connections:** invite by contractor account ID or email, "this account ID" display, contractor sender account ID, invite email, company name, Create connection invite, "accounts allowed to send here", email invites.
- **Connected Handoff Accounts:** connected count, "Advanced ECC/HERS handoff details" disclosure.

## 3. Save model (decide the pattern)
- Which sections save independently today vs share a save? Is there any global save? This determines whether **per-section save + unsaved-changes bar** (the mockup's model) matches or changes behavior.

## 4. Required vs optional
- Which fields are actually required to operate (company name, contact?) vs optional/power-user (review link, default rater, connections)? Any server-side validation that tells us?

## 5. The Team & Roles question
- The mockup's rail includes **Team & Roles**, but it's **not visible** in the current screenshots. Does user/role management live on this page, a different admin route, or not yet built? Report where it is so we place it correctly (link out vs embed).

## 6. ECC/HERS simplification (target: connect + connected)
- Map today's four ECC/HERS cards (Default Rater Details, Rater Connections, Contractor Sending Connections, Connected Handoffs) to their queries/actions. Which are **display**, which **mutate** (create invite, accept, connect)?
- What's the minimum to express **"Connected list + Connect an account"** with the rest behind an Advanced disclosure? Flag anything that can't collapse without losing function. (Note: the owner is actively simplifying the backend here — report current state; don't assume.)

## 7. States & reuse
- Loading, error, empty variants per section. Does the page share components with other admin/settings pages?
- Responsive today or desktop-first? Note breakpoints.

## Output
Structured report: **Page & data → Section inventory (fields + save mechanism each) → Save model → Required/optional → Team & Roles location → ECC/HERS map → States & reuse.** Cite files, components, fields. **No code changes.**
