# Company Profile — restructure packet

Restructures the internal **Company Profile** admin page (`/ops/admin/company-profile`) from one long equally-weighted scroll into a **sectioned settings console** on the navy app system. **No settings removed** — regrouped.

## Contents (run in order)
1. **`1-AUDIT-PROMPT.md`** — read-only inventory (every section's fields + save mechanism, required/optional, Team & Roles location, ECC/HERS map). Run first.
2. **`2-CODE-HEALTH-AUDIT.md`** — read-only code review, bucketed A/B/C (esp. a shared section/field component). Discuss before building.
3. **`3-IMPLEMENTATION-PROMPT.md`** — build spec: rail + Overview + per-section panels + save bar; ECC/HERS → connect + connected; mobile accordion.
4. Mockups: **`mockup-14a-overview.png`** · **`mockup-14b-section.png`** · **`mockup-14c-echers.png`** · **`mockup-14d-mobile.png`**.

## The redesign in one paragraph
Today's ~10 cards span four unrelated jobs (identity/branding, billing, ECC/HERS connections, onboarding) at equal weight. The pass groups them into a **left rail** (Overview · Identity & Branding · Billing & Payments · ECC/HERS Connections · Team & Roles), leads with an **Overview** that answers "am I set up?", makes **required vs optional** explicit, reuses one **per-section save** panel, and collapses the four ECC/HERS cards toward a simple **connect + connected** view — all on the navy tokens that match Ops and My Work.

## Non-negotiables
- **Navy internal system**, not the warm portal brand.
- **No settings removed** — regrouped; account scoping + admin authz stay server-side.
- **Both surfaces** — desktop rail, mobile accordion.

## Open items (confirm in audit)
- **Team & Roles** location — embed vs link out vs not-yet-built.
- **ECC/HERS** shipped as a **Partner Network** summary + link-out (the four old cards are retired); the profile only summarizes and links.

## How to run
Attach the four PNGs. Order: **audit → code-health → (discuss) → implementation.**

_Design source: turns 14a–14d in `Navy vs Slate.dc.html`._
