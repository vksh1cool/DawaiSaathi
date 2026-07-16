# DawaiSaathi — Design Doc (UX / UI / Voice)

| | |
|---|---|
| **Version** | 1.0 (frozen) |
| **Scope** | Web app (caregiver), IVR voice experience (patient), demo-mode UI |
| **Companion docs** | `01-PRD.md` (what & why), `03-SYSTEM-ARCHITECTURE.md` (contracts), `04-DATA-FLOW-INTEGRATION.md` (runtime flows) |

> **Builder note:** Implement screens exactly as specced — layout, states, and copy. All user-facing strings live in `src/lib/i18n/en.json` and `src/lib/i18n/hi.json`; the keys are given throughout this doc as `i18n:key.path`. Wireframes are mobile-first (390 px); desktop is the same layout centered at max-width 480 px (this is a phone-shaped product — do not build a desktop dashboard).

---

## 1. Design principles

1. **Elder-adjacent, caregiver-operated.** The caregiver is mobile-savvy, but screenshots get shared with relatives — so everything must read at a glance: big type, one primary action per screen.
2. **Evidence visible, never buried.** Safety claims (interactions) always show *why* and *from where*. Trust is the product.
3. **Bilingual by default.** Every screen must render perfectly in Hindi (longer strings, Devanagari metrics). Never truncate Hindi.
4. **Status = icon + word + color.** Never color alone (US-14).
5. **Calm, warm, non-clinical.** This is a साथी (companion), not a hospital dashboard. Rounded corners, generous whitespace, warm neutrals.

## 2. Brand

- **Name:** DawaiSaathi (Latin) / दवाई साथी (Devanagari). Logo file exists at repo root: `dawaisaathi_logo.png` (use in header at 32 px height, and on S0).
- **Tagline:** EN "Every medicine's companion" / HI "हर दवाई का साथी" (`i18n:brand.tagline`).
- **Voice & tone:** Respectful-warm ("आप" always, never "तुम"); short sentences; zero medical jargon in body copy (jargon allowed only inside evidence quotes).

## 3. Design tokens (Tailwind theme values — implement in `globals.css` @theme)

### 3.1 Color

| Token | Hex | Usage |
|---|---|---|
| `--color-primary` | `#0F766E` (teal-700) | primary buttons, active nav, links |
| `--color-primary-soft` | `#CCFBF1` (teal-100) | selected chips, highlights |
| `--color-bg` | `#FAFAF7` | app background (warm off-white) |
| `--color-surface` | `#FFFFFF` | cards |
| `--color-text` | `#1C1917` (stone-900) | primary text |
| `--color-text-muted` | `#57534E` (stone-600) | secondary text |
| `--color-border` | `#E7E5E4` (stone-200) | card borders, dividers |
| `--color-danger` | `#DC2626` | major severity, expired, missed |
| `--color-danger-soft` | `#FEE2E2` | major banners bg |
| `--color-warn` | `#D97706` | moderate severity, expiring soon |
| `--color-warn-soft` | `#FEF3C7` | moderate banners bg |
| `--color-info` | `#2563EB` | minor severity, info |
| `--color-unverified` | `#7C3AED` | `unverified` severity |
| `--color-success` | `#16A34A` | confirmed doses, savings, no-interactions |
| `--color-success-soft` | `#DCFCE7` | success banners bg |

Contrast rule: all text on soft backgrounds uses the strong color (e.g., `#DC2626` on `#FEE2E2`) — verified ≥4.5:1.

### 3.2 Typography

| Role | Font | Size/leading | Weight |
|---|---|---|---|
| Latin UI | Inter (variable, via `next/font`) | base 16/24 | 400/600/700 |
| Devanagari | Noto Sans Devanagari (via `next/font`) | base 17/28 (Devanagari needs looser leading) | 400/600/700 |
| H1 (screen title) | — | 24/32 | 700 |
| H2 (card title) | — | 18/26 | 600 |
| Big number (savings, adherence) | — | 34/40 | 700 |
| Caption/legal | — | 13/18 | 400 |

Font stack: `font-family: Inter, "Noto Sans Devanagari", system-ui, sans-serif;` — Devanagari glyphs fall through automatically; when UI locale is `hi`, bump base size +1 px via `html[lang="hi"]`.

### 3.3 Spacing, shape, elevation, motion
- Spacing scale: 4 px base (`4/8/12/16/24/32/48`). Screen padding: 16 px. Card padding: 16 px. Gap between cards: 12 px.
- Radius: cards 16 px, buttons 12 px, chips 999 px, banners 12 px.
- Elevation: cards `0 1px 3px rgb(0 0 0 / 0.08)`; modals `0 8px 30px rgb(0 0 0 / 0.18)`.
- Touch targets ≥48×48 px. Primary button height 52 px, full-width.
- Motion: 150 ms ease-out on all state changes; dose-confirmed uses a single 300 ms green pulse (demo moment §S2). No other animation.
- Icons: `lucide-react`, 20 px inline / 24 px in banners. Fixed mapping: scan=`Camera`, meds=`Pill`, interaction=`AlertTriangle`, savings=`IndianRupee`, schedule=`Clock`, call=`PhoneCall`, confirmed=`CheckCircle2`, missed=`XCircle`, high-risk=`ShieldAlert`, expiry=`CalendarX`.

## 4. Information architecture & navigation

```
S0 Onboarding (first run only)
└── App shell: header (logo · language toggle EN/हि · Profile icon)
    + bottom tab bar (4 tabs, 56px, icon+label):
    ├── S2 Home        (Today)        [Home]
    ├── S3 Scan        (Camera)       [Scan]  ← also FAB on S2 when 0 meds
    ├── S5 Safety      (AlertTriangle)[Safety]   badge = open findings count
    └── S6 Savings     (IndianRupee)  [Savings]
Push-navigation (no tab):
    S4 Review extraction   (from S3)
    S7 Schedule setup      (from S4 confirm, or med card edit)
    S8 Adherence & calls   (from S2 "History")
    S9 Profile & settings  (from header)
    M1 Simulated call modal (demo)
```

Every screen renders `DisclaimerBanner` (`i18n:legal.disclaimer`, 13 px, muted, above tab bar; not dismissible) — PRD §9.1.

## 5. Screen specs

Wireframe legend: `[Button]` `(chip)` `{dynamic}` `▢` image/photo, `●○` severity dot.

### S0 — Onboarding (route `/onboarding`)
Purpose: create the single household (PRD F9). 3 steps, one question per screen, progress dots.

```
Step 1                        Step 2                        Step 3
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│  [logo]              │      │ Who takes these       │      │ Which language should │
│  दवाई साथी           │      │ medicines?            │      │ {patientName}'s calls │
│  Every medicine's    │      │ Name  [___________]   │      │ be in?                │
│  companion           │      │ Their phone number    │      │ (हिन्दी) (English)    │
│                      │      │ [+91 __________]      │      │ Voice: (Female)(Male) │
│ Your name            │      │ ("This phone rings    │      │ [▶ Preview voice]     │
│ [_____________]      │      │  at medicine time")   │      │                      │
│ [Continue →]         │      │ [Continue →]          │      │ [Finish setup ✓]     │
└──────────────────────┘      └──────────────────────┘      └──────────────────────┘
```

- Phone input: E.164, default country +91, validate 10 digits for IN; helper text `i18n:onboarding.phone_help` = EN "We call this number at medicine time. Works on any phone — no app needed." 
- "Preview voice" plays a canned TTS sample (`storage/audio/sample_{lang}_{gender}.mp3`, generated at seed time).
- Completion → POST `/api/household` → route to S2 (empty state).
- Patient = self allowed: checkbox "I take these medicines myself" on Step 2 copies caregiver name, keeps phone required.

### S2 — Home / Today (route `/`)
Purpose: at-a-glance day: alerts → today's doses → adherence → savings teaser.

```
┌────────────────────────────────┐
│ [logo]  दवाई साथी      (हि) (⚙) │
│                                │
│ ⚠ MAJOR · Warfarin + Aspirin   │  ← AlertStrip: top open finding,
│   Bleeding risk — tap to view  │     danger-soft bg, → S5
│                                │
│ Today · Mon 14 Jul   [History] │
│ ┌────────────────────────────┐ │
│ │ ✓ 08:00  Morning · 3 meds  │ │  ← DoseGroupCard, success tint
│ │   Telma 40 · Glycomet 500  │ │
│ │   Ecosprin 75              │ │
│ │   Confirmed by call 08:02  │ │
│ ├────────────────────────────┤ │
│ │ ● 20:00  Evening · 2 meds  │ │  ← upcoming, neutral
│ │   Glycomet 500 · Warf 5    │ │
│ │   Rings {patientName} at   │ │
│ │   20:00   [Call now ▸]     │ │  ← Call now: DEMO_MODE only
│ └────────────────────────────┘ │
│ This week: ██████░ 86% taken   │  ← AdherenceBar → S8
│ 💰 Saving ₹400/month  → Savings│
│ ────────────────────────────── │
│ DawaiSaathi is not medical     │
│ advice … (13px muted)          │
│ [Home] [Scan] [Safety] [Savings]│
└────────────────────────────────┘
```

States: **Empty** (0 meds): illustration + `i18n:home.empty` "Add medicines by photographing the strips" + big `[📷 Scan medicines]` → S3. **Missed dose**: group card danger tint, `XCircle`, "Missed — 3 calls unanswered", actions `[Mark taken]` `[Call again]`.

### S3 — Scan (route `/scan`)
```
┌────────────────────────────────┐
│ ← Scan medicines               │
│ Tips: lay strips flat · daylight│
│ · include the printed back side │
│ ┌────────────────────────────┐ │
│ │      ▢  drop / tap to      │ │  ← PhotoDropzone
│ │      add photos (1–5)      │ │    accept image/*, capture=environment
│ └────────────────────────────┘ │
│ [▢ thumb][▢ thumb][+]          │  ← removable thumbnails
│ [Extract medicines →]          │  ← disabled until ≥1 photo
└────────────────────────────────┘
```
Processing state (blocking, sequential checklist, real progress from API phases): "Reading strips… ✓ / Identifying salts… ✓ / Checking details… ●". On error: `i18n:scan.error_retry` + [Try again] (photos retained).

### S4 — Review extraction (route `/scan/review`)
Purpose: US-2 — human confirmation gate. One `MedReviewCard` per extracted medicine.

```
┌────────────────────────────────┐
│ ← Check what we found (5)      │
│ We read these from your photos.│
│ Please correct anything wrong. │
│ ┌────────────────────────────┐ │
│ │ ▢photo  Brand  [Telma 40 ] │ │
│ │ Salt: [telmisartan][40][mg]│ │
│ │  (+ add salt)              │ │
│ │ Form (tablet ▾)  Pack [30] │ │
│ │ MRP ₹[234.00]              │ │
│ │ Expiry [2027-08] Batch[…]  │ │
│ │ ⚠ MRP unclear — please     │ │  ← any field conf <0.7:
│ │   check (amber outline)    │ │     amber outline + this row
│ │ [🗑 Remove]                │ │
│ ├────────────────────────────┤ │
│ │ 🛡 HIGH-RISK MEDICINE      │ │  ← Warf 5 card extra banner
│ │ Warfarin needs extra care. │ │     (danger-soft, ShieldAlert)
│ └────────────────────────────┘ │
│ [+ Add a medicine manually]    │
│ [Confirm 5 medicines ✓]        │
└────────────────────────────────┘
```
Expired strip → non-dismissible red banner on that card: `i18n:review.expired` "This strip is expired ({MM/YYYY}). Do not use — replace it." Expiring ≤60 d → amber `i18n:review.expiring`.
Confirm → POST medications → auto-run interactions + generics → route to S5 if findings exist, else S7.

### S5 — Safety / Interactions (route `/safety`)
```
┌────────────────────────────────┐
│ Safety check                   │
│ Checked {n} medicines · {date} │
│ [Re-check ⟳]                   │
│ ┌────────────────────────────┐ │
│ │ ●MAJOR  ⚠                  │ │  ← danger-soft bg
│ │ Warf 5 (warfarin)          │ │
│ │  + Ecosprin 75 (aspirin)   │ │
│ │ Taking these together can  │ │
│ │ cause serious bleeding.    │ │
│ │ ► Why we flagged this      │ │  ← accordion: evidence quote
│ │   (source: curated · FDA)  │ │     + source badge
│ │ ☎ Discuss with your doctor │ │
│ │ before the next dose.      │ │
│ │ [Mark discussed ✓]         │ │  ← acknowledge (US-5)
│ └────────────────────────────┘ │
│ ▸ Acknowledged (1)             │  ← collapsed section
└────────────────────────────────┘
```
Severity badges: MAJOR red `AlertTriangle` / MODERATE amber `AlertTriangle` / MINOR blue `Info` / UNVERIFIED purple `HelpCircle` + fixed caption `i18n:safety.unverified_note` "Not verified in our sources — ask your pharmacist." Zero findings → full-screen success state (AC-4.5): green `CheckCircle2`, "No known interactions found among these {n} medicines", caption "We check curated data and FDA labels. Always tell every doctor everything you take."

### S6 — Savings (route `/savings`)
```
┌────────────────────────────────┐
│ Savings with Jan Aushadhi      │
│ ┌────────────────────────────┐ │
│ │   ₹400 / month             │ │  ← big number, success color
│ │   ₹4,800 every year        │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ Telma 40 → Telmisartan 40  │ │  ← SavingsRow (confidence high)
│ │ ₹7.8/tab → ₹1.0/tab        │ │
│ │ Saves ₹204/month  (high ✓) │ │
│ ├────────────────────────────┤ │
│ │ Warf 5 — no Jan Aushadhi   │ │  ← no-match row, muted
│ │ match found                │ │
│ └────────────────────────────┘ │
│ Same salt, same strength.      │
│ Confirm the switch with your   │
│ pharmacist. (fixed caption)    │
│ [Find a Jan Aushadhi Kendra ↗] │  ← external link janaushadhi.gov.in
└────────────────────────────────┘
```
`low` confidence matches render in the list but greyed with "not counted in total" note (AC-6.1).

### S7 — Schedule setup (route `/schedule`)
One `ScheduleCard` per medication; suggestions pre-filled (US-7).

```
│ ┌────────────────────────────┐ │
│ │ Glycomet 500 (metformin)   │ │
│ │ When: (Morning 08:00 ✓)    │ │  ← TimeChips: tap toggles;
│ │ (Afternoon) (Evening 20:00✓)│ │    long-press → time picker
│ │ (Night)                    │ │    (15-min steps)
│ │ Food: (Before)(After ✓)(With)(Any) │
│ │ Suggested from label — you │ │
│ │ decide.                    │ │
│ └────────────────────────────┘ │
│ [▶ Preview {patientName}'s call]│  ← US-8, plays merged 20:00 audio
│ [Start reminders ✓]            │
```
Methotrexate-daily guard (PRD F2): blocking modal, danger, requires typing patient name to override — copy `i18n:schedule.mtx_warning`.

### S8 — Adherence & call history (route `/history`)
7-day strip (7 columns, day dots colored by day outcome), big adherence %, then reverse-chron `CallLogRow`s: `{time} · {status icon} · "Evening call · answered · confirmed by keypress 1" · [▶ audio]`. Filter chips: (All)(Confirmed)(Missed).

### S9 — Profile & settings (route `/profile`)
Household fields (editable, F9), language toggle mirror, "Delete all photos", "Erase all data" (double-confirm, types DELETE), app version, full legal text.

### M1 — Simulated call modal (DEMO_MODE, from "Call now" on failure or via long-press)
Phone-shaped modal: "📞 Calling {patientName}…" → auto-plays reminder mp3 → on-screen keypad `[1] [2]` → same API transitions as real DTMF (AC-10.1) → shows resulting dose state. Footer: "Simulated call — telephony fallback".

## 6. Component inventory (build in `src/components/`)

| Component | Props (TS) | Used in |
|---|---|---|
| `AppShell` | `children` | all |
| `LanguageToggle` | — (context) | header |
| `DisclaimerBanner` | — | all |
| `AlertStrip` | `finding: Finding` | S2 |
| `DoseGroupCard` | `group: {time, meds[], status, doseEventIds[]}` | S2 |
| `AdherenceBar` | `percent, days` | S2, S8 |
| `PhotoDropzone` | `files, onChange, max=5` | S3 |
| `ExtractionProgress` | `phase` | S3 |
| `MedReviewCard` | `draft: DraftMedication, onChange, onRemove` | S4 |
| `ConfidenceField` | `label, value, confidence, onChange` | S4 |
| `HighRiskBanner` | `saltName` | S4, S2 |
| `SeverityBadge` | `severity` | S5 |
| `FindingCard` | `finding, onAcknowledge` | S5 |
| `EvidenceAccordion` | `quotes: {source, text}[]` | S5 |
| `SavingsHero` | `monthlyInr, yearlyInr` | S6 |
| `SavingsRow` | `match: GenericMatch` | S6 |
| `ScheduleCard` | `medication, schedule, onChange` | S7 |
| `TimeChips` | `times, onToggle, onEdit` | S7 |
| `CallLogRow` | `call: ReminderCall` | S8 |
| `SimulatedCallModal` | `doseEventId, onClose` | M1 |
| `PrimaryButton / GhostButton / Chip` | std | all |

## 7. Voice / IVR experience (patient-facing — treat as a first-class UI)

### 7.1 Call flow state diagram

```
 place call ──► answered? ──no (no-answer/busy/failed)──► retry logic (≤2 retries, +10 min) ──► missed + caregiver alert
      │yes
      ▼
 PLAY greeting+medlist+menu ──► GATHER 1 digit (timeout 8s)
      │1                │2                │timeout/other
      ▼                 ▼                 ▼
 PLAY thanks       replay medlist    replay menu once ──► timeout ──► PLAY goodbye_noinput
 mark CONFIRMED    (max 1 replay,    │1 → thanks/confirmed          mark stays `calling`;
 hang up            then menu)                                       status callback → retry logic
```

### 7.2 Verbatim scripts (these exact strings ship in `src/lib/ivr/scripts.ts`)

Template variables: `{name}` patient first name, `{timeLabel}` सुबह/दोपहर/शाम/रात (morning/afternoon/evening/night), `{medLines}` joined by "…, और ". Med line format: `{brandName} की {count} गोली` / EN `{count} tablet of {brandName}`. Syrup: `{brandName} {doseMl} एम एल` . Food suffix per group when uniform: `खाने के बाद` (after food) / `खाने से पहले` (before food).

**Hindi (`hi`) — primary:**
- `greeting_medlist`: «नमस्ते {name} जी। मैं दवाई साथी बोल रही हूँ। {timeLabel} की दवाई का समय हो गया है। कृपया अभी लें — {medLines}, {foodSuffix}।»
- `menu`: «दवाई लेने के बाद 1 दबाएँ। दोबारा सुनने के लिए 2 दबाएँ।»
- `thanks`: «बहुत बढ़िया, {name} जी! आपकी दवाई दर्ज हो गई है। दवाई में बदलाव से पहले डॉक्टर या फार्मासिस्ट से पूछें। अपना ध्यान रखिए। नमस्ते।»
- `goodbye_noinput`: «कोई बात नहीं। दवाई ज़रूर ले लीजिएगा। दवाई में बदलाव से पहले डॉक्टर या फार्मासिस्ट से पूछें। हम थोड़ी देर में फिर फ़ोन करेंगे। नमस्ते।»
- `goodbye_final` (last retry exhausted, played if answered but no input): «कृपया दवाई ले लीजिएगा और {caregiverName} को बता दीजिएगा। दवाई में बदलाव से पहले डॉक्टर या फार्मासिस्ट से पूछें। नमस्ते।»

**English (`en`):**
- `greeting_medlist`: “Hello {name}, this is DawaiSaathi. It's time for your {timeLabel} medicines. Please take — {medLines}, {foodSuffix}.”
- `menu`: “After taking your medicines, press 1. To hear the list again, press 2.”
- `thanks`: “Well done, {name}! Your dose is recorded. Confirm any medicine changes with your doctor or pharmacist. Take care. Goodbye.”
- `goodbye_noinput`: “That's alright. Please do take your medicines. Confirm any medicine changes with your doctor or pharmacist. We will call again shortly. Goodbye.”

Rules: never state indication/disease on the call (PRD §9.6); total `greeting_medlist + menu` audio must be ≤40 s (if >5 meds in one slot, chunk list into two Plays); numbers spoken as words in Hindi script text (एक, दो) — write the script text that way when generating.

### 7.3 Audio style guide (TTS)
- OpenAI TTS; voice: female default `alloy`-class warm voice, male alt; **TTS instructions string (fixed):** "Speak in warm, clear Hindi at a slow pace, like a caring family member speaking to an elderly parent. Pause briefly after each medicine name. Pronounce medicine brand names clearly syllable by syllable."
- Generate at 1.0 speed; do NOT speed-shift. Cache per exact script text (`04-DATA-FLOW-INTEGRATION.md` §6).
- Demo requirement: pre-generate and human-review all demo-kit audio on Day 3 (PRD risk table).

## 8. Copywriting rules & key strings

- Reading level: ~8th grade EN; simple बोलचाल Hindi (no Sanskritized words: use "खतरा" not "जोखिम", "फ़ायदा" not "लाभ").
- Numbers: ₹ with Indian grouping (₹4,800); times in 12-hour with labels (8:00 सुबह).
- Fixed safety captions (verbatim, i18n keys):
  - `legal.disclaimer` — PRD §9.1 exact strings.
  - `savings.caption` — EN "Same salt, same strength. Confirm the switch with your pharmacist." / HI "वही salt, वही ताक़त। बदलने से पहले फार्मासिस्ट से पूछ लें।"
  - `safety.consult` — EN "Discuss with your doctor before the next dose." / HI "अगली खुराक से पहले डॉक्टर से बात करें।"
- Error tone: never blame the user. "We couldn't read this clearly — one more photo in daylight will help."

## 9. Accessibility checklist (gate before demo)
- [ ] Base font ≥16 px (17 px in `hi`); user-scalable viewport (no `maximum-scale`).
- [ ] All interactive elements ≥48 px hit area; visible focus rings (`outline-2 primary`).
- [ ] Severity/status: icon + word + color everywhere (grep for lone color-dot usage).
- [ ] All images have alt; extraction photos alt="photo of medicine strip {n}".
- [ ] Audio player controls keyboard-operable; simulated-call keypad has aria-labels.
- [ ] Contrast: run axe on S2/S4/S5/S6; zero AA violations.
- [ ] Full app renders in Hindi with no overflow/truncation at 390 px.

## 10. Responsive & platform behavior
- Mobile-first 390 px; content max-width 480 px centered on larger screens, `--color-bg` gutters.
- Camera: `<input type="file" accept="image/*" capture="environment" multiple>` (works Safari iOS + Chrome Android; desktop falls back to file picker).
- PWA-lite: manifest + icon so it installs to home screen; offline support NOT required (MVP).

## 11. Demo-mode affordances (visible only when `DEMO_MODE=true`)
- `[Call now ▸]` on any upcoming dose group (S2).
- Long-press "Call now" → M1 simulated call directly.
- Header shows small "DEMO" chip (so screenshots are honest).
- `/api/demo/seed` button inside S9 → "Load demo household".
