# Browser tests

Run the local Chromium suite:

```bash
npm run test:e2e
```

Playwright starts the Next.js development server on `127.0.0.1:3100` unless
`PLAYWRIGHT_BASE_URL` points to an already-running environment.

Useful commands:

- `npm run test:e2e:headed` — watch the browser.
- `npm run test:e2e:ui` — use Playwright's interactive runner.
- `npm run test:e2e:install` — install the managed Chromium runtime.

Keep destructive or production-data workflows out of the default suite. Future
authenticated tests should use dedicated test users and saved storage state,
never personal credentials committed to the repository.
