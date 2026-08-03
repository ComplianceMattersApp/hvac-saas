# End-to-end (browser) tests

These tests boot the real Next.js app and drive it in a real Chromium browser
with [Playwright](https://playwright.dev). They complement the vitest unit /
component tests: vitest checks functions and components in isolation; these check
that whole pages actually render and wire together in a browser.

## Two phases

**Phase 1 — public pages (runs everywhere, incl. CI).**
`public-pages.spec.ts` covers the login, signup, and legal pages plus the
logged-out auth redirect. The app boots against a *placeholder* Supabase backend
(fake URL/keys), which is enough to server-render and hydrate these pages. No
secrets required.

**Phase 2 — authenticated pages (gated).**
`authenticated.spec.ts` covers pages behind login. These need a **real test
Supabase project** and a **seeded test account**, so they *skip themselves*
until credentials are provided (reported as skipped, never failed).

## Running locally

```bash
npm run test:e2e            # Phase 1 (boots the app with placeholder env)
npm run test:e2e:report     # open the last HTML report
```

If a matched Chromium is pre-installed at a fixed path (some sandboxes/CI), point
Playwright at it:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```

Otherwise download the browser once: `npx playwright install chromium`.

## Running Phase 2 (authenticated)

Stand up an app instance connected to a **test** Supabase project (never
production — see `ENVIRONMENT_RULES.md`), seed a test user, then:

```bash
E2E_BASE_URL=http://localhost:3000 \
E2E_TEST_EMAIL=<seeded test user email> \
E2E_TEST_PASSWORD=<password> \
npm run test:e2e
```

`E2E_BASE_URL` also lets you point the suite at an already-running deployment
(e.g. a Vercel preview) instead of having Playwright boot a local dev server.

## What NOT to do

- Do not put real credentials in `playwright.config.ts` or commit a `.env` file.
- Do not run Phase 2 against the production Supabase project.
