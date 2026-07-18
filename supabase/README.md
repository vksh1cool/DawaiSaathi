# Supabase migration

This directory is the production migration path from the current isolated D1 demo runtime to Supabase Postgres + Auth. It is deliberately staged: the live Worker remains on D1 until the migration is applied, RLS is tested, and synthetic end-to-end flows pass.

## What this migration provides

- **profiles**, **households**, an active-household preference, and immutable **household_members** authorization boundaries.
- Every health-record table has a `household_id`, composite foreign keys, indexes beginning with that tenant key, and Row Level Security.
- Atomic, one-time onboarding through **public.create_household_onboarding(...)**; every repeat request from the same Supabase account returns its original household without overwriting it or creating a duplicate.
- Owner-only, single-use caregiver invitations bound to one verified Supabase email **or** E.164 phone. The database stores only a SHA-256 token hash.
- Member reads, caregiver-managed writes, and system-owned reminder/call/SMS state have deliberately different RLS policies. There is no broad authenticated browser mutation policy.
- Unique materialized dose events and reminder-call idempotency keys, with normalized links between calls/alerts and dose events.
- Numeric money amounts, `timestamptz` for reminders, private R2 object keys, and no shared cache table for health data.

## Tenant model and shared Twilio sender

Each caregiver receives a separate account and isolated household data, but not a physically separate database. For an MVP, one Supabase Postgres project with `household_id` on every health record, composite foreign keys, and enforced Row Level Security is the safer and more maintainable form of per-user separation. A browser session can only read its own household; system workers use narrowly scoped service credentials for reminder work.

The first authenticated onboarding creates exactly one owner household and one initial patient. Any retry, double tap, reconnect, or stale form submission returns that original household unchanged. A caregiver added through an invite joins the invited household and cannot use first-time onboarding to make a parallel one.

One Twilio sender number may be shared across MVP users. That does not make their data shared: every call, consent record, SMS delivery, audit event, and reminder must be associated with one household and patient. A provider `STOP` is deliberately sender-scoped across households, because the same recipient must not receive another message from that sender through a second household. Keep caregiver sign-in OTP separate from medication reminders at the provider/configuration layer. The Supabase migration contains the tenant-scoped SMS delivery model and private provider suppression records, but `SUPABASE_TENANT_RUNTIME_READY` must remain `false` until dispatch, delivery callbacks, and STOP handling all use that model.

## First-time setup

1. Complete Supabase MCP OAuth in the agent/client that reads `.mcp.json`, then select or create the target project in the required data region.
2. In Supabase Auth, enable the chosen caregiver sign-in methods. The app supports email magic links by default. Phone OTP remains hidden unless `SUPABASE_PHONE_AUTH_ENABLED=true`; enable that flag only after Supabase Auth has regional SMS delivery, CAPTCHA/rate limits, recovery, and approved redirect URLs configured for a restricted staff/synthetic cohort.
3. Link the CLI to that project and apply the migration:

   ```bash
   npx supabase@latest link --project-ref YOUR_PROJECT_REF
   npx supabase@latest db push
   ```

4. Put `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and any service-role credential only in Worker secrets. Use `wrangler secret put`; do not add them to `wrangler.jsonc` or commit them.
5. Add https://dawaisaathi.pages.dev/auth/callback (and the staging equivalent) to Supabase Auth's redirect allow-list. If phone OTP uses Twilio, configure it inside **Supabase Auth**; do not reuse the reminder sender for authentication messages.
6. Start the local Supabase stack and run the real RLS regression suite:

   ~~~bash
   npx supabase start
   npx supabase migration up
   npx supabase test db
   ~~~

   The generated [tenant_isolation_test.sql](tests/tenant_isolation_test.sql) proves that household A cannot read or update household B, viewers cannot write patient data, and browser users cannot mutate reminder state.
7. Exercise the cross-household, duplicate delivery, timezone, deletion, backup/restore, and media-authorization rollout gates in [docs/08-CLOUDFLARE-PRODUCTION-ARCHITECTURE.md](../docs/08-CLOUDFLARE-PRODUCTION-ARCHITECTURE.md).
8. Only then add Hyperdrive/Worker database configuration and switch the application from D1 to the Supabase data adapter in a separately reviewed cutover.

The migration intentionally does **not** enable the feature flags in wrangler.jsonc. A database schema exists only after it has actually been applied to a real Supabase project.

## Runtime switches

- **AUTH_DRIVER=access_gate** is the current isolated demo mode.
- **AUTH_DRIVER=supabase** turns on caregiver authentication and safe, tenant-scoped onboarding/invitation acceptance.
- **SUPABASE_PHONE_AUTH_ENABLED=false** keeps the login page email-first and blocks phone OTP requests before Supabase is called. Set it to `true` only after Supabase Auth SMS delivery is configured for this project.
- **SUPABASE_TENANT_RUNTIME_READY=false** is a hard safety gate. While false, every medicine-data page/API is blocked rather than falling through to the legacy global D1 resolver.
- The legacy Prisma/D1 adapter also fails closed whenever **AUTH_DRIVER=supabase**. This protects against an accidental **SUPABASE_TENANT_RUNTIME_READY=true** flip while a route still has not been migrated.
- `src/lib/tenant-cutover.ts` keeps explicit pending route lists for workspace pages and health-data APIs. A route is not unlocked for Supabase users until its pending entry is removed with the matching RLS-scoped adapter.
- Set **SUPABASE_TENANT_RUNTIME_READY=true** only when every health-data route, reminder worker, webhook, private-media route, and RLS test is on the Supabase path.

This separation is intentional: identity can be tested with a staff cohort without exposing any household to the old shared demo data.
