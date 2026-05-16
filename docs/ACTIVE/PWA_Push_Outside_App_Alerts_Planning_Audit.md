# Compliance Matters Software — Pass 2D PWA Push / Outside-App Alerts Planning Audit

**Status:** planning only; no push delivery activated  
**Date:** 2026-05-15  
**Scope:** outside-app alerts for internal job assignment and internal-note mention notifications, with PWA/device push as the first candidate channel.

## Current Repo Findings

### PWA / Installability
- `app/manifest.ts` exists and defines `name`, `short_name`, `id`, `start_url`, `scope`, `display: "standalone"`, theme/background colors, categories, and app icons.
- `app/layout.tsx` exports app metadata with `manifest: "/manifest.webmanifest"` and `appleWebApp.capable = true`.
- `public/` includes app icons (`icon.png`, `icon-192.png`, `apple-icon.png` equivalent is referenced in manifest but the file present is `icon.png` / `icon-192.png`; verify `apple-icon.png` before production PWA push work).
- No service worker was found in `public/`, `app/`, `components/`, or `lib/`.
- No Push API client code was found (`PushManager`, `pushManager`, `navigator.serviceWorker`, `Notification.requestPermission`, service-worker push handlers).
- No server push sender dependency was found (`web-push`, FCM, OneSignal, VAPID).
- Current posture is installability-oriented PWA metadata, not push-capable PWA behavior.

### Current Notification Truth
- `notifications` is the in-app notification table and already carries:
  - `job_id`
  - `account_owner_user_id`
  - `recipient_type`
  - `recipient_ref`
  - `channel`
  - `notification_type`
  - `subject`
  - `body`
  - `payload`
  - `status`
  - `read_at`
  - `created_at`
- Account-owner scoping and internal access hardening are already present via migrations:
  - `20260327_notifications_read_state.sql`
  - `202604021030_notifications_rls_internal_scope.sql`
  - `20260419143000_notifications_account_owner_scope.sql`
  - `20260419153000_notifications_internal_write_contract.sql`
- `insertTargetedInternalNotification()` writes recipient-scoped internal `channel: "in_app"` rows.
- Job assignment alerts use `notification_type: "internal_job_assigned"` and are created after actual assignment insert.
- Internal note tagging alerts use `notification_type: "internal_note_tag"` after same-account active internal-user validation.
- Notification failures for mentions are already best-effort and do not block note save. Assignment alert delivery should preserve this non-blocking posture for future push.
- `/ops/notifications` already routes job-aware notification types to the relevant job:
  - `internal_note_tag` -> `/jobs/:id?tab=ops#internal-notes`
  - `internal_job_assigned` -> `/jobs/:id?tab=ops`

## Missing Foundation

PWA push is not ready to send. The missing foundation is:

- A service worker at a root-served path such as `public/sw.js`.
- Client registration code for the service worker.
- Explicit, user-initiated notification permission UX.
- Push subscription capture/update/delete helpers.
- A durable push subscription table.
- Server-side Web Push sender library and VAPID key configuration.
- Delivery attempt audit tied back to existing in-app notifications.
- Feature flag and operational kill switch.
- Safe production runbook for env setup, rollback, and device smoke.

## Recommended Schema

Additive tables are recommended. Do not repurpose `notifications` rows as device subscriptions.

### `push_subscriptions`

Purpose: one row per user/device/browser subscription.

Recommended columns:
- `id uuid primary key default gen_random_uuid()`
- `account_owner_user_id uuid not null references auth.users(id)`
- `user_id uuid not null references auth.users(id)`
- `endpoint text not null`
- `p256dh text not null`
- `auth text not null`
- `user_agent text null`
- `device_label text null`
- `permission_state text not null default 'granted'`
- `is_active boolean not null default true`
- `last_seen_at timestamptz null`
- `last_success_at timestamptz null`
- `last_failure_at timestamptz null`
- `last_failure_code text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Recommended constraints/indexes:
- unique active endpoint, or unique `(user_id, endpoint)` depending on desired historical retention
- index `(account_owner_user_id, user_id, is_active)`
- RLS: internal users can only select/write their own subscription rows inside their account; server/service role may deliver to same-account rows.

### `notification_delivery_attempts`

Purpose: auditable best-effort channel attempts attached to an existing notification event.

Recommended columns:
- `id uuid primary key default gen_random_uuid()`
- `notification_id uuid not null references notifications(id) on delete cascade`
- `account_owner_user_id uuid not null references auth.users(id)`
- `recipient_user_id uuid not null references auth.users(id)`
- `push_subscription_id uuid null references push_subscriptions(id) on delete set null`
- `channel text not null default 'web_push'`
- `status text not null` (`queued`, `sent`, `failed`, `skipped`)
- `attempted_at timestamptz not null default now()`
- `provider_status_code integer null`
- `error_code text null`
- `error_detail text null`

This keeps the in-app row as truth and models device push as a secondary delivery channel.

## Env Vars / Secrets

Recommended future env vars:
- `ENABLE_WEB_PUSH=false` — feature gate; default off.
- `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY` — VAPID public key for client subscription.
- `WEB_PUSH_PRIVATE_KEY` — VAPID private key for server send only.
- `WEB_PUSH_SUBJECT` — contact URI/mailto required by Web Push libraries.

Secrets must not be exposed through client bundles except for the public VAPID key.

## Service Worker Placement

Use `public/sw.js` so it is served at `/sw.js` and can control the app scope cleanly. The initial worker should stay narrow:

- handle `push`
- call `self.registration.showNotification()`
- attach safe `data.url` to notifications
- handle `notificationclick`
- focus an existing client or open the relevant job URL

Do not add broad offline caching in this pass; push support does not require a cache strategy rewrite.

## Safe Permission UX

Do not prompt on first login.

Recommended first UX location:
- `/ops/notifications` as an explicit card/button: “Enable device notifications”.

Secondary future location:
- account/user settings for device list, revoke/resync, and troubleshooting.

Avoid admin/team setup as the primary permission location because browser notification permission is per user/device/browser and requires the actual device/browser context.

Permission-state behavior:
- `default`: show an opt-in button and explain that device notifications are optional.
- `granted`: register/update subscription; show enabled state and last sync.
- `denied`: do not reprompt; show instructions to re-enable in browser/OS settings.
- expired/changed subscription: client should resync on next notifications/settings visit; server should mark expired endpoints inactive on provider 404/410-style failures.

## Notification Content Rules

Lock-screen copy should be intentionally sparse:

- Assignment: “You were assigned to a job”
- Mention: “You were mentioned in an internal note”
- Body: “Open Compliance Matters to view details”

Do not include internal-note text, customer phone/email, address details, contractor notes, or permit details in push payloads. The tap target can include the safe app URL:

- assignment: `/jobs/:id?tab=ops`
- mention: `/jobs/:id?tab=ops#internal-notes`

## Browser / Device Support Risks

- Push requires secure context, compatible browser support, notification permission, and an active subscription.
- Traditional Web Push requires a service worker and Push API subscription.
- iOS/iPadOS support is available for Home Screen web apps starting with iOS/iPadOS 16.4, not for ordinary Safari tab usage in the same way.
- iOS users must add the app to the Home Screen and open that installed web app context before push permission/subscription UX is reliable.
- Android Chrome/Edge PWA behavior is generally the least risky path.
- Desktop Chrome/Edge/Safari can work, but OS-level notification settings can suppress delivery.
- Browser/OS focus modes, permission revocation, private browsing, profile changes, app reinstall, browser data clearing, and endpoint expiration can all invalidate delivery.
- Push delivery must be treated as best-effort. In-app notifications remain authoritative.

## Implementation Slices

### 2D-A: Architecture/design doc only
- This audit document.
- No code, schema, service worker, or sender activation.

### 2D-B: Push subscription schema + helpers, no sending
- Add `push_subscriptions`.
- Add RLS and scoped helper tests.
- Add read/write helpers to upsert/deactivate current user subscriptions.
- No service worker prompt and no push delivery.

### 2D-C: User-facing enable UI, no automatic prompting
- Add explicit opt-in card on `/ops/notifications`.
- Register `/sw.js`.
- Request permission only after button click.
- Save/update subscription.
- Add disabled/denied/unsupported states.
- No server send.

### 2D-D: Server-side push delivery, feature-gated
- Add `web-push` dependency.
- Add VAPID env vars.
- Create `notification_delivery_attempts`.
- Add a feature-gated dispatcher that sends safe push copy for existing `internal_job_assigned` and `internal_note_tag` rows.
- Dispatch must be best-effort and must not block assignment, note save, or in-app notification creation.

### 2D-E: Production readiness / env / rollback / smoke checklist
- Confirm icons/manifest/installability on target devices.
- Generate and store VAPID keys.
- Verify iPhone Home Screen PWA, Android Chrome, and desktop Chrome/Edge.
- Verify denied permission, revoked permission, expired endpoint, and feature flag off.
- Rollback: disable `ENABLE_WEB_PUSH`, leave in-app notifications unaffected.

## Recommended Next Slice

Build **2D-B** next: schema + scoped helpers only, no service worker prompt and no sending. This is the smallest durable slice that lowers implementation risk without activating outside-app notifications.

## Parked

SMS and email fallback should remain parked. The current owner request is device/PWA push planning first, and fallback channels add consent, compliance, sender identity, deliverability, and billing concerns that are intentionally outside this pass.

## Closeout Confirmation

- No service worker was added.
- No push sender was added.
- No env vars were activated.
- No schema or migration was created in this pass.
- No SMS, email fallback, Twilio, or production push behavior was enabled.
- Phone/device alerts are planned only; they are not implemented.
