# DawaiSaathi — Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | DawaiSaathi ("Medicine Companion") |
| **Version** | 1.0 (Build Week MVP) |
| **Date** | 2026-07-14 |
| **Status** | Frozen for implementation |
| **Track** | Apps for your life (OpenAI Build Week, Codex + GPT‑5.6) |
| **Companion docs** | `02-DESIGN.md`, `03-SYSTEM-ARCHITECTURE.md`, `04-DATA-FLOW-INTEGRATION.md`, `05-TECH-STACK.md` |

> **Builder note (read first):** This PRD is written to be implemented directly by an AI coding agent. Every decision that could be ambiguous has been made and frozen. Do not invent features not listed here. Where a value is marked *(default)*, hardcode that default behind a config constant. The only intentionally open items are in §16.

---

## 1. One-liner

**Snap your meds once — DawaiSaathi tells your grandma what to take, when, in her own language.**

One photograph of all medicine strips → a spoken dosing schedule in the patient's language, drug‑interaction safety checks grounded in openFDA label data, cheaper generic equivalents from India's Jan Aushadhi program, and reminder **voice calls** (IVR) that work on any phone, including feature phones.

## 2. Problem statement

1. **Polypharmacy confusion.** Elderly patients commonly take 4–8 daily medications. Roughly 50% of patients with chronic disease do not take medicines as prescribed (WHO adherence estimate). Confusion about *which pill, when, with/without food* causes hospitalizations that are largely preventable.
2. **Dangerous interactions go unnoticed.** Prescriptions accumulate across multiple doctors (cardiologist + GP + orthopedic), and nobody holds the full list. Common, well-documented interactions (e.g., **warfarin + aspirin**) slip through.
3. **People overpay for identical molecules.** India's Jan Aushadhi program sells certified generics at 50–90% below brand MRP, but discovery is nearly zero — patients don't know the salt behind their brand.
4. **Every existing solution assumes a smartphone-literate patient.** Pill-reminder apps require the *patient* to read English, install an app, and respond to push notifications. The highest-risk users (rural, elderly, low-literacy) are exactly the ones excluded.

*Stats note for slides: WHO (2017) estimates ~1 in 10 medical products in low/middle-income countries is substandard or falsified; WHO (2003) estimates ~50% chronic-disease adherence. Mark figures "approx." on slides.*

## 3. Core product insight (this shapes everything)

**Split the two roles.** The person who *sets up* the system is not the person who *takes* the medicines.

- **Caregiver** (smartphone, some app-language literacy — typically the adult child): photographs the strips, reviews extraction, confirms the schedule, sees alerts and savings. Uses the **web app**.
- **Patient** (any phone, possibly a feature phone; possibly low literacy): receives **outbound voice calls** in their language at dose time and presses **1** after taking the medicine. Never needs the app, never needs to read.

This resolves "how does a grandmother use an AI app": she doesn't. Her phone rings.

## 4. Goals & non-goals

### Goals (MVP must achieve)
- G1. From ≤5 strip photos, produce a structured, caregiver-verified medication list in ≤3 minutes.
- G2. Detect and clearly explain known drug–drug interactions among the patient's medications, grounded in curated data + openFDA label text, never fabricated.
- G3. Show per-medicine and total monthly savings from Jan Aushadhi generic equivalents.
- G4. Place real IVR reminder calls (Twilio) in Hindi or English with DTMF "1 = taken" confirmation, plus an in-browser **simulated call** fallback for the stage demo.
- G5. Track adherence (taken / missed) and surface it to the caregiver.
- G6. Whole system demoable end-to-end on one laptop + ngrok + one verified phone.

### Non-goals (explicitly out of scope for MVP)
- NG1. Diagnosis, dose recommendations, or prescribing of any kind. The app never says "take X" for a medicine not already prescribed; it only organizes what exists.
- NG2. Counterfeit verification via authentication codes/QR (real anti-counterfeit needs manufacturer integrations). MVP does: expiry-date detection + "expired / expiring soon" warnings only.
- NG3. Native mobile apps, WhatsApp bot, SMS flows (stretch, post-hackathon).
- NG4. Multi-household auth/accounts. MVP is single-household, no login (see §10 Privacy).
- NG5. Pharmacy ordering/delivery integration.
- NG6. Languages beyond **Hindi + English** (architecture must keep language as data, not code, so adding Bhojpuri/Tamil later is config).

## 5. Personas

### P1 — Priya (Caregiver, primary app user)
34, product manager in Bengaluru. Her mother lives in Varanasi. Visits every 2–3 months; manages mom's health over phone calls. Smartphone power user. Anxiety: "Is mummy actually taking her BP medicines? Are her 6 medicines safe together?"

### P2 — Kamla Devi (Patient, primary beneficiary)
72, Varanasi. Speaks Hindi/Bhojpuri; reads Hindi slowly, no English. Uses a feature phone for calls only. Takes 5 medicines (hypertension, diabetes, cardiac). Currently keeps strips in a steel dabba; identifies pills by color; sometimes doubles a dose after forgetting whether she took it.

### P3 — Ramesh (Secondary: semi-urban self-caregiver)
58, shop owner, Kanpur. Android phone, uses WhatsApp and YouTube. Manages his own diabetes meds. Uses the web app directly for himself (patient = caregiver). MVP must not block this: a household can set patient phone = caregiver phone.

## 6. User stories & acceptance criteria

> IDs are referenced by other docs and by tests. AC = acceptance criteria, each independently testable.

### Epic A — Scan & digitize
- **US-1** As a caregiver, I photograph all medicine strips (1–5 photos, multiple strips per photo allowed) and get an editable list of medicines.
  - AC-1.1: POST of 1–5 images (each ≤10 MB, jpeg/png/webp/heic) returns extracted medications in ≤25 s for 5 strips.
  - AC-1.2: Each extracted medicine has: brand name, salt composition (INN + strength), form, MRP (if printed), expiry (if printed), batch no (if printed), manufacturer (if printed), per-field confidence 0–1.
  - AC-1.3: Fields with confidence < 0.7 are visually flagged for review (see `02-DESIGN.md` §S4).
  - AC-1.4: On the frozen demo kit (§13), ≥4/5 brand names and 5/5 salt compositions are correct after at most 2 manual edits.
- **US-2** As a caregiver, I can correct any extracted field before saving. Nothing is persisted as "active" until I press **Confirm medicines**.
  - AC-2.1: All fields editable inline; salt rows addable/removable.
  - AC-2.2: Confirm persists medications with status `active` and triggers interaction + generics runs.
- **US-3** As a caregiver, I'm warned if a strip is expired or expires within 60 days.
  - AC-3.1: Expired → red banner on the med card; expiring ≤60 days → amber banner. Both computed from extracted `expiryDate` vs today.

### Epic B — Safety (interactions)
- **US-4** As a caregiver, after confirming medicines I see any interactions between them, with severity, a plain-language explanation (English + Hindi), and the evidence source.
  - AC-4.1: Interaction run completes ≤20 s for ≤8 medications.
  - AC-4.2: Every finding shows: the two medicines (brand + salt), severity badge (`major`/`moderate`/`minor`/`unverified`), source (`curated` / `openfda` / `llm_suspected`), explanation ≤3 sentences at ~8th-grade level, and a "what to do" line that always includes consulting a pharmacist/doctor.
  - AC-4.3: A finding with source `openfda` MUST include a verbatim evidence quote from label text. A finding may be `major` only if source is `curated` or has an openFDA evidence quote. `llm_suspected` findings are always severity `unverified`.
  - AC-4.4: Demo kit produces exactly the **warfarin + aspirin → major** finding from the curated table.
  - AC-4.5: Zero findings → explicit green "No known interactions found among these N medicines" state (never blank).
- **US-5** As a caregiver, I can acknowledge a finding ("Discussed with doctor") which moves it to a collapsed "acknowledged" section without deleting it.

### Epic C — Savings (generics)
- **US-6** As a caregiver, I see for each medicine whether a Jan Aushadhi equivalent exists, its price vs the brand MRP, and the household's total monthly savings.
  - AC-6.1: Match requires same salt(s) + same strength; same form → confidence `high`; strength match with different pack form-factor → `medium`; salt-only → `low` and **excluded** from the savings total.
  - AC-6.2: Monthly cost uses the confirmed schedule (doses/day × 30) and per-unit price (MRP ÷ pack size). No schedule yet → assume label frequency hint, flagged "est.".
  - AC-6.3: Demo kit total savings computes to **₹350–₹450/month** with seed data (§13).
  - AC-6.4: Every savings card carries the fixed caption: "Same salt, same strength. Confirm the switch with your pharmacist." (Hindi mirror in `02-DESIGN.md` §8.)

### Epic D — Schedule & voice
- **US-7** As a caregiver, I set (or accept suggested) dose times per medicine: times of day + before/after/with food.
  - AC-7.1: Suggestions come from the LLM regimen hint but are **always** presented as pre-filled editable chips, never auto-confirmed.
  - AC-7.2: Times snap to 15-minute increments; default anchors: Morning 08:00, Afternoon 14:00, Evening 20:00, Night 22:00 *(defaults)*.
- **US-8** As a caregiver, I can preview the patient's reminder call audio in the app before enabling calls.
  - AC-8.1: "Preview call" plays the exact TTS mp3 that the IVR will play, in the patient's configured language.

### Epic E — Reminder calls (IVR)
- **US-9** As a patient, my phone rings at dose time; a warm Hindi voice tells me exactly which medicines to take and how; I press 1 after taking them.
  - AC-9.1: Call is placed within 90 s of scheduled time (worker tick 60 s + grace).
  - AC-9.2: Call script follows `02-DESIGN.md` §7 verbatim: greeting → med list ("Telma 40 की एक गोली…") → "press 1 taken / press 2 repeat".
  - AC-9.3: DTMF 1 → dose marked `confirmed`, thank-you audio plays. DTMF 2 → script repeats once. No input → replay menu once, then polite goodbye.
  - AC-9.4: No answer / busy / failed → retry up to 2 more times at 10-minute intervals *(defaults)*. After final failure, dose marked `missed` and caregiver alert row created.
- **US-10** As a demo presenter, I can trigger any dose's call immediately ("Call now") and, if telephony fails, run a **simulated call** in the browser that plays the same audio and accepts on-screen 1/2 keys.
  - AC-10.1: Simulated call exercises the same state transitions as a real call (marks confirmed/missed identically).

### Epic F — Adherence & alerts
- **US-11** As a caregiver, I see today's dose timeline (upcoming / confirmed / missed) and a 7-day adherence percentage.
  - AC-11.1: Adherence % = confirmed ÷ (confirmed + missed) over the window; skipped doses excluded.
- **US-12** As a caregiver, I see an alert entry when a dose was missed after all retries.

### Epic G — Language & accessibility
- **US-13** As a caregiver, I can switch the entire UI among reviewed app languages; as a patient, my calls come in my configured language independent of the caregiver's UI language.
  - AC-13.1: All UI strings come from `src/lib/i18n/{en,hi}.json`; no hardcoded user-facing strings in components.
- **US-14** Elder-friendly visual defaults: base font ≥16 px, all touch targets ≥48 px, severity always encoded by icon + color + word (never color alone).

## 7. Functional requirements (behavioral detail)

### F1. Strip scanning & extraction
- Input: 1–5 photos; each may contain multiple strips/bottles; front and/or back.
- Pipeline: resize to max 1600 px long edge → GPT‑5.6 vision with strict JSON schema (`03-SYSTEM-ARCHITECTURE.md` §8.2) → per-photo results merged → dedupe by (brandName, strength).
- Indian strip conventions the prompt must handle: composition line "Each film coated tablet contains: Telmisartan IP 40 mg"; MRP with ₹ or "Rs."; expiry as "EXP. 08/2027" (MM/YYYY); brand on front foil, composition often on back/side.
- If the same medicine appears in two photos (front + back), merge fields, keeping the higher-confidence value per field.
- Bottles/syrups: extract same fields; form = `syrup`/`drops`; strength may be per-5ml.
- Hard rule: extraction NEVER invents a value. Unreadable → `null` + warning string.

### F2. Normalization
- Map brand + composition to canonical salts: lowercase INN names, strength in mg (mcg→mg conversion: keep unit field, do not lossily convert IU).
- Combination drugs expand to multiple salts on one medication (e.g., Telma-AM → telmisartan 40 + amlodipine 5).
- Tag `highRisk: true` if any salt ∈ high-risk list (`data/highrisk_meds.csv`: warfarin, insulin*, methotrexate, digoxin, lithium, amiodarone, phenytoin, carbamazepine, glimepiride, glibenclamide, tramadol). High-risk meds get a persistent caution banner; **methotrexate** additionally triggers the fixed warning "Methotrexate is usually taken WEEKLY, not daily — confirm the schedule with the doctor" whenever its schedule is set to daily.

### F3. Interaction checking (three layers, strict precedence)
1. **Curated table** (`data/curated_interactions.csv`) — deterministic, always wins, works offline.
2. **openFDA labels** — fetch `drug_interactions`, `boxed_warning`, `warnings`, `contraindications` per salt (cached 7 days); LLM matches label text against the patient's other salts and must quote evidence.
3. **LLM suspicion** — allowed only as `unverified` severity with mandatory "not verified — ask your pharmacist" wording.
- Pairs are unordered, computed across expanded salts of all `active` medications for the patient. Re-running replaces unacknowledged findings; acknowledged findings persist.

### F4. Generic matching (Jan Aushadhi)
- Data source: bundled snapshot `data/janaushadhi_products.csv` (no official API exists; snapshot curated from the public PMBI product list; ~40 rows for MVP, expandable).
- Match key: normalized salt set + strength (exact) [+ form]. Fuzzy matching only on salt-name spelling (Levenshtein ≤2 via library), never on strength.
- Brand price: prefer MRP extracted from the strip photo; fallback to `data/brand_prices.csv`; if neither → show JA price without a savings delta.
- Output per match: JA product name/code, JA unit price, brand unit price, monthly savings (₹, rounded to integer), confidence, plus static link text to the Jan Aushadhi Kendra locator (janaushadhi.gov.in).

### F5. Scheduling
- A Schedule belongs to one medication: `times[] (HH:mm, patient-local, Asia/Kolkata default)`, `foodRelation ∈ {before_food, after_food, with_food, any}`, `startDate`, optional `endDate`, `active`.
- Worker materializes `DoseEvent`s 24 h ahead, idempotently (unique on scheduleId + scheduledAt). All storage in UTC; display/IVR in patient tz.

### F6. TTS & IVR
- Reminder script text generated per (patient, dose-time med set, language) by LLM using the fixed template in `02-DESIGN.md` §7; audio via OpenAI TTS; cached by content hash; served from `/api/audio/{file}`.
- Telephony: Twilio Programmable Voice, TwiML `<Play>` + `<Gather>`; webhooks under `/api/twilio/*`; signature validation on all webhooks; full contract in `03-SYSTEM-ARCHITECTURE.md` §10.
- Twilio trial constraints (accepted for demo): only verified numbers callable; trial preamble plays first.

### F7. Adherence & alerts
- DoseEvent state machine: `scheduled → calling → confirmed | missed | skipped` (see `04-DATA-FLOW-INTEGRATION.md` §7). Caregiver can manually mark any of today's doses (patient told caregiver by phone).

### F8. Demo mode
- `DEMO_MODE=true` enables: `POST /api/demo/seed` (loads Kamla Devi household §13), "Call now" buttons, simulated in-browser call, and a time-travel control to jump the worker clock to the next dose *(demo only, never affects stored schedules)*.

### F9. Household setup
- First run → onboarding: caregiver name, patient name, patient phone (E.164), patient language (`hi`/`en`), voice preference (female/male). Single household row; editing allowed from Profile screen.

## 8. Non-functional requirements

| Category | Requirement |
|---|---|
| Performance | Scan ≤25 s (5 strips); interactions ≤20 s; TTS ≤5 s/script; page loads ≤2 s on mid-range Android over 4G |
| Reliability | Demo path must survive: openFDA down (curated-only + banner), Twilio down (simulated call), OpenAI transient errors (retry ×2, exponential backoff) |
| Privacy | Health data + phone numbers stored **locally only** (SQLite + local file storage). No analytics/trackers. One-command purge (`npm run purge`). Photos deletable from UI. |
| Safety (medical) | See §9 — non-negotiable |
| Accessibility | WCAG AA contrast; ≥16 px base font; 48 px targets; icon+word+color for all statuses; full Hindi UI |
| i18n | All strings in locale JSON; Devanagari font loaded (Noto Sans Devanagari); dates/times rendered in patient tz |
| Cost | Full build-week usage ≤ $25 API + Twilio trial credit (see `05-TECH-STACK.md` §8) |

## 9. Medical safety guardrails (non-negotiable, test these)

1. Persistent footer disclaimer on every screen and in every call's closing line: EN "DawaiSaathi organizes your prescribed medicines. It is not medical advice. Always confirm changes with your doctor or pharmacist." / HI "दवाई साथी आपकी लिखी हुई दवाइयों को व्यवस्थित करता है। यह चिकित्सा सलाह नहीं है। कोई भी बदलाव डॉक्टर या फार्मासिस्ट से पूछ कर ही करें।"
2. The system NEVER: suggests starting/stopping a medicine, changes a dose, interprets symptoms, or answers free-text medical questions (there is no free-text medical Q&A surface in MVP).
3. Every interaction finding and every generic suggestion ends with a consult-your-pharmacist/doctor line (enforced in prompt + post-validation; if missing, backend appends it).
4. Severity inflation is blocked structurally (AC-4.3).
5. High-risk meds banner (F2) cannot be dismissed, only acknowledged per session.
6. IVR never states *why* a medicine is taken (no "आपकी शुगर की दवाई") — privacy on a possibly shared phone; refers to brand name + count only.

## 10. Privacy & data

- Single-household local deployment for MVP; **no auth** (accepted risk, documented on the demo slide as "local-first by design").
- PII inventory: patient name, phone, language; medication list; call logs; photos. All local. `PUBLIC_BASE_URL` (ngrok) exposes only: audio files by unguessable hash filename and Twilio webhooks (signature-validated).
- Retention: photos and audio purgeable via UI + `npm run purge`.

## 11. Scope table

| Feature | MVP | Stretch (only if days 1–4 done) | Out of scope |
|---|---|---|---|
| Strip photo → structured meds | ✅ | | |
| Prescription-photo parsing | | ✅ | |
| Interactions (curated + openFDA + LLM-unverified) | ✅ | | |
| Food/lifestyle interactions (alcohol, grapefruit) | | ✅ | |
| Jan Aushadhi savings | ✅ | | |
| Nearest Kendra geolocation | | ✅ (static locator link is MVP) | |
| IVR reminder + DTMF + retries | ✅ | | |
| WhatsApp channel | | | ❌ post-hackathon |
| Simulated call (demo) | ✅ | | |
| Adherence dashboard | ✅ | | |
| Caregiver SMS alerts | | ✅ | |
| Hindi + English | ✅ | Bhojpuri TTS test | |
| Counterfeit code verification | | | ❌ NG2 |
| Accounts/auth/multi-household | | | ❌ NG4 |

## 12. Success metrics

**Demo-day (hard gates):** the 3-minute script (§14) runs without manual recovery; AC-1.4, AC-4.4, AC-6.3, AC-9.3 all pass live or on the recorded backup.
**Product metrics (post-hackathon north stars, instrument later):** dose confirmation rate ≥70%; ₹ saved/household/month; caregiver weekly active rate; time-to-first-schedule <10 min.

## 13. Frozen demo kit (buy these exact strips; seed data mirrors them)

| # | Brand strip | Salt(s) | Role in demo |
|---|---|---|---|
| 1 | **Telma 40** (Glenmark) | telmisartan 40 mg | savings hero (~₹200/mo) |
| 2 | **Amlong 5** (Micro Labs) | amlodipine 5 mg | savings (~₹95/mo) |
| 3 | **Glycomet 500** (USV) | metformin 500 mg | savings (~₹75/mo), 2×/day schedule |
| 4 | **Ecosprin 75** (USV) | aspirin 75 mg | interaction pair A |
| 5 | **Warf 5** (Cipla) | warfarin 5 mg | interaction pair B + high-risk banner |

Interaction caught: **warfarin + aspirin, MAJOR (bleeding risk)** — curated source. Total monthly savings with seed prices: **≈ ₹400** (see `04-DATA-FLOW-INTEGRATION.md` §10 for exact seed rows). Patient: Kamla Devi, 72, Varanasi, `hi`, phone = presenter's verified number.

## 14. Demo script (3 minutes, beat by beat)

1. **(0:00)** Hook: "One in ten medical products in developing countries is compromised, and half of chronic patients don't take medicines correctly. Meet Kamla Devi, 72 — five medicines, feature phone, no English."
2. **(0:25)** Live: photograph the 5 strips on the table with laptop/phone camera → upload → extraction runs → review screen shows 5 meds with confidences. Fix one flagged field on camera ("it's honest about uncertainty").
3. **(1:05)** Confirm → **red MAJOR alert: Warfarin + Aspirin, bleeding risk**, with the openFDA/curated evidence expanded. "Her cardiologist and her GP never saw each other's prescriptions. DawaiSaathi did."
4. **(1:35)** Savings screen: "Same molecules from Jan Aushadhi: **₹400 saved every month** — that's a month of vegetables."
5. **(1:55)** Schedule confirmed → press **Call now** → presenter's phone rings on speaker → Hindi voice lists her medicines → presenter presses **1** → dashboard flips the dose to green "Confirmed" in real time.
6. **(2:40)** Close: "No app for grandma. No English. No smartphone. One photo by her daughter, and her phone simply rings. DawaiSaathi — हर दवाई का साथी." *(Backup: simulated-call modal, pre-recorded video.)*

## 15. Milestones (5-day build plan)

| Day | Deliverable | Gate |
|---|---|---|
| 1 | Scaffold (Next.js+Prisma+seed), scan→extract→review→confirm | AC-1.x, AC-2.x |
| 2 | Interactions (curated+openFDA+LLM) + generics/savings | AC-4.x, AC-6.x |
| 3 | Schedules, DoseEvent materialization, TTS + preview | AC-7.x, AC-8.1 |
| 4 | Twilio IVR end-to-end + retries + simulated call + adherence | AC-9.x, AC-10.x, AC-11.x |
| 5 | Hindi UI pass, polish, demo seed, rehearse ×3, record backup video | §14 runs clean |

## 16. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Blister-foil OCR errors (curved, reflective) | High | Med | Photo tips overlay; review-before-save UX; confidence flags; demo strips pre-tested Day 1 |
| Twilio India call fails on stage venue network/regulatory | Med | High | Simulated call (AC-10) + pre-recorded video + test at venue |
| openFDA lacks a label for a salt | Med | Low | Curated table covers all demo pairs; "partial check" banner |
| LLM hallucinates an interaction | Low | High | Evidence-quote requirement + severity gating (AC-4.3) |
| Hindi TTS mispronounces brand names | Med | Low | Pre-generate demo audio Day 3, review, pin cached files |
| Jan Aushadhi price data stale | Med | Low | Seed data marked "approx. MRP, verify locally"; demo uses seeded rows |
| Scope creep | High | High | Anything not in §11 MVP column is refused until Day 5 |

## 17. Open questions (defaults chosen; revisit post-hackathon)
1. Retry cadence 10 min ×2 — right for real elders? *(default kept for demo)*
2. Should caregiver get SMS (not just dashboard) on missed dose? *(stretch)*
3. Brand-price source licensing for production (1mg/PharmEasy scraping not OK) → likely NPPA ceiling-price data. *(MVP uses bundled seed CSV)*

## 18. Glossary
**Salt/INN** — active molecule generic name (telmisartan). **Strip** — foil blister pack. **Jan Aushadhi (PMBJP)** — Indian govt certified-generic pharmacy program. **Kendra** — Jan Aushadhi store. **IVR** — automated voice call with keypad input. **DTMF** — keypad tones. **MRP** — printed maximum retail price. **openFDA** — U.S. FDA open API for drug label text. **DoseEvent** — one scheduled intake instance of one medication.
