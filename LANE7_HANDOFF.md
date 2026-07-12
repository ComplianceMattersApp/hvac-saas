# Lane 7 — Handoff (stop point)

Branch: `lane7-capacitor-statusbar-splash-fixes` @ `78cd9d34` — pushed, **not merged**, no PR.
Production untouched. Nothing is broken. Safe to walk away.

## What's done
Geolocation root cause found and fixed. Branch was 19 commits behind main and its APK
had no location permissions at all — Android never prompted, `getCurrentPosition()` failed
instantly with `POSITION_UNAVAILABLE`, and `"unavailable"` had no render branch, so the UI
fell through to the same button. That's the flicker-then-nothing.

Rebased onto main (inherits the permissions + `MainActivity` delegate). Added `unavailable`
and `denied` render states. Removed the 9 debug logs. Added `values-v31/styles.xml` +
`splash_icon.xml` for the Android 12+ splash.

Diff vs main is 4 files: `TodayFieldConditionsClient.tsx`, `capacitor.config.ts`,
`res/values-v31/styles.xml`, `res/drawable/splash_icon.xml`.

## ✅ ROOT CAUSE CONFIRMED ON DEVICE (owner-verified)
Installed the rebased debug build, manually granted Location in Android Settings, tapped the
button → **weather loaded**. That confirms the diagnosis end to end using nothing but
production web code: the missing manifest permission was the whole story, and the rebase
fixed it.

It also confirms the branch's TSX is *necessary*, not just correct. Nothing on the production
path ever requests the Android **runtime** permission — main's `MainActivity` only grants at
the JS layer (`callback.invoke(origin, true, false)`). The thing that actually raises the OS
dialog is `Geolocation.requestPermissions()`, which only exists in this branch.

> ⚠️ **BEFORE THE REAL SMOKE TEST: revoke that permission.** It's sticky. Android will see it
> as already granted and skip the prompt, so you'd never test the request flow you're
> shipping. Settings → Apps → EveryStep FieldWorks → Permissions → Location → **Don't allow**
> (or clear app data) first.

## Do these three things next, in this order

**1. One-line security fix (5 min).** `capacitor.config.ts` currently has:
```ts
webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production',
```
`npx cap sync` does not set `NODE_ENV`, so this evaluates to **true** — the release APK
would ship with the WebView inspectable over adb (readable Supabase session cookies).
Make it fail-closed:
```ts
webContentsDebuggingEnabled: process.env.CAP_WEBVIEW_DEBUG === '1',
```
Debugging then requires an explicit `CAP_WEBVIEW_DEBUG=1 npx cap sync android`.

**2. You cannot smoke test until the web side is deployed.** `server.url` points at
`app.compliancemattersca.com` = production = main, and **main still has none of this code**
(verified: zero refs to `Capacitor` / `Geolocation` / `"unavailable"`). The device will load
the OLD component and reproduce the original bug. Point `server.url` at a branch preview
deployment, test, then revert `server.url` before merge.

### How to point `server.url` at a preview (Option A)
```ts
// capacitor.config.ts — TEMPORARY, revert before merge
server: {
  url: 'https://hvac-saas-git-lane7-xxxx.vercel.app',
  cleartext: false,
  androidScheme: 'https',
},
```
Then `npx cap sync android`, rebuild in Android Studio, test, **then revert `server.url` and
re-sync**. Do not let a preview URL reach main.

`network_security_config.xml` needs no change — it only pins cleartext rules for
`app.compliancemattersca.com`; HTTPS to any other domain still works.

**Gotcha:** auth is domain-scoped. Supabase login will fail on the preview domain unless that
URL is in the project's allowed redirect URLs, and Vercel previews often sit behind an SSO
wall the WebView will just render as a login page. If you can't sign in, you can't reach the
Today page. Budget for this being the real work.

### Option B (possibly less total work)
The TSX change is gated on `isNativePlatform()`, so on web it's a no-op **except** the new
`unavailable` / `denied` states — which are improvements for the browser too and are fully
testable in Chrome right now. Smoke test the web behavior in a browser, merge + deploy the web
side, and let the native build pick it up from production. Inverts the usual order (merge
before native smoke test), but sidesteps the preview-auth problem entirely. Owner's call.

**3. Then smoke test.** Grant → weather loads. Deny → "Location is off for this app" + retry.
Splash → compass visible (it may look undersized; `ic_launcher_foreground` already has ~33%
built-in padding and `splash_icon.xml` insets another 25%. If it's small, reduce the inset.)

## Open owner decisions
- **D1** — new `unavailable` / `denied` states are visible Today-page changes. Confirm copy.
- **D2** — `MainActivity`'s `WebChromeClient` override (on main) delegates only 3 methods;
  missing `onJsAlert`/`onJsConfirm`/`onJsPrompt`. Possible app-wide JS-dialog gap, and now
  redundant for native geolocation. Own lane, not this branch.

## Also
Main's `54ed6b33` retired Spine V4.0 for `PROJECT_TRUTH` / `CURRENT_ROADMAP`. The spine in
project knowledge is **stale** and will mislead future sessions. Re-sync it.
