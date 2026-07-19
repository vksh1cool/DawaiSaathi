# DawaiSaathi — User Stories & Acceptance Criteria (v2.0 — Current Architecture)

| | |
|---|---|
| **Status** | Authoritative for repair + completion work |
| **Date** | 2026-07-19 |
| **Supersedes** | `01-PRD.md` §6 (frozen MVP stories). Where this doc and the PRD conflict, this doc wins. |
| **Audience** | An AI coding agent (or human dev) fixing and completing the app as it exists **today** — not the hackathon MVP. |
| **Companion docs** | `06-FREE-DEMO-AUTH-BOUNDARY.md`, `07-GLOBAL-VOICE-LANGUAGES.md`, `08-CLOUDFLARE-PRODUCTION-ARCHITECTURE.md` |

---

## 0. How to use this document (coding agent: read first)

1. **Work epic-by-epic in priority order** (P0 → P1 → P2). Within an epic, stories are ordered by dependency.
2. Every story has numbered acceptance criteria (AC). Each AC is independently verifiable — do not mark a story done until every AC passes.
3. **Global Definition of Done** (applies to every story, in addition to its ACs):
   - `npx tsc --noEmit` passes.
   - `npm test` (Vitest) passes, including `tests/cloudflare-gateway.test.ts` and `tests/supabase-tenant-contract.test.ts`.
   - `npm run cf:check` (OpenNext build + `wrangler deploy --dry-run`) succeeds.
   - No hardcoded user-facing strings — every string goes through `src/lib/i18n/{en,hi,es}.json`, and **all three dictionaries are updated together** (a key missing from any dictionary is a failure).
4. **Medical-safety guardrails (non-negotiable, enforced structurally):**
   - The system never suggests starting/stopping a medicine, never changes a dose, never interprets symptoms, and has no free-text medical Q&A surface.
   - Every interaction finding and generic suggestion ends with a consult-your-pharmacist/doctor line (backend appends it if missing).
   - Severity inflation is blocked: a finding may be `major` only if its source is `curated` or it has a verbatim openFDA evidence quote. `llm_suspected` findings are always `unverified`.
   - The IVR never states *why* a medicine is taken (privacy on a possibly shared phone) — brand name + count only.
5. **Tenancy guardrail:** the Supabase cutover is **fail-closed** and governed by `src/lib/tenant-cutover.ts`. A path may move from the "pending" list to Supabase only together with a working RLS-scoped implementation (see Epic 10). Never let a missing Supabase config break the D1/local flow.

### Roles used below

| Role | Who |
|---|---|
| **Caregiver** | Adult with a smartphone who sets everything up (web app / Android TWA user) |
| **Patient** | Elder on any phone (often a feature phone); only ever receives calls; may be the same person as the caregiver |
| **Member** | A second caregiver invited into the household |
| **Operator** | Person running a demo or administering the deployment |
| **System** | Scheduled workers (reminder cron) and webhooks acting without a user |

### Current architecture snapshot (ground truth for all stories)

- Next.js App Router built with OpenNext, running as a **Cloudflare Worker**. Public origin `dawaisaathi.pages.dev` is a thin **Pages gateway** that proxies to the Worker.
- Data: **Cloudflare D1** (live, isolated runtime) + private **R2** (photos, generated audio). A **Supabase Postgres + Auth + RLS** migration exists behind cutover gates and is *not yet* the source of truth for health data.
- Reminders: a separate cron Worker (`wrangler.reminders.jsonc`) calls `POST /api/internal/reminders/run` every minute.
- Voice: Twilio Programmable Voice + SMS webhooks under `/api/twilio/*`; in-browser simulated call under `/api/simulate/*`; OpenAI TTS with a fail-closed daily budget (default 12 LLM extractions + 12 new TTS generations/day); Groq Llama-4-Scout vision extraction.
- Clients: responsive PWA (service worker + `offline.html`) wrapped by an **Android TWA** (asset links at `/.well-known/assetlinks.json`).

---

## Epic 0 — Platform boot & routing — **P0**

*If these fail, nothing else is testable. Start here when "the app doesn't work."*

**US-0.1 — Public origin serves the app.**
As a caregiver, I open `https://dawaisaathi.pages.dev` and get the app — never a Cloudflare error page.
- AC-0.1.1: The Pages gateway forwards any path + query + method to the OpenNext Worker and streams the response back unmodified (status, headers, body). No Error 1101/522/525.
- AC-0.1.2: Request headers needed downstream (cookies, `content-type`, Twilio signature headers) survive the proxy hop.
- AC-0.1.3: `tests/cloudflare-gateway.test.ts` covers the proxy contract and passes.
- AC-0.1.4: Hitting the Worker's own `workers.dev` URL directly still works (no gateway-only assumptions in the app).

**US-0.2 — Middleware lets infrastructure through and gates everything else.**
As the system, my webhooks and public assets are always reachable while human pages stay protected.
- AC-0.2.1: These paths bypass all auth/access gating: `/api/twilio/*`, `/api/internal/reminders/run`, `/api/audio/*`, `/api/feedback`, `/icons/*`, `/sw.js`, `/offline.html`, `/.well-known/assetlinks.json` (exact list lives in `src/middleware.ts` — keep code and this doc in sync).
- AC-0.2.2: `/unlock` and `/api/access/*` are reachable without a session; every other page redirects an ungated visitor to the gate (Epic 1).
- AC-0.2.3: Protected API routes return `401` JSON (never an HTML redirect) when called without credentials.

**US-0.3 — PWA installs and works offline; Android TWA opens full-screen.**
As a caregiver on Android, I install the app and it opens without browser chrome.
- AC-0.3.1: `public/manifest.webmanifest` is valid (name, icons incl. maskable, `start_url`, `display: standalone`, theme colors).
- AC-0.3.2: With the network cut, navigating to any page serves `offline.html` from the service worker instead of a browser error.
- AC-0.3.3: `/.well-known/assetlinks.json` serves the SHA-256 cert fingerprint from the deploy environment variable and matches the TWA signing cert (`npm run android:check` passes).

---

## Epic 1 — Access & identity — **P0**

**US-1.1 — Access gate (unlock code).**
As an operator, I protect the deployment with a shared unlock code so strangers can't reach a demo instance.
- AC-1.1.1: An ungated visitor to any protected page lands on `/unlock`; a correct code (`POST /api/access/unlock`) sets a cookie session and returns them to their original destination.
- AC-1.1.2: Wrong codes get a translated error and no cookie; the gate rate-limits or delays repeated failures.
- AC-1.1.3: `POST /api/access/logout` clears the gate session.
- AC-1.1.4: If no unlock code is configured, the gate is transparent (local dev keeps working with zero setup).

**US-1.2 — Sign in with email OTP (Supabase).**
As a caregiver, I sign in with my email and a one-time code — no password to forget.
- AC-1.2.1: `POST /api/auth/otp/request` sends a code to a valid email; invalid emails get a translated validation error.
- AC-1.2.2: `POST /api/auth/otp/verify` with the correct code creates a session; wrong/expired codes get a clear retryable error.
- AC-1.2.3: The email redirect flow (`/auth/callback`) returns to the correct public origin (gateway URL), not an internal `workers.dev` URL.
- AC-1.2.4: `POST /api/auth/logout` ends the session and returns to `/auth`.
- AC-1.2.5: **Fail-closed but not app-breaking:** with Supabase env vars absent, auth screens explain the feature is unavailable and every non-Supabase flow (scan, schedule, simulated call, worker) still works (per `06-FREE-DEMO-AUTH-BOUNDARY.md` §4).

**US-1.3 — Session security.**
- AC-1.3.1: A Supabase session is never treated as authorization for health-data routes that are still on the pending list in `src/lib/tenant-cutover.ts`.
- AC-1.3.2: Auth cookies are `HttpOnly`, `Secure`, `SameSite=Lax`.

---

## Epic 2 — Onboarding & household — **P0**

**US-2.1 — First-run onboarding.**
As a caregiver signing in for the first time, I set up my household in one short flow.
- AC-2.1.1: `/onboarding` collects: caregiver name, patient name, patient phone (validated E.164 with country picker), patient **call language** (any code in `CALL_LANGUAGE_CODES`, `src/lib/languages.ts`), and voice preference (female/male).
- AC-2.1.2: Submitting creates the household via `POST /api/household` and lands on the dashboard; refresh/back never creates a duplicate household.
- AC-2.1.3: A signed-in user with no household is always routed to `/onboarding`; a user with a household never sees it again.
- AC-2.1.4: Every step works in all three UI languages.

**US-2.2 — Edit household from Profile.**
- AC-2.2.1: `/profile` lets me change every onboarding field; saving updates future reminder calls (language/voice changes apply to the next call, not retroactively).
- AC-2.2.2: Changing patient phone re-validates E.164 and warns that Twilio trial accounts can only call verified numbers.

**US-2.3 — Invite a second caregiver.**
As a caregiver, I invite my sibling so we both see mom's medicines.
- AC-2.3.1: I can create an invitation and share its link; the invitee opens `/invite`, signs in (or up), and `POST /api/household/invitations/accept` joins them to the same household.
- AC-2.3.2: Expired/used/foreign invitation tokens show a translated error, never a crash or a silent join.
- AC-2.3.3: Both members see the same medications, schedules, and adherence data; neither can see any other household's data (verified by `tests/supabase-tenant-contract.test.ts`).

---

## Epic 3 — Scan & digitize — **P0**

**US-3.1 — Photograph strips, get an editable list.**
As a caregiver, I photograph all medicine strips (1–5 photos, multiple strips per photo) and get structured medicines.
- AC-3.1.1: `POST /api/scan` accepts 1–5 images (jpeg/png/webp/heic, each ≤10 MB) and returns extracted medications in ≤25 s for 5 strips; oversized/wrong-type files get a translated error naming the limit.
- AC-3.1.2: Extraction handles Indian strip conventions: composition lines ("Each film coated tablet contains: Telmisartan IP 40 mg"), MRP with ₹/"Rs.", expiry `MM/YYYY`, brand on front foil + composition on back. Combination brands expand to multiple salts (Telma-AM → telmisartan 40 + amlodipine 5).
- AC-3.1.3: The same medicine appearing in two photos (front + back) merges into one entry, keeping the higher-confidence value per field.
- AC-3.1.4: Each LLM attempt consumes one slot of the fail-closed daily budget; when exhausted, the UI says so plainly instead of failing generically.
- AC-3.1.5: Extraction progress is visible (per-photo state), and a failed photo can be retried without redoing the others.

**US-3.2 — Review, correct, confirm.**
As a caregiver, nothing becomes "active" until I've reviewed it.
- AC-3.2.1: On `/scan/review`, every extracted field is editable inline; salt rows are addable/removable; low-confidence fields are visually flagged for attention.
- AC-3.2.2: **Confirm medicines** persists them as `active` and automatically triggers the interactions run (Epic 4) and generics run (Epic 5).
- AC-3.2.3: Abandoning review persists nothing active.

**US-3.3 — Expiry warnings.**
- AC-3.3.1: Expired → red banner on the med card; expiring within 60 days → amber banner; both computed from extracted `expiryDate` vs. today, and encoded by icon + color + word (never color alone).

**US-3.4 — High-risk medicines.**
- AC-3.4.1: Any salt on the high-risk list (`data/highrisk_meds.csv` — warfarin, insulin, methotrexate, digoxin, lithium, …) shows a persistent caution banner that can be acknowledged per session but never dismissed.
- AC-3.4.2: Methotrexate scheduled daily triggers the fixed warning: "Methotrexate is usually taken WEEKLY, not daily — confirm the schedule with the doctor."

**US-3.5 — Photo privacy.**
- AC-3.5.1: Photos are stored in private R2 and served only through `/api/photos/[batchId]/[file]` to an authorized household member — an unauthenticated fetch of a known URL returns 401/404.
- AC-3.5.2: The caregiver can delete a photo batch from the UI; deletion removes the R2 objects.

---

## Epic 4 — Safety: drug interactions — **P0**

**US-4.1 — See interactions after confirming medicines.**
As a caregiver, I see every known interaction among the medicines, with severity, a plain-language explanation, and the evidence source.
- AC-4.1.1: `POST /api/interactions/run` completes in ≤20 s for ≤8 medications; results come from three layers with strict precedence: curated table (`data/curated_interactions.csv`, always wins, works offline) → openFDA label text (cached 7 days, with verbatim evidence quote) → LLM suspicion (always `unverified`, always "not verified — ask a pharmacist" wording).
- AC-4.1.2: Every finding shows: the two medicines (brand + salt), severity badge (`major`/`moderate`/`minor`/`unverified`), source (`curated`/`openfda`/`llm_suspected`), explanation ≤3 sentences at ~8th-grade level, and a "what to do" line that includes consulting a pharmacist/doctor.
- AC-4.1.3: Severity gating per the global guardrail (§0.4) is enforced in code, not just in the prompt.
- AC-4.1.4: Zero findings → explicit green "No known interactions found among N medicines" state, never a blank panel.
- AC-4.1.5: With openFDA unreachable, the run still completes from the curated layer and shows a "label data unavailable" notice.
- AC-4.1.6: Demo seed produces exactly one warfarin + aspirin → **major** (bleeding risk) finding from the curated source.

**US-4.2 — Acknowledge a finding.**
- AC-4.2.1: `POST /api/interactions/[id]/acknowledge` marks a finding "Discussed with doctor"; acknowledged findings persist across re-runs, while unacknowledged findings are replaced by each new run.

---

## Epic 5 — Generic savings (Jan Aushadhi) — **P1**

**US-5.1 — See per-medicine and total monthly savings.**
As a caregiver, I see exactly how much switching to Jan Aushadhi generics could save each month.
- AC-5.1.1: Matching uses normalized salt set + **exact** strength (fuzzy matching only on salt spelling, Levenshtein ≤2, never on strength) against `data/janaushadhi_products.csv`.
- AC-5.1.2: Monthly math (isolated and unit-tested in `src/lib/generics-math.ts`): (doses/day from confirmed schedule × 30) × per-unit price delta (MRP ÷ pack size vs. JA unit price). No schedule yet → use label frequency hint and flag the figure "est.".
- AC-5.1.3: Brand price preference: MRP from strip photo → `data/brand_prices.csv` → neither → show the JA price without a savings delta.
- AC-5.1.4: Every savings card carries the fixed caption "Same salt, same strength. Confirm the switch with your pharmacist." (with its Hindi/Spanish mirrors).
- AC-5.1.5: Demo seed totals ₹350–₹450/month.

---

## Epic 6 — Schedule & dose events — **P0**

**US-6.1 — Set dose times.**
As a caregiver, I set (or accept suggested) dose times per medicine: times per day + before/after/with food.
- AC-6.1.1: `POST /api/schedules/suggest` returns LLM-suggested times **always** presented as pre-filled editable chips — never auto-confirmed.
- AC-6.1.2: Times snap to 15-minute increments; default anchors Morning 08:00, Afternoon 14:00, Evening 20:00, Night 22:00.
- AC-6.1.3: Saving a schedule materializes upcoming `DoseEvent` rows idempotently — saving twice, or editing a time, never duplicates today's events.
- AC-6.1.4: All times are stored and computed in the household's timezone (default `DEFAULT_TZ`); a dose at 08:00 IST fires at 08:00 IST regardless of server timezone (unit-test the boundary in `src/lib/util/dates.ts`).

**US-6.2 — Dose state machine.**
- AC-6.2.1: `scheduled → calling → confirmed | missed | skipped` is the only legal path; illegal transitions are rejected server-side.
- AC-6.2.2: The caregiver can manually mark any of today's doses (`POST /api/dose-events/[id]/mark`, group variant `POST /api/dose-events/group/mark`) — e.g., "mom told me by phone."

**US-6.3 — Preview the call before enabling it.**
- AC-6.3.1: "Preview call" (`/api/tts/preview`) plays the exact TTS audio the IVR will use, in the patient's configured language and voice.

---

## Epic 7 — Reminder calls (IVR) — **P0**

**US-7.1 — The patient's phone rings at dose time.**
As a patient, my phone rings at dose time; a warm voice in my language tells me exactly which medicines to take; I press 1 after taking them.
- AC-7.1.1: The reminders cron Worker fires every 60 s against `POST /api/internal/reminders/run` (authenticated with a shared secret — an unauthenticated call is rejected); due doses get a call within 90 s of scheduled time.
- AC-7.1.2: Call script: greeting → medicine list (brand + count, e.g., "Telma 40 की एक गोली…") → "press 1 = taken / press 2 = repeat". The script **never** mentions the condition being treated.
- AC-7.1.3: DTMF 1 → dose `confirmed` + thank-you audio. DTMF 2 → script repeats once. No input → menu replays once, then the call ends without confirming.
- AC-7.1.4: Unanswered/unconfirmed → up to 2 retries at 10-minute intervals; after the final retry the dose becomes `missed` and a caregiver alert is created (Epic 8).
- AC-7.1.5: All `/api/twilio/*` webhooks validate the Twilio signature — an unsigned request is rejected before any state change.
- AC-7.1.6: **Language rule (from `07-GLOBAL-VOICE-LANGUAGES.md`):** a call language with a Twilio `<Say>` locale may use it; a language without one MUST use pre-generated audio (`<Play>`) — never a wrong-language fallback voice. Generated audio is cached by content hash and served from `/api/audio/[file]`.
- AC-7.1.7: A dashboard "Call now" button places (or simulates) the call immediately (`POST /api/calls/now`).

**US-7.2 — Simulated call (no Twilio needed).**
As an operator without Twilio, I demonstrate the full call flow in the browser.
- AC-7.2.1: `POST /api/simulate/start` + `/api/simulate/digits` drive the identical state machine as a real call — pressing 1 in the modal marks the dose `confirmed` exactly as DTMF would; timeouts mark `missed`.
- AC-7.2.2: With Twilio env vars absent, every call-related UI offers the simulated path instead of erroring.

**US-7.3 — Call log.**
- AC-7.3.1: `/api/calls` lists each attempt with timestamp, status (completed/no-answer/failed), duration, and which dose it covered; the history page renders it per day.

---

## Epic 8 — Today, adherence, history & alerts — **P1**

**US-8.1 — Today's timeline.**
As a caregiver, the dashboard shows today's doses as upcoming / calling / confirmed / missed, updating live.
- AC-8.1.1: `GET /api/today` groups doses by time slot; the dashboard polls (`PollLiveDoses`) so a dose confirmed by phone flips to green without a manual refresh, within one poll interval.
- AC-8.1.2: Empty states are explicit: no medicines yet → CTA to scan; medicines but no schedule → CTA to schedule.

**US-8.2 — Adherence.**
- AC-8.2.1: Adherence % = confirmed ÷ (confirmed + missed) over the trailing 7 days; `skipped` doses are excluded. The formula is unit-tested.
- AC-8.2.2: The bar renders correctly at 0%, 100%, and no-data (no divide-by-zero, no NaN).

**US-8.3 — History.**
- AC-8.3.1: `/history` shows past days' doses and call log entries per day, in the UI language, using household-timezone day boundaries.

**US-8.4 — Missed-dose alerts.**
- AC-8.4.1: A dose that exhausts retries creates exactly one alert (no duplicates per dose); `GET /api/alerts` lists unread first; `POST /api/alerts/[id]/read` marks read.

---

## Epic 9 — Language & accessibility — **P1**

**US-9.1 — UI language switching.**
As a caregiver, I switch the entire UI between the reviewed languages; the patient's calls stay in *their* configured language, independent of my UI choice.
- AC-9.1.1: UI languages are exactly `APP_LANGUAGE_CODES` (`en`, `hi`, `es`) — a language appears in the picker only when its dictionary is complete and reviewed.
- AC-9.1.2: Call language (any of `CALL_LANGUAGE_CODES`) is a separate setting from UI language, chosen per patient.
- AC-9.1.3: Switching UI language re-renders every visible string with none left in the previous language; the choice persists across sessions.

**US-9.2 — Elder-friendly defaults.**
- AC-9.2.1: Base font ≥16 px; all touch targets ≥48 px; severity always icon + color + word; visible keyboard focus states; passes an axe scan with no critical violations on dashboard, scan, and schedule pages.

---

## Epic 10 — Data, tenancy & privacy — **P0 (correctness)**

*The D1 → Supabase cutover is the most likely source of current breakage. These stories define "done" for it.*

**US-10.1 — Fail-closed cutover.**
As an operator, moving a surface to Supabase never silently breaks or leaks it.
- AC-10.1.1: `src/lib/tenant-cutover.ts` is the single source of truth. Paths on the staging lists (`/onboarding`, `/invite`, `/secure-setup`, `/api/household`) run on Supabase with RLS; paths on the pending lists (e.g., `/api/calls`, `/api/interactions/run`, `/api/simulate`, …) keep running on the current D1 adapters until they are explicitly migrated **together with** their `src/lib/supabase/*` implementation.
- AC-10.1.2: A route must never mix tenants: one request reads and writes exactly one backend.
- AC-10.1.3: `tests/supabase-tenant-contract.test.ts` proves cross-household denial for every migrated route (user A cannot read or mutate household B by ID guessing).
- AC-10.1.4: Removing a path from a pending list without a matching Supabase implementation fails a test — the contract test enumerates both lists.

**US-10.2 — Spend protection.**
- AC-10.2.1: Before any uncached LLM/TTS network request, the app atomically reserves a budget slot (default 12 LLM + 12 TTS per `DEFAULT_TZ` day); failures count, cached audio doesn't; exhaustion yields a clear translated message, and setting a cap to 0 blocks that class entirely.

**US-10.3 — Purge & retention.**
- AC-10.3.1: `npm run purge` and the UI deletion flows remove photos, generated audio, and health rows; nothing PHI-like is sent to analytics (there are none) or to Supabase for surfaces still on the pending lists.

---

## Epic 11 — Demo mode — **P2**

**US-11.1 — One-click demo.**
As an operator with `DEMO_MODE=true`, I seed the Kamla Devi household (`POST /api/demo/seed`: 5 medicines incl. warfarin + aspirin, schedules, prices) and use "Call now" + time-travel to run the 3-minute demo without touching real schedules.
- AC-11.1.1: Seeding is idempotent; with `DEMO_MODE` unset, `/api/demo/seed` returns 403/404.
- AC-11.1.2: The seeded state passes AC-4.1.6 (interaction) and AC-5.1.5 (savings) exactly.

---

## 12. Recommended repair order (bug-hunt checklist)

Run this smoke path top-to-bottom; the first step that fails is your P0 bug. Fix, verify, continue.

1. **Boot:** `npm run dev` locally, then `npm run cf:check`. App renders at `/` with no 500.
2. **Gateway:** deployed pages.dev URL serves the app (US-0.1); `npm test` gateway contract passes.
3. **Gate + auth:** `/unlock` flow (US-1.1), then email OTP sign-in (US-1.2), including the redirect landing on the public origin.
4. **Onboard:** create household (US-2.1); reload → dashboard, not onboarding again.
5. **Scan:** upload 1 strip photo → review → confirm (US-3.1/3.2) within budget caps.
6. **Safety + savings:** interactions run completes with correct severity gating (US-4.1); savings math matches `generics-math.ts` unit tests (US-5.1).
7. **Schedule:** accept suggested times, save, check DoseEvents materialize once, in IST (US-6.1).
8. **Call:** simulated call end-to-end — press 1, dashboard dose flips green live (US-7.2, US-8.1).
9. **Live call (optional):** verified number + Twilio trial → real DTMF confirm (US-7.1).
10. **Tenancy:** `tests/supabase-tenant-contract.test.ts` green; no pending-list route touching Supabase (US-10.1).
11. **Android:** `npm run android:check` (assetlinks) passes (US-0.3).

Known-risk areas from the current working tree (uncommitted changes touch these): the new `src/lib/supabase/*` adapters vs. the pending-path lists in `tenant-cutover.ts`, the Pages gateway proxy (`pages-gateway/`, recent Error 1101 fixes), `emailRedirectTo` handling in auth, and the i18n dictionaries (en/es/hi all modified — check key parity).
