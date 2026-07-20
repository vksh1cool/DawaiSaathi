<div align="center">
  <h1>💊 DawaiSaathi</h1>
  <p><b>Snap your meds once. Spoken dosing, interaction checks, and IVR reminders for any phone.</b></p>
  <p><i>Built for the OpenAI Build Week (Codex + GPT-5.6)</i></p>
  <p>
    <a href="https://dawaisaathi.pages.dev"><b>🌐 Try the private preview at dawaisaathi.pages.dev</b></a>
    ·
    <a href="https://github.com/vksh1cool/DawaiSaathi/releases"><b>📱 Android releases</b></a>
  </p>
</div>

---

## 💛 The Cause

Elderly patients commonly take 4–8 daily medications. Roughly 50% of patients with chronic diseases do not take medicines as prescribed (WHO estimate). Confusion about *which pill, when, and with/without food* causes hospitalizations that are largely preventable. Furthermore, dangerous interactions go unnoticed across multiple prescriptions, and people overpay for branded molecules because they don't know about generic equivalents like India's Jan Aushadhi program.

**Every existing solution assumes a smartphone-literate patient.** Pill-reminder apps require the patient to read English, install an app, and respond to push notifications. The highest-risk users (rural, elderly, low-literacy) are excluded.

**DawaiSaathi** ("Medicine Companion") splits the roles. The caregiver (e.g., an adult child) snaps photos of the medicine strips to set up the schedule. The patient receives an automated phone call in their own language at dose time and simply presses `1` to confirm. No app, no reading required.

## ✨ What it does

- 📸 **Scan & Extract**: Photograph up to 5 medicine strips at once. The AI extracts brand name, salt composition, form, MRP, expiry, and manufacturer in seconds.
- 🌐 **Caregiver UI languages**: Reviewed interface dictionaries are available in English, Hindi, and Spanish. The app only exposes a UI language after the full dictionary is checked in and tested.
- 🗣️ **Spoken Reminders (IVR)**: Places outbound voice calls using Twilio. Hindi and English remain first-class; Bengali, Arabic, French, Portuguese, Afrikaans, Amharic, Swahili, Hausa, Yoruba, and Spanish are available for call setup. Languages without a matching Twilio `<Say>` locale use generated audio rather than an unrelated fallback voice.
- 🚨 **Safety Checks**: Cross-references medications against openFDA label data to detect and clearly explain dangerous drug-drug interactions (e.g., Warfarin + Aspirin) without hallucinating.
- 💰 **Generic Savings**: Identifies identical generic medicines from India's Jan Aushadhi program and shows exactly how much money the patient could save each month.
- 📊 **Caregiver Dashboard**: A beautiful, accessible Next.js web app that tracks adherence, upcoming doses, and alerts the caregiver if a dose is missed.

---

## 🏗️ Deployment and data architecture

The clean public origin is **[dawaisaathi.pages.dev](https://dawaisaathi.pages.dev)**. A lightweight Cloudflare Pages gateway forwards requests privately to the OpenNext Worker, so the stable Pages URL and Worker-only bindings can coexist.

The live deployment currently uses the isolated D1/R2 preview runtime. The Supabase Postgres + Auth + RLS migration is present in this repository but deliberately **not claimed as live** until a Supabase project has been linked, the migration applied, and tenant/duplicate-delivery tests have passed. This is a safety gate for health information, not a cosmetic switch.

```mermaid
graph TD
    subgraph Data Ingestion
        C[Caregiver browser / Android TWA] --> P[Cloudflare Pages gateway<br/>dawaisaathi.pages.dev]
        P --> A[Next.js App Worker<br/>OpenNext on Cloudflare Workers]
        T[Twilio webhooks] --> A
    end

    subgraph AI & Verification
        A --> B[Groq API<br/>Llama-4-Scout Vision]
        A --> C2[OpenAI GPT-4o-mini-tts<br/>Voice Generation]
        A --> D[openFDA API<br/>Label Grounding]
    end

    subgraph State & Storage
        A --> E[(D1 — current isolated runtime)]
        A --> F[(Private Cloudflare R2<br/>photos + generated audio)]
        A --> I[(Dedicated R2 + Durable Object<br/>OpenNext incremental cache)]
    end

    subgraph Production data cutover (gated)
        A -. authenticated, RLS-scoped .-> S[(Supabase Postgres + Auth)]
        S -. tenant policies .-> H[Households / members / medication records]
    end
```

Read [the production architecture and rollout gates](docs/08-CLOUDFLARE-PRODUCTION-ARCHITECTURE.md) before inviting real households.

## 🚀 Getting Started

The easiest way to try DawaiSaathi is the live dashboard at **[dawaisaathi.pages.dev](https://dawaisaathi.pages.dev)**.

If you want to run it locally or deploy it yourself:

### Prerequisites
- **Node.js 22+**
- **Groq API Key**: For fast Llama-4-Scout Vision extraction and LLM routing.
- **OpenAI API Key**: For GPT-4o-mini-tts generation.
- **Twilio Account**: For live IVR phone calls (simulated calls work in the browser without Twilio).
- **Supabase Project**: Required only for the gated Postgres/Auth cutover described in [`supabase/README.md`](supabase/README.md).

### Running Locally
```bash
git clone https://github.com/vksh1cool/DawaiSaathi.git
cd DawaiSaathi
npm install

# Setup your .env file
cp .env.example .env
# Edit .env with your Groq, OpenAI, and (optionally) Twilio keys

# Initialise the local D1 database used by `next dev` through OpenNext
npm run d1:migrate:local

# Start the dev server
npm run dev

# In a separate terminal, run the local background worker for reminders
npm run worker
```
Head over to `http://localhost:3000` to access the dashboard.

With `DEMO_MODE=true`, you can optionally seed the local D1 demo after the app is running:

```bash
npm run demo:seed
```

`npm run db:push` is still useful for standalone Prisma/SQLite scripts, but it does not initialise the D1 binding that OpenNext uses during `next dev`.

### Deploying to Cloudflare

The production setup has two deployables on purpose: the OpenNext Worker holds the application and private bindings; the Pages project is a minimal gateway that owns the clean public URL.

1. Create the Worker bindings in [`wrangler.jsonc`](wrangler.jsonc): D1 (isolated runtime), private R2 media/cache buckets, and the OpenNext cache Durable Object.
2. Set secrets with `wrangler secret put` (AI keys, Twilio, access-gate secrets, and later Supabase credentials). Never commit them or add them to `vars`.
3. Deploy the application Worker: `npm run cf:deploy`.
4. Create a Pages project named `dawaisaathi`, then deploy [`pages-gateway`](pages-gateway): `npx wrangler pages deploy pages-gateway --project-name dawaisaathi`.
5. Onboard launchpixel.in in Cloudflare Email Sending (SPF/DKIM) and authorize feedback@launchpixel.in. The in-app feedback button sends appreciation or feature requests to contact@launchpixel.in; until this binding is live it fails closed rather than pretending an email was sent.
6. Verify https://dawaisaathi.pages.dev/api/app-info and a real, consented Twilio test call. The live build reports whether telephony is configured.

For the Supabase cutover, follow [`supabase/README.md`](supabase/README.md) first. Do not change the runtime database flag merely because credentials exist.

### Twilio trial-mode rule

For this proof of concept, one Twilio sender number may serve every household, while each household's consent and reminder records remain isolated. A Twilio trial account can only contact verified destination numbers: test only with explicit consent and verified recipients. Keep caregiver sign-in OTP delivery separate from medication-reminder traffic, send no medicine names or doses by SMS, and honor `STOP` across the shared sender before any future message is queued.

---

## 💬 Product feedback

The floating feedback button asks for one short thing to improve or one short thing the caregiver appreciated and why. It warns people not to include medicine names, prescriptions, phone numbers, or other health details. Messages are sent server-to-server to contact@launchpixel.in; no browser mailto link or email credential is exposed.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router) running on Cloudflare Workers (via OpenNext).
- **Language**: TypeScript (strict).
- **Current isolated data runtime**: SQLite locally / Cloudflare D1 in the deployed demo.
- **Production data target**: Supabase Postgres + Auth + RLS, with a migration and rollout gates in [`supabase/`](supabase/).
- **Storage**: Private Cloudflare R2 for photos and generated TTS audio; private routes use `no-store` rather than public object URLs.
- **Styling**: Tailwind CSS 4.x with a custom accessibility-first design system.
- **AI**: Groq API (`llama-4-scout` for structured extraction, `llama-3.3-70b` for logic), OpenAI API (`gpt-4o-mini-tts` for voice).
- **Telephony**: Twilio Programmable Voice (TwiML).
- **Android**: Trusted Web Activity generated with Bubblewrap; no production `server.url` WebView wrapper.

---

## 📈 Scaling and production hardening

**Scales natively, no extra infrastructure:**
- **Compute** — the Next.js app runs stateless on Cloudflare Workers (via OpenNext), so it scales per-request across the edge with no app-server to size. Holds no in-process user state.
- **Data** — the production target is Supabase Postgres (pooled) with row-level security per household; the current demo runtime is serverless Cloudflare D1. Both scale horizontally with tenant count.
- **Storage** — private Cloudflare R2 for photos and generated audio; TTS clips are content-addressed and cached, so repeat scripts never re-bill.
- **Reminders** — a separate Cloudflare cron Worker with a Durable Object queue ([`wrangler.reminders.jsonc`](wrangler.reminders.jsonc)) runs the outbound-call loop independently of web traffic.

**Before high-traffic production, add two things:**
1. **Raise / scope the AI budget.** `OPENAI_DAILY_LLM_REQUEST_LIMIT` and `OPENAI_DAILY_TTS_GENERATION_LIMIT` (default `12`) are a *global daily* demo safety cap stored in the DB. Raise them for real usage and make them per-tenant so one household cannot exhaust the shared budget.
2. **Add per-request rate limiting.** Cost-incurring endpoints (`/api/scan`, `/api/tts/*`, auth OTP) currently have no per-IP/per-user throttle. Options, cheapest first:
   - **Cloudflare WAF Rate Limiting Rules** — dashboard-configured, zero code or keys; the recommended baseline for IP-level abuse protection.
   - **Durable Object limiter** — precise per-user limits in code; DOs are already part of this deployment.
   - **[Upstash](https://upstash.com) Redis + `@upstash/ratelimit`** — fastest to wire into the app layer and portable off Cloudflare; needs `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Its free tier (10k commands/day) covers early production. Choose this if you want app-controlled, per-identity limits without WAF configuration.

---

## 📱 Android APK and GitHub Releases

The Android app is versioned from [`android/twa-manifest.json`](android/twa-manifest.json) and opens the same production origin, `https://dawaisaathi.pages.dev`. The release workflow produces both a signed APK and an Android App Bundle (AAB), attaches SHA-256 checksums, and creates a GitHub Release for each `vX.Y.Z` tag.

Before the first release, configure these once:

1. Generate one long-lived Android signing keystore. Keep it secure; every future update must use the same key.
2. Put its SHA-256 certificate fingerprint in the Worker as `ANDROID_APP_CERT_SHA256`, deploy, and confirm `/.well-known/assetlinks.json` returns the package `com.vksh1cool.dawaisaathi` and that fingerprint.
3. Add repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.
4. Add the same public SHA-256 fingerprint as the repository variable `ANDROID_APP_CERT_SHA256`.
5. Push a tag such as `v1.0.0`:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

The workflow fails closed if signing material or the live Android trust relationship is absent, so it never publishes an unsigned or unverified release. See [`android/README.md`](android/README.md) for local regeneration and build details.

---

## 🎯 The Demo

DawaiSaathi includes a built-in demo persona: **Kamla Devi**.
To experience the app as a caregiver setting up medicines for an elderly patient:
1. The UI will guide you through scanning a demo medicine strip, checking interactions, and initiating a simulated phone call.
2. You can hear exactly what Kamla Devi hears in Hindi and confirm the dose by pressing 1.

---

## 🗺️ Roadmap

| Feature | Why it matters |
|---------|----------------|
| **WhatsApp Bot Integration** | Send text-based alerts to the caregiver if a dose is missed, without requiring them to check the dashboard. |
| **Regional Language Expansion** | Expand beyond the current multilingual call setup with reviewed scripts, supported TTS, and regional delivery tests. |
| **Supabase tenant rollout** | Apply and test phone/email caregiver auth, household RLS, invitations, and the full data-adapter migration before real household data is accepted. |
| **Android APK (TWA)** | Signed release pipeline is ready; configure the release key and publish the first verified `vX.Y.Z` artifact. |
| **Pharmacy Ordering** | Direct integration to re-order medicines when a strip is running low. |
| **Household switching** | Safely expose multi-household switching after medicine, reminder, media, and webhook routes are tenant-scoped. |

*Have an idea to improve DawaiSaathi? Open an issue or submit a pull request!*
