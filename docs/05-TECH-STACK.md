# DawaiSaathi — Tech Stack Doc

| | |
|---|---|
| **Version** | 1.0 (frozen) |
| **Philosophy** | Boring, battle-tested tech · one language (TypeScript) · zero cloud infra for the demo · every choice optimizable later, none blocking now |
| **Companion docs** | `03-SYSTEM-ARCHITECTURE.md` (how these pieces connect), `04-DATA-FLOW-INTEGRATION.md` (runtime behavior) |

> **Builder note:** Install exactly these majors. Do not add libraries beyond this list without necessity (state managers, ORMs-on-top, UI kits are explicitly rejected below).

---

## 1. Stack summary

| Layer | Choice | Version (min) | Why | Rejected alternative & why |
|---|---|---|---|---|
| Language | TypeScript | 5.x strict | one language across UI/API/worker; agent-friendly | Python split-stack — two runtimes, two dep trees for no MVP gain |
| Framework | Next.js (App Router) | 15.x | UI + API routes + static serving in one process; route handlers host Twilio webhooks | Express+Vite — more wiring; Remix — fine, but Next is the safest well-trodden path |
| Runtime | Node.js | 20 LTS | required by Next 15; stable `fetch` | Bun — sharp/Prisma edge cases not worth it this week |
| DB | SQLite via **Prisma** | Prisma 6.x | zero-install, single file, perfect single-household fit; Prisma gives types + migrations + seed | Postgres — infra overhead; JSON files — no uniqueness constraints (DoseEvent idempotency needs them) |
| Styling | Tailwind CSS | 4.x | tokens from `02-DESIGN.md` §3 as CSS theme vars; fast iteration | UI kits (shadcn/MUI) — setup cost + fights the custom elder-first design |
| Icons | lucide-react | latest | fixed mapping in `02-DESIGN.md` §3.3 | — |
| Fonts | `next/font`: Inter + Noto Sans Devanagari | — | self-hosted, no FOUT, Hindi-correct | Google Fonts CDN — venue wifi risk |
| AI | **OpenAI API**: `OPENAI_MODEL=gpt-5.6` (vision + structured outputs), TTS `gpt-4o-mini-tts` | `openai` npm ≥6 | hackathon requirement (Codex + GPT-5.6); strict JSON schema kills parsing bugs; TTS handles Hindi | separate OCR (Tesseract) — blister foil defeats classical OCR; strip reading *is* the vision-model showcase |
| Drug data | openFDA REST (no SDK) | — | free, no-auth label text for evidence grounding | RxNav interaction API — **retired Jan 2024, do not use**; commercial DBs (Micromedex) — licensing |
| Generics data | bundled CSV snapshot (Jan Aushadhi product list) | — | no official API exists; snapshot is honest + offline-safe | live scraping — brittle + questionable during a demo |
| Telephony | **Twilio** Programmable Voice (trial) | `twilio` npm ≥5 | best docs, TwiML `<Play>/<Gather>`, works to Indian numbers from trial with verification | Exotel/Plivo — better India pricing but slower signup/KYC; right choice *post*-hackathon |
| Tunnel | ngrok | 3.x | Twilio webhooks + audio fetch to localhost | Cloudflare Tunnel — fine too; ngrok chosen for inspector UI (debug webhooks live) |
| Scheduling | hand-rolled 60 s tick (`tsx` worker) | — | one process, DB-driven, restart-safe (state in DoseEvent rows) | BullMQ/Redis — infra for nothing; node-cron — still needs the DB scan anyway |
| Dates | luxon | 3.x | sane named-zone handling (`Asia/Kolkata`) | date-fns-tz — verbose zone math |
| Validation | zod | 3.x | env, API bodies, LLM output parsing (Arch §8.1) | — |
| Images | sharp | latest | resize/compress before vision (cost + latency) | — |
| Fuzzy match | fastest-levenshtein | latest | salt-name tolerance ≤2 (Flow C) | fuse.js — overkill |
| Logging | pino + pino-pretty | latest | structured logs; phone redaction | — |
| Tests | vitest | 2.x | fast TS-native; suites in Arch §15 | jest — slower TS setup |
| CSV | papaparse | latest | robust quoted-field parsing for seed files | hand-rolled split — breaks on quoted commas in Hindi text |

**Explicitly not used:** Redux/Zustand (React state + SWR-style fetch hooks suffice), NextAuth (no auth in MVP, PRD NG4), Docker (single laptop demo), LangChain (direct SDK calls are simpler and debuggable).

## 2. package.json (target shape)

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "worker": "tsx worker/index.ts",
    "db:migrate": "prisma migrate dev",
    "seed": "prisma db seed",
    "demo:seed": "tsx scripts/demo-seed-cli.ts",   // hits POST /api/demo/seed
    "pregen-audio": "tsx scripts/pregen-audio.ts",
    "purge": "tsx scripts/purge.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": ["next@15", "react@19", "react-dom@19", "openai@^6", "twilio@^5",
    "@prisma/client@^6", "luxon@^3", "zod@^3", "sharp", "lucide-react",
    "fastest-levenshtein", "papaparse", "pino"],
  "devDependencies": ["prisma@^6", "typescript@^5", "tsx", "vitest@^2",
    "tailwindcss@^4", "@tailwindcss/postcss", "@types/luxon", "@types/papaparse", "pino-pretty"]
}
```

## 3. Local dev setup (from clean clone to running demo)

```bash
# 0) prerequisites: Node 20+, npm 10+, ngrok account (free), OpenAI key, Twilio trial account
git clone <repo> && cd <repo>
npm install
cp .env.example .env            # fill OPENAI_API_KEY (Twilio vars can wait until Day 4)
npx prisma migrate dev --name init
npm run seed                    # loads data/*.csv reference tables
npm run dev                     # terminal 1 → http://localhost:3000 (onboarding S0)
npm run worker                  # terminal 2 → tick loop (logs "telephony disabled" until Twilio env set)
```

Demo/telephony additions (Day 4):
```bash
ngrok http 3000                                    # terminal 3 → copy https URL
# .env: PUBLIC_BASE_URL=https://<id>.ngrok-free.app  + Twilio creds  → restart terminals 1 & 2
npm run pregen-audio                               # warm static IVR audio
DEMO_PATIENT_PHONE=+91XXXXXXXXXX npm run demo:seed # Kamla Devi household, meds, schedules
```

## 4. Third-party service setup

### 4.1 OpenAI
Create key at platform.openai.com → set `OPENAI_API_KEY`. Confirm org has access to `gpt-5.6` (else set `OPENAI_MODEL` to the best available vision+structured-outputs model — the code reads the env, never hardcodes). Budget alert at $25.

### 4.2 Twilio (trial — ~15 min, do this on Day 1 even though code needs it Day 4)
1. Sign up → verify your own mobile.
2. Console → get a trial phone number with **Voice** capability → `TWILIO_FROM_NUMBER`.
3. **Verified Caller IDs → add the demo patient phone** (presenter's second phone). Trial accounts can only call verified numbers — this is the #1 demo-day gotcha.
4. Copy Account SID + Auth Token → env.
5. Geo-permissions: enable India (+91) under Voice → Calling Geographic Permissions.
6. Accept: trial preamble ("You have a trial account…") plays before our audio — mention it on stage or upgrade with ~$20 to remove.

### 4.3 ngrok
`brew install ngrok` → authtoken → `ngrok http 3000`. Free-tier URL changes per restart ⇒ update `PUBLIC_BASE_URL` and restart both processes (Twilio signature validation depends on the exact URL, Arch §10.2). Optional hardening for the venue: `ngrok http 3000 --basic-auth "demo:password"` — but then Twilio can't fetch audio; instead use a reserved domain (paid) or accept the open tunnel for the demo window.

### 4.4 openFDA
Works keyless (≈1 000 req/day/IP). Optional free key → `OPENFDA_API_KEY` (120 k/day). Demo salts get cache-warmed by the seed, so venue-network flakiness is absorbed.

## 5. Cost estimate (build week, worst case)

| Item | Est. usage | Est. cost |
|---|---|---|
| GPT-5.6 vision+text (dev iterations ~300 scans/runs) | heavy prompting week | $10–18 |
| TTS (`gpt-4o-mini-tts`, ~500 short clips) | ~150 k chars | <$3 |
| Twilio | trial credit ($15) covers ~100+ IN calls | $0 (or $20 upgrade to drop preamble) |
| openFDA / Jan Aushadhi CSV / ngrok free | — | $0 |
| **Total** | | **≈ $15–40** |

## 6. Deployment posture
**Demo (frozen): run locally + ngrok.** Rationale: Twilio needs one public URL; localhost keeps health data local (a stated feature, PRD §10) and removes deploy risk minutes before judging.
**Post-hackathon path (documented, not built):** Railway/Render/Fly for the two processes (Vercel alone can't host the persistent worker), Postgres swap (Prisma provider change + enum migration), Redis+BullMQ if multi-instance, Exotel for India telephony pricing/compliance, real auth (household accounts), WhatsApp channel via Meta Cloud API.

## 7. Known constraints accepted for the week
1. Single worker instance — no locking (Arch §1). 2. ngrok URL rotation on restart. 3. Twilio trial preamble + verified-numbers-only. 4. JA/brand prices are curated snapshots. 5. No auth on the tunnel during demo window. Each has a scripted fallback (`04-DATA-FLOW-INTEGRATION.md` §12) — none can sink the demo.
