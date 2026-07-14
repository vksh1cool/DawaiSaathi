# DawaiSaathi — System Architecture Doc

| | |
|---|---|
| **Version** | 1.0 (frozen) |
| **Audience** | The implementing coding agent / engineer |
| **Companion docs** | `01-PRD.md` (requirements), `02-DESIGN.md` (UI+IVR), `04-DATA-FLOW-INTEGRATION.md` (runtime sequences, seed data), `05-TECH-STACK.md` (versions, setup) |

> **Builder note:** This doc is the source of truth for contracts: file layout, DB schema, API shapes, prompts, and external-service payloads. If any other doc conflicts with this one on a technical contract, this doc wins. Allowed-value sets are enforced with zod (SQLite/Prisma does not support enums — all "enum" columns are `String` validated in code).

---

## 1. Architecture overview

```
                         ┌──────────────────────────── laptop (single machine) ───────────────────────────┐
                         │                                                                                │
 Caregiver phone/browser │  ┌─────────────── Next.js app (port 3000) ───────────────┐   ┌──────────────┐  │
 ───────HTTPS(ngrok)────▶│  │ React UI (S0–S9, M1)                                   │   │ Worker       │  │
                         │  │ Route handlers /api/** :                               │   │ (tsx process)│  │
                         │  │  scan · medications · interactions · generics ·        │   │ tick 60s:    │  │
                         │  │  schedules · today · dose-events · adherence · alerts ·│   │ materialize  │  │
                         │  │  tts · calls · simulate · twilio webhooks · audio ·    │   │ DoseEvents + │  │
                         │  │  photos · demo                                         │   │ place calls  │  │
                         │  └───────┬───────────────┬───────────────┬────────────────┘   └──────┬───────┘  │
                         │          │ Prisma        │ fs            │                           │          │
                         │      ┌───▼────┐   ┌──────▼──────┐  ┌─────▼─────┐                     │          │
                         │      │ SQLite │   │ storage/    │  │ data/*.csv │◀── seed/lookup ─────┘          │
                         │      │ dev.db │   │ photos audio│  └───────────┘  (curated interactions,        │
                         │      └────────┘   └─────────────┘                  Jan Aushadhi, brand prices)   │
                         └──────────┬──────────────────────────┬──────────────────────────┬────────────────┘
                                    │                          │                          │
                             OpenAI API                  api.fda.gov               Twilio Voice ──▶ 📞 Patient's
                        (GPT-5.6 vision+structured      (drug/label.json,          (outbound call,     phone
                         outputs, TTS)                   cached 7d)                 webhooks back via ngrok)
```

Two OS processes, one codebase:
1. **`next dev`/`next start`** — UI + all API route handlers (including Twilio webhooks and audio serving).
2. **`worker`** — a small Node process (`tsx worker/index.ts`) sharing `src/lib/**` and the same SQLite DB; ticks every 60 s to materialize dose events and place due reminder calls. Single instance only (no distributed locking — documented constraint).

**ngrok** exposes port 3000 publicly; its URL is `PUBLIC_BASE_URL`, used for Twilio webhook callbacks and `<Play>` audio URLs.

## 2. Repository layout (exact)

```
/ (repo root = Next.js project root)
├── docs/                          # these documents
├── dawaisaathi_logo.png           # existing logo (copy to public/logo.png at setup)
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                    # loads data/*.csv into DB + demo household (DEMO_MODE)
├── data/
│   ├── curated_interactions.csv
│   ├── janaushadhi_products.csv
│   ├── brand_prices.csv
│   └── highrisk_meds.csv
├── storage/                       # gitignored, runtime files
│   ├── photos/{batchId}/{n}.jpg
│   └── audio/{sha256}.mp3
├── public/
│   ├── logo.png  · manifest.webmanifest · icons/
├── src/
│   ├── app/
│   │   ├── layout.tsx  · page.tsx                    # S2 Home
│   │   ├── onboarding/page.tsx                       # S0
│   │   ├── scan/page.tsx · scan/review/page.tsx      # S3, S4
│   │   ├── safety/page.tsx                           # S5
│   │   ├── savings/page.tsx                          # S6
│   │   ├── schedule/page.tsx                         # S7
│   │   ├── history/page.tsx                          # S8
│   │   ├── profile/page.tsx                          # S9
│   │   └── api/                                      # one route.ts per §7 endpoint
│   ├── components/                                   # per 02-DESIGN.md §6
│   ├── lib/
│   │   ├── config.ts        # typed env access (zod-validated at boot)
│   │   ├── db.ts            # PrismaClient singleton
│   │   ├── errors.ts        # AppError + error → HTTP mapping
│   │   ├── logger.ts        # pino
│   │   ├── i18n/{index.ts,en.json,hi.json}
│   │   ├── openai.ts        # client + callLLM() retry wrapper + tts()
│   │   ├── prompts.ts       # ALL prompt strings + JSON schemas (§8)
│   │   ├── extraction.ts    # photo → DraftMedication[]
│   │   ├── normalize.ts     # extraction → canonical salts (§8.3)
│   │   ├── openfda.ts       # label fetch + cache (§9)
│   │   ├── interactions.ts  # 3-layer engine (§8.4, PRD F3)
│   │   ├── generics.ts      # JA matching + savings math (PRD F4)
│   │   ├── schedule.ts      # suggestions (§8.5) + DoseEvent materialization
│   │   ├── ivr/scripts.ts   # verbatim templates (02-DESIGN.md §7.2) + fill/join helpers
│   │   ├── tts.ts           # script → cached mp3 (§11)
│   │   ├── twilio.ts        # client, placeReminderCall(), validateSignature()
│   │   ├── calls.ts         # shared call-outcome logic (used by webhooks AND simulator)
│   │   └── util/{dates.ts,hash.ts,money.ts,csv.ts}
│   └── types/domain.ts      # shared TS types (DraftMedication, Finding, …)
├── worker/
│   ├── index.ts             # tick loop
│   ├── materialize.ts       # Schedules → DoseEvents (24h horizon)
│   └── reminders.ts         # due events → group → TTS → Twilio call / retries
├── scripts/{purge.ts, pregen-audio.ts}
├── tests/  (vitest) · tests/fixtures/
├── .env.example · .gitignore · package.json · next.config.ts · tsconfig.json
└── postcss.config.mjs · src/app/globals.css  (Tailwind v4, tokens from 02-DESIGN.md §3)
```

## 3. Configuration (env vars — mirror exactly in `.env.example`)

| Var | Required | Default | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | ✅ | — | |
| `OPENAI_MODEL` | | `gpt-5.6` | vision + structured outputs model |
| `OPENAI_TTS_MODEL` | | `gpt-4o-mini-tts` | |
| `OPENAI_TTS_VOICE_FEMALE` | | `coral` | |
| `OPENAI_TTS_VOICE_MALE` | | `onyx` | |
| `TWILIO_ACCOUNT_SID` | ✅* | — | *not needed if only simulated calls |
| `TWILIO_AUTH_TOKEN` | ✅* | — | |
| `TWILIO_FROM_NUMBER` | ✅* | — | E.164, from Twilio console |
| `PUBLIC_BASE_URL` | ✅* | — | ngrok https URL, no trailing slash |
| `DATABASE_URL` | ✅ | `file:./prisma/dev.db` | |
| `OPENFDA_API_KEY` | | — | optional; raises daily quota |
| `DEFAULT_TZ` | | `Asia/Kolkata` | patient timezone |
| `DEMO_MODE` | | `false` | enables §7.9 endpoints + demo UI |
| `WORKER_TICK_SECONDS` | | `60` | |
| `RETRY_DELAY_MINUTES` | | `10` | PRD AC-9.4 |
| `MAX_CALL_ATTEMPTS` | | `3` | total incl. first attempt |

`src/lib/config.ts` parses these with zod at import time and crashes loudly on missing required vars (except Twilio vars, which produce a logged warning + `telephonyEnabled=false`).

## 4. Data model (`prisma/schema.prisma` — verbatim)

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

model Household {
  id            String   @id @default(cuid())
  caregiverName String
  uiLanguage    String   @default("en")        // "en" | "hi"
  createdAt     DateTime @default(now())
  patients      Patient[]
}

model Patient {
  id          String   @id @default(cuid())
  householdId String
  household   Household @relation(fields: [householdId], references: [id])
  name        String
  phoneE164   String                            // "+91XXXXXXXXXX"
  language    String   @default("hi")           // "hi" | "en"  (call language)
  voiceGender String   @default("female")       // "female" | "male"
  timezone    String   @default("Asia/Kolkata")
  createdAt   DateTime @default(now())
  medications Medication[]
  doseEvents  DoseEvent[]
  findings    InteractionFinding[]
  alerts      CaregiverAlert[]
}

model ScanBatch {
  id                String   @id @default(cuid())
  patientId         String
  status            String   @default("processing") // processing|extracted|confirmed|failed
  rawExtractionJson String?                          // merged extraction result (debug/audit)
  createdAt         DateTime @default(now())
  photos            ScanPhoto[]
}

model ScanPhoto {
  id        String @id @default(cuid())
  batchId   String
  batch     ScanBatch @relation(fields: [batchId], references: [id])
  filePath  String                                   // storage/photos/{batchId}/{n}.jpg
  mimeType  String
  sizeBytes Int
}

model Medication {
  id                  String   @id @default(cuid())
  patientId           String
  patient             Patient  @relation(fields: [patientId], references: [id])
  scanBatchId         String?
  brandName           String
  displayGeneric      String                         // "telmisartan" / "telmisartan + amlodipine"
  saltsJson           String                         // JSON: Salt[]  (see §5)
  form                String   @default("tablet")    // tablet|capsule|syrup|drops|injection|cream|other
  packSize            Int?
  mrpInr              Float?
  expiryDate          String?                        // "YYYY-MM"
  batchNumber         String?
  manufacturer        String?
  highRisk            Boolean  @default(false)
  highRiskReason      String?
  fieldConfidenceJson String?                        // JSON: {brandName:0.98,...}
  usualFrequencyHint  String?                        // JSON: {timesPerDay, timing[]}
  status              String   @default("active")    // active|archived
  notes               String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  schedules           Schedule[]
  genericMatches      GenericMatch[]
}

model Schedule {
  id           String   @id @default(cuid())
  medicationId String
  medication   Medication @relation(fields: [medicationId], references: [id])
  timesJson    String                                // JSON: ["08:00","20:00"] patient-local
  foodRelation String   @default("any")              // before_food|after_food|with_food|any
  startDate    DateTime                              // date-only semantics, midnight patient tz → UTC
  endDate      DateTime?
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  doseEvents   DoseEvent[]
}

model DoseEvent {
  id             String    @id @default(cuid())
  scheduleId     String
  schedule       Schedule  @relation(fields: [scheduleId], references: [id])
  medicationId   String
  patientId      String
  patient        Patient   @relation(fields: [patientId], references: [id])
  scheduledAtUtc DateTime
  status         String    @default("scheduled")     // scheduled|calling|confirmed|missed|skipped
  attempts       Int       @default(0)
  nextAttemptAtUtc DateTime?
  confirmedAtUtc DateTime?
  confirmedVia   String?                             // ivr_dtmf|caregiver_manual|simulated
  createdAt      DateTime  @default(now())
  @@unique([scheduleId, scheduledAtUtc])             // idempotent materialization
  @@index([status, scheduledAtUtc])
}

model ReminderCall {
  id              String   @id @default(cuid())
  patientId       String
  scheduledAtUtc  DateTime                           // the dose slot this call serves
  doseEventIdsJson String                            // JSON string[]
  attempt         Int                                // 1..MAX_CALL_ATTEMPTS
  mode            String   @default("twilio")        // twilio|simulated
  twilioCallSid   String?  @unique
  twilioStatus    String?                            // queued|ringing|in-progress|completed|busy|no-answer|failed|canceled
  digitsPressed   String?
  outcome         String?                            // confirmed|no_input|not_answered|failed
  audioFile       String                             // storage/audio/{hash}.mp3 (greeting_medlist)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model InteractionFinding {
  id            String   @id @default(cuid())
  patientId     String
  patient       Patient  @relation(fields: [patientId], references: [id])
  runId         String                               // groups findings of one run
  pairKey       String                               // sorted "aspirin|warfarin"
  medAId        String
  medBId        String
  saltA         String
  saltB         String
  severity      String                               // major|moderate|minor|unverified
  source        String                               // curated|openfda|llm_suspected
  explanationEn String
  explanationHi String
  actionEn      String
  actionHi      String
  evidenceJson  String   @default("[]")              // JSON: {source:"openfda:warfarin", quote:string}[]
  acknowledged  Boolean  @default(false)
  acknowledgedAt DateTime?
  createdAt     DateTime @default(now())
  @@index([patientId, acknowledged])
}

model GenericMatch {
  id                String  @id @default(cuid())
  medicationId      String
  medication        Medication @relation(fields: [medicationId], references: [id])
  jaProductCode     String?
  jaProductName     String?                          // null ⇒ no match found (row still stored)
  jaPackSize        Int?
  jaMrpInr          Float?
  jaUnitPriceInr    Float?
  brandUnitPriceInr Float?
  monthlySavingsInr Int?                             // rounded ₹; null when not computable
  confidence        String?                          // high|medium|low
  estimated         Boolean @default(false)          // frequency estimated (no schedule yet)
  createdAt         DateTime @default(now())
}

model CaregiverAlert {
  id               String   @id @default(cuid())
  patientId        String
  patient          Patient  @relation(fields: [patientId], references: [id])
  type             String                            // missed_dose
  doseEventIdsJson String   @default("[]")
  messageEn        String
  messageHi        String
  readAt           DateTime?
  createdAt        DateTime @default(now())
}

model ApiCache {
  key       String   @id                             // e.g. "openfda:label:warfarin"
  payload   String                                   // JSON string
  fetchedAt DateTime @default(now())
}

model AudioAsset {
  id         String   @id @default(cuid())
  hash       String   @unique                        // sha256(lang|voice|scriptText)
  language   String
  scriptText String
  filePath   String                                  // storage/audio/{hash}.mp3
  createdAt  DateTime @default(now())
}
```

## 5. Shared domain types (`src/types/domain.ts` — implement exactly)

```ts
export type Salt = { inn: string; fdaSearchName: string; strengthValue: number | null;
                     strengthUnit: "mg"|"mcg"|"g"|"iu"|"ml_per_5ml"|"mg_per_5ml"|null };

export type DraftMedication = {
  tempId: string;                       // client-side key
  brandName: string | null;
  salts: Salt[];
  form: "tablet"|"capsule"|"syrup"|"drops"|"injection"|"cream"|"other";
  packSize: number | null;
  mrpInr: number | null;
  expiryDate: string | null;            // "YYYY-MM"
  batchNumber: string | null;
  manufacturer: string | null;
  fieldConfidence: Record<"brandName"|"salts"|"mrpInr"|"expiryDate", number>;
  warnings: string[];                   // e.g. "expiry within 60 days"
  highRisk: boolean;
  highRiskReason: string | null;
  usualFrequencyHint: { timesPerDay: number | null; timing: string[] } | null;
  displayGeneric: string;
};
```

JSON-string columns (`saltsJson` etc.) parse to these types via helpers in `db.ts` (`parseSalts(med)`, …). Every API response returns **parsed** objects (camelCase, JSON columns expanded) — never raw JSON strings.

## 6. Cross-cutting conventions

- **API responses:** success → `200/201` with the documented body. Errors → `{ "error": { "code": string, "message": string } }` with proper status. Codes: `VALIDATION` (400), `NOT_FOUND` (404), `UPSTREAM_OPENAI` (502), `UPSTREAM_OPENFDA` (502), `UPSTREAM_TWILIO` (502), `TELEPHONY_DISABLED` (409), `INTERNAL` (500).
- **Validation:** zod schema per endpoint body/query, parsed before any logic.
- **Time:** store UTC `DateTime`; convert with luxon using `patient.timezone` at the edges (materialization input, UI display, IVR text). Local dose slots are `"HH:mm"` strings.
- **Money:** `Float` rupees in DB (MVP), render via `money.ts` (`₹` + Indian grouping); savings rounded to integer ₹.
- **Logging:** pino; one line per API request (`route, ms, status`), one per external call (`service, op, ms, ok`), one per state transition (`doseEvent {id} scheduled→calling`).
- **IDs:** cuid everywhere.

## 7. API reference (route handlers under `src/app/api/`)

Single-household product: endpoints resolve "the" household/patient server-side; `patientId` never required from the client.

### 7.1 Household
- **`GET /api/household`** → `200 { household: { id, caregiverName, uiLanguage, patient: { id, name, phoneE164, language, voiceGender, timezone } } }` or `404` (drives onboarding redirect).
- **`POST /api/household`** body `{ caregiverName, uiLanguage, patient: { name, phoneE164, language, voiceGender } }` → `201` same shape. `409` if one already exists.
- **`PATCH /api/household`** — partial of the same body → `200`.

### 7.2 Scan & medications
- **`POST /api/scan`** — `multipart/form-data`, field `photos` ×1–5.
  Behavior: save originals → `sharp` resize (long edge 1600, jpeg q80) → per-photo extraction calls in `Promise.all` (§8.2) → merge + dedupe (§8.2.1) → normalization call (§8.3) → high-risk tagging + expiry warnings.
  → `200 { scanBatchId, medications: DraftMedication[], imageIssues: string[] }`. Synchronous (≤25 s budget). Errors: `VALIDATION` (0 or >5 files, >10 MB, bad type), `UPSTREAM_OPENAI`.
- **`POST /api/medications`** body `{ scanBatchId?: string, medications: DraftMedication[] }` (caregiver-edited) → persists all with `status:"active"` → `201 { medications: Medication[] }`. Does **not** auto-run interactions (client calls the two `run` endpoints next so the UI can show phased progress).
- **`GET /api/medications`** → `200 { medications: Medication[] }` (active only; salts parsed).
- **`PATCH /api/medications/:id`** — partial DraftMedication fields → `200 { medication }`.
- **`DELETE /api/medications/:id`** → archives (status=`archived`), deactivates its schedules → `200 { ok: true }`.

### 7.3 Interactions
- **`POST /api/interactions/run`** → runs the 3-layer engine (PRD F3, §8.4) over active meds → replaces previous **unacknowledged** findings → `200 { findings: Finding[], checkedMedsCount, ranAt }`. Partial-degradation: if openFDA unreachable, still returns curated(+llm) results with `"degraded": "openfda_unavailable"` field.
- **`GET /api/interactions`** → `200 { open: Finding[], acknowledged: Finding[], lastRunAt }`.
- **`POST /api/interactions/:id/acknowledge`** → `200 { finding }`.

### 7.4 Generics & savings
- **`POST /api/generics/run`** → matcher (PRD F4) over active meds → replaces previous matches → `200 { matches: GenericMatch[], totalMonthlySavingsInr: number }` (total = sum of high+medium confidence rows).
- **`GET /api/generics`** → same shape as run (from DB).

### 7.5 Schedules & doses
- **`POST /api/schedules`** body `{ schedules: [{ medicationId, times: string[], foodRelation, startDate: "YYYY-MM-DD" }] }` — bulk upsert (one active schedule per medication; re-POST replaces) → `201 { schedules }` → then immediately materializes today+tomorrow DoseEvents (same helper the worker uses).
- **`GET /api/schedules`** → `200 { schedules }` (with medication summaries).
- **`GET /api/schedules/suggest`** → LLM suggestions (§8.5) → `200 { suggestions: [{ medicationId, times, foodRelation, lowConfidence }] }`.
- **`GET /api/today`** → `200 { groups: [{ time: "20:00", scheduledAtUtc, status: "upcoming|confirmed|missed|mixed", meds: [{ medicationId, brandName, count }], doseEventIds }] }` (grouped by slot, patient-local day).
- **`POST /api/dose-events/:id/mark`** body `{ status: "confirmed"|"skipped" }` → `200 { doseEvent }` (`confirmedVia:"caregiver_manual"`).
- **`GET /api/adherence?days=7`** → `200 { percent, confirmed, missed, byDay: [{ date, confirmed, missed, pending }] }` (AC-11.1 formula).

### 7.6 Alerts
- **`GET /api/alerts`** → `200 { alerts }` (unread first). **`POST /api/alerts/:id/read`** → `200`.

### 7.7 Voice, calls, audio
- **`POST /api/tts/preview`** body `{ time: "HH:mm" }` → builds that slot's script for the patient (02-DESIGN §7.2) → ensures cached mp3 (§11) → `200 { audioUrl: "/api/audio/{hash}.mp3", scriptText }`.
- **`POST /api/calls/now`** body `{ time: "HH:mm" }` *(DEMO_MODE only)* → finds/creates today's DoseEvents for that slot, sets `scheduledAtUtc=now`, invokes the same `placeGroupReminder()` used by the worker → `200 { reminderCallId }`. `409 TELEPHONY_DISABLED` if Twilio not configured.
- **`POST /api/simulate/start`** body `{ time }` → creates `ReminderCall{mode:"simulated"}`, transitions events to `calling` → `200 { reminderCallId, audio: { medlistUrl, menuUrl, thanksUrl, noinputUrl } }`.
- **`POST /api/simulate/digits`** body `{ reminderCallId, digits: "1"|"2"|"" }` → routes through the **same** `handleGatherResult()` in `lib/calls.ts` as the Twilio webhook (AC-10.1) → `200 { outcome, doseStatus }`.
- **`GET /api/audio/:file`** → streams `storage/audio/{file}` with `Content-Type: audio/mpeg`; 404 on path traversal or miss (validate `^[a-f0-9]{64}\.mp3$`).
- **`GET /api/photos/:batchId/:file`** → streams stored photo (same traversal guard).

### 7.8 Twilio webhooks (all validate `X-Twilio-Signature`; reply TwiML `text/xml`)
- **`POST /api/twilio/voice/reminder?callId={ReminderCall.id}&replay={0|1}`** → TwiML §10.3.
- **`POST /api/twilio/voice/gather?callId=...`** — form field `Digits` → `handleGatherResult()` → TwiML (thanks / replay / goodbye).
- **`POST /api/twilio/status?callId=...`** — form fields `CallSid`, `CallStatus` → finalize attempt: not confirmed ⇒ retry-or-missed logic (§12.3) → `204`.

### 7.9 Demo
- **`POST /api/demo/seed`** *(DEMO_MODE only)* → wipes DB, loads CSVs, creates Kamla Devi household + 5 demo medications + schedules per `04-DATA-FLOW-INTEGRATION.md` §10.6 → `200 { ok, summary }`.

## 8. OpenAI integration

### 8.1 Client & call wrapper (`src/lib/openai.ts`)
```ts
import OpenAI from "openai";
export const openai = new OpenAI(); // key from env

// callLLM: Responses API + strict JSON-schema output + retry(2, backoff 1s/4s on 429/5xx)
// + one "JSON repair" retry if zod parse of output fails.
export async function callLLM<T>(opts: {
  system: string;
  user: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }>;
  schemaName: string; jsonSchema: object; zodSchema: z.ZodType<T>;
}): Promise<T> {
  const resp = await openai.responses.create({
    model: config.openaiModel,
    input: [
      { role: "system", content: [{ type: "input_text", text: opts.system }] },
      { role: "user", content: opts.user },
    ],
    text: { format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.jsonSchema } },
  });
  return opts.zodSchema.parse(JSON.parse(resp.output_text));
}
```
> SDK note: written for `openai` npm v6 Responses API. If the installed SDK's parameter names differ, adapt the wrapper only — prompts/schemas below are transport-independent. (Fallback: `chat.completions.create` with `response_format: { type:"json_schema", json_schema:{...} }` and image parts `{ type:"image_url", image_url:{ url } }`.)

Images are passed as `data:image/jpeg;base64,...` URLs of the **resized** files.

### 8.2 Prompt 1 — Strip extraction (vision; one call **per photo**, parallel)

`EXTRACTION_SYSTEM` (verbatim):
```
You are a meticulous pharmacy OCR specialist for INDIAN medicine packaging (blister strips, bottles, tubes).
Extract every distinct medicine visible in the image. Rules:
1) NEVER guess. If a value is not clearly readable, output null and add a warning string like "expiry not visible for <brand>".
2) Indian conventions: composition lines read like "Each film coated tablet contains: Telmisartan IP 40 mg". Brand name is the large text on the front foil. MRP appears as "M.R.P. ₹234.00" or "Rs.". Expiry appears as "EXP. 08/2027" or "EXP AUG 2027" → output "2027-08". Batch appears as "B.No." or "Batch No.".
3) A photo may contain several strips; the SAME strip's front and back may both be visible — report each physical medicine once.
4) Strength: number + unit exactly as printed (mg, mcg, g, IU, ml). For syrups, strength may be per 5 ml.
5) MRP is for the whole pack; also extract pack size if printed ("15 Tablets" / "1x15").
6) fieldConfidence: your honest 0–1 confidence per field group.
Output strictly via the provided JSON schema. Do not include any medicine not visible in the image.
```
User content: `{ type:"input_text", text:"Extract all medicines from this photo." }` + one `input_image`.

`EXTRACTION_SCHEMA` (JSON Schema, `strict: true` — all fields required, nullable where shown):
```json
{ "type":"object","additionalProperties":false,
  "properties":{
    "medications":{"type":"array","items":{"type":"object","additionalProperties":false,
      "properties":{
        "brandName":{"type":["string","null"]},
        "composition":{"type":"array","items":{"type":"object","additionalProperties":false,
          "properties":{"saltNameAsPrinted":{"type":"string"},
                        "strengthValue":{"type":["number","null"]},
                        "strengthUnit":{"type":["string","null"],"enum":["mg","mcg","g","IU","ml","mg_per_5ml",null]}},
          "required":["saltNameAsPrinted","strengthValue","strengthUnit"]}},
        "form":{"type":"string","enum":["tablet","capsule","syrup","drops","injection","cream","other"]},
        "packSize":{"type":["integer","null"]},
        "mrpInr":{"type":["number","null"]},
        "expiryDate":{"type":["string","null"],"description":"YYYY-MM"},
        "batchNumber":{"type":["string","null"]},
        "manufacturer":{"type":["string","null"]},
        "fieldConfidence":{"type":"object","additionalProperties":false,
          "properties":{"brandName":{"type":"number"},"composition":{"type":"number"},
                        "mrpInr":{"type":"number"},"expiryDate":{"type":"number"}},
          "required":["brandName","composition","mrpInr","expiryDate"]},
        "warnings":{"type":"array","items":{"type":"string"}}},
      "required":["brandName","composition","form","packSize","mrpInr","expiryDate","batchNumber","manufacturer","fieldConfidence","warnings"]}},
    "imageIssues":{"type":"array","items":{"type":"string"}}},
  "required":["medications","imageIssues"] }
```

#### 8.2.1 Merge & dedupe (deterministic code, `extraction.ts`)
Key = `lower(brandName)` + primary salt strength; same key across photos ⇒ merge, keeping the higher-confidence value per field; union warnings. No brandName ⇒ key on composition. Then compute expiry warnings (expired / ≤60 days) against today.

### 8.3 Prompt 2 — Normalization (text; one call for the whole batch)

`NORMALIZATION_SYSTEM` (verbatim):
```
You are a drug-nomenclature normalizer. Input: JSON of medicines extracted from Indian packaging.
For each medicine, and WITHOUT adding or removing medicines:
1) salts: canonical lowercase INN per component (e.g. "telmisartan"), strength normalized (mcg stays mcg; do not convert IU).
2) fdaSearchName per salt: the US Adopted Name used by FDA labels when it differs from INN (e.g. paracetamol → "acetaminophen", salbutamol → "albuterol"); otherwise repeat the INN.
3) displayGeneric: single salt → the INN; combination → INNs joined with " + ".
4) usualFrequencyHint: typical adult frequency for this exact strength/formulation as commonly prescribed in India, as {timesPerDay, timing:["morning","evening",...]} — or null when regimens vary widely. This is a HINT for UI pre-fill only, never a recommendation.
5) Correct obvious OCR spelling errors in salt names (e.g. "telmisartn" → "telmisartan"); if you cannot recognize a salt, keep it verbatim and set fdaSearchName to it unchanged.
Output strictly via the schema, same order as input.
```
Schema `normalization_result`: array aligned to input with `{ salts: Salt[], displayGeneric: string, usualFrequencyHint: {...}|null }` (write the JSON Schema analogous to §8.2). High-risk tagging is **not** LLM's job — done in code against `data/highrisk_meds.csv`.

### 8.4 Prompt 3 — Interaction synthesis (text; one call per run)

Inputs assembled by `interactions.ts`: (a) med list `[ {brand, salts[]} ]`; (b) curated hits already found (context — LLM must not restate them); (c) per-salt openFDA excerpts (§9), each tagged `source:"openfda:<salt>"`, truncated 6 000 chars.

`INTERACTION_SYSTEM` (verbatim):
```
You are a cautious clinical-information assistant. You are given (1) a patient's medicine list with active salts, (2) interaction findings already confirmed from a curated database (context only — do NOT repeat these pairs), and (3) excerpts from US FDA drug labels for these salts.
Task: identify drug–drug interactions BETWEEN the listed salts that are explicitly supported by the provided label excerpts.
Rules:
1) For each finding, quote the supporting sentence(s) VERBATIM from the excerpts (≤300 chars) and name which salt's label it came from. Never fabricate or paraphrase inside evidenceQuote.
2) severity: "major" only if the label uses terms like contraindicated / serious / fatal / avoid combination; "moderate" for monitor / adjust dose / caution; "minor" otherwise.
3) If you strongly suspect an interaction between two listed salts but the excerpts do NOT support it, you may output it with source "llm_suspected" and severity "unverified", evidenceQuote null.
4) explanationEn/explanationHi: ≤3 short sentences, 8th-grade reading level, name both medicines by brand. explanationHi in simple everyday Hindi (Devanagari).
5) actionEn/actionHi: one sentence; MUST tell the user to consult their doctor or pharmacist before the next dose.
6) Only pairs among the given salts. No food/alcohol/disease interactions. No duplicates of curated pairs.
```
Schema `interaction_result`: `{ findings: [{ saltA, saltB, severity, source ("openfda"|"llm_suspected"), evidenceQuote (string|null), evidenceLabelSalt (string|null), explanationEn, explanationHi, actionEn, actionHi }] }`.

Post-validation in code (hard gates, PRD AC-4.3): drop any finding whose salts aren't in the med list; `source="openfda"` without a quote that appears verbatim (case-insensitive substring) in the supplied excerpts ⇒ demote to `llm_suspected/unverified`; `severity="major"` allowed only for curated or quoted-openfda findings; append consult-sentence if missing. Curated CSV rows matched in code are inserted directly with `source:"curated"` (bilingual text comes from the CSV itself).

### 8.5 Prompt 4 — Schedule suggestion (text; one call per batch)
`SCHEDULE_SYSTEM` (verbatim):
```
You suggest reminder time slots for a medicine list, for UI pre-fill only.
Allowed anchors: 08:00 (morning), 14:00 (afternoon), 20:00 (evening), 22:00 (night).
Use each medicine's usualFrequencyHint; map 1x/day→["08:00"], 2x/day→["08:00","20:00"], 3x/day→["08:00","14:00","20:00"], bedtime→["22:00"].
foodRelation from common practice for that salt (e.g. metformin → after_food); use "any" when unsure.
If hint is null: ["08:00"], "any", lowConfidence=true. Never exceed the hinted frequency. Output via schema, same order as input.
```
Schema: `{ suggestions: [{ times: string[], foodRelation: "before_food"|"after_food"|"with_food"|"any", lowConfidence: boolean }] }`.

### 8.6 Cost & token guards
Resize before vision (≤1600 px, jpeg q80, `sharp`); ≤5 photos/scan; openFDA excerpts truncated to 6 000 chars/salt; single normalization/interaction/schedule call per run (never per-med loops). Expected demo-week spend: see `05-TECH-STACK.md` §8.

## 9. openFDA integration (`src/lib/openfda.ts`)

- Request: `GET https://api.fda.gov/drug/label.json?search=openfda.generic_name:"{fdaSearchName}"&limit=2[&api_key=...]` (URL-encode quotes). On 404/no results, retry once with `openfda.substance_name:"{NAME}"`.
- Parse first result: concatenate string arrays `boxed_warning[]`, `drug_interactions[]`, `contraindications[]`, `warnings[]` (that order), join `\n`, truncate 6 000 chars → `{ salt, excerpt, found: boolean }`.
- Cache in `ApiCache` key `openfda:label:{fdaSearchName}` for **7 days**.
- Rate limits (documented): no key ≈ 240 req/min and 1 000 req/day per IP; with free key 120 000/day. MVP traffic is trivial; still fetch salts sequentially with 150 ms spacing.
- Failure ⇒ throw `UPSTREAM_OPENFDA`; `interactions/run` catches it and degrades (curated-only + `degraded` flag → UI banner per 02-DESIGN.md S5).

## 10. Twilio integration (`src/lib/twilio.ts`)

### 10.1 Placing a call (worker & `/api/calls/now`)
```ts
await twilioClient.calls.create({
  to: patient.phoneE164,
  from: config.twilioFromNumber,
  url: `${config.publicBaseUrl}/api/twilio/voice/reminder?callId=${call.id}`,
  statusCallback: `${config.publicBaseUrl}/api/twilio/status?callId=${call.id}`,
  statusCallbackEvent: ["completed"],
  timeout: 25,          // ring seconds before no-answer
});
```
Persist returned `sid` → `ReminderCall.twilioCallSid`.

### 10.2 Webhook security
Every `/api/twilio/*` handler: reconstruct full public URL (`PUBLIC_BASE_URL` + path + query), read raw form params, `twilio.validateRequest(authToken, signatureHeader, url, params)`; invalid ⇒ `403`. (Signature is computed against the ngrok URL — this is why `PUBLIC_BASE_URL` must match exactly.)

### 10.3 TwiML — reminder (`POST /api/twilio/voice/reminder`)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>{BASE}/api/audio/{medlistHash}.mp3</Play>
  <Gather numDigits="1" timeout="8" method="POST"
          action="{BASE}/api/twilio/voice/gather?callId={id}">
    <Play>{BASE}/api/audio/{menuHash}.mp3</Play>
  </Gather>
  <!-- reached only on gather timeout -->
  <Gather numDigits="1" timeout="8" method="POST"
          action="{BASE}/api/twilio/voice/gather?callId={id}">
    <Play>{BASE}/api/audio/{menuHash}.mp3</Play>
  </Gather>
  <Play>{BASE}/api/audio/{noinputHash}.mp3</Play>
</Response>
```
(`replay=1` variant returns the same document — used when the gather handler answers digit 2.)

### 10.4 TwiML — gather (`POST /api/twilio/voice/gather`)
`Digits === "1"` → `handleGatherResult(call,"1")` marks group events `confirmed` (`confirmedVia:"ivr_dtmf"`), call `outcome:"confirmed"`; respond:
```xml
<Response><Play>{BASE}/api/audio/{thanksHash}.mp3</Play><Hangup/></Response>
```
`Digits === "2"` → respond `<Response><Redirect method="POST">{BASE}/api/twilio/voice/reminder?callId={id}&amp;replay=1</Redirect></Response>` (max 1 replay — track `replay` param; beyond that treat as no-input).
Anything else → return the menu gather block once more.

### 10.5 Status callback (`POST /api/twilio/status`)
Update `twilioStatus`. If `outcome` ≠ `confirmed`: run retry-or-missed (§12.3). Answered-but-no-keypress ⇒ `outcome:"no_input"`; `busy|no-answer|failed|canceled` ⇒ `outcome:"not_answered"`.

### 10.6 Trial-account constraints (accepted)
Only verified numbers callable; trial preamble plays before our audio; demo phone must be pre-verified in Twilio console (`05-TECH-STACK.md` §4.2).

## 11. TTS pipeline (`src/lib/tts.ts`)

1. Build script text via `ivr/scripts.ts` (verbatim templates, 02-DESIGN.md §7.2; counts as Hindi words; ≤40 s rule → if >5 meds, split into two medlist audios).
2. `hash = sha256(`${language}|${voice}|${scriptText}`)`; if `AudioAsset` exists → reuse.
3. Else: `openai.audio.speech.create({ model, voice, input: scriptText, instructions: TTS_INSTRUCTIONS, response_format: "mp3" })` → write `storage/audio/{hash}.mp3` → insert `AudioAsset`. `TTS_INSTRUCTIONS` = fixed string in 02-DESIGN.md §7.3.
4. Static per-language assets (`menu`, `thanks`, `goodbye_noinput`, `goodbye_final`, onboarding samples) are pre-generated by `scripts/pregen-audio.ts` (run in seed + Day-3 demo prep).

## 12. Worker design (`worker/`)

### 12.1 Loop
```
every WORKER_TICK_SECONDS:
  try { await materializeDoseEvents(); await processDueReminders(); }
  catch (e) { log; continue; }   // a tick must never kill the loop
```

### 12.2 `materializeDoseEvents()`
For each active Schedule: for day ∈ {today, tomorrow} (patient tz, within start/end dates): for each `HH:mm` in times → `scheduledAtUtc = zonedToUtc(day, time)`; skip if < now − 30 min (don't create already-stale events at boot); `upsert` on `(scheduleId, scheduledAtUtc)` → status `scheduled`.

### 12.3 `processDueReminders()`
1. Due events: `status="scheduled" AND scheduledAtUtc <= now AND (nextAttemptAtUtc IS NULL OR nextAttemptAtUtc <= now)`.
2. Group by `(patientId, scheduledAtUtc)`.
3. Per group: build medlist script → ensure TTS assets → create `ReminderCall(attempt = min(events.attempts)+1)` → set events `calling` → Twilio create-call (§10.1). Twilio create fails ⇒ events revert to `scheduled`, `nextAttemptAtUtc = now + RETRY_DELAY_MINUTES`, log `UPSTREAM_TWILIO`.
4. **Retry-or-missed** (invoked from status callback, and by a sweep here for calls stuck `calling` > 5 min): events `attempts += 1`; if `attempts < MAX_CALL_ATTEMPTS` → status `scheduled`, `nextAttemptAtUtc = now + RETRY_DELAY_MINUTES`; else → status `missed` + one `CaregiverAlert(type:"missed_dose")` per group (bilingual message: EN `"{name} did not confirm the {timeLabel} medicines ({n} calls tried)."` / HI mirror).
5. Telephony disabled (no Twilio env) ⇒ log-only mode: events stay `scheduled`; UI relies on simulated calls. Never crash.

## 13. Error handling, resilience, performance
- Route handlers wrap logic in `withErrorBoundary()` mapping `AppError` → §6 shape; unexpected → 500 `INTERNAL` + stack logged.
- External-call retries: OpenAI ×2 (1 s/4 s backoff); openFDA ×1; Twilio create-call not retried inline (worker cadence retries).
- Degradation matrix lives in `04-DATA-FLOW-INTEGRATION.md` §12 — implement every row.
- Budgets (PRD §8): scan ≤25 s (parallel photos), interactions ≤20 s, TTS ≤5 s cached-miss, call placed ≤90 s after slot.

## 14. Security & privacy
- Local-first: SQLite + `storage/` only; `.gitignore`: `storage/`, `prisma/dev.db`, `.env*`.
- Public surface via ngrok = audio (unguessable sha256 names, path-validated), photos endpoint (batch cuid + filename validation), Twilio webhooks (signature-validated), and the app UI itself (accepted demo risk — note on slide; optionally enable ngrok basic auth, documented in `05-TECH-STACK.md` §4.3).
- No third-party analytics; pino logs redact `phoneE164` (log last 4 digits).
- `npm run purge` → `scripts/purge.ts`: truncates all tables, deletes `storage/**`.

## 15. Testing strategy (vitest; fixtures in `tests/fixtures/`)
| Suite | Covers | Key fixtures |
|---|---|---|
| `generics.test.ts` | salt+strength matching, confidence tiers, savings math incl. AC-6.3 seed numbers | `janaushadhi_products.csv`, demo meds |
| `interactions.test.ts` | curated matcher (warfarin+aspirin), evidence-gate demotion, severity gating (AC-4.3), consult-line append | canned openFDA response JSON, canned LLM output |
| `materialize.test.ts` | idempotency (re-run ⇒ no dupes), tz conversion, start/end bounds | frozen luxon clock |
| `calls.test.ts` | `handleGatherResult` digits 1/2/none; retry-or-missed transitions; alert creation (AC-9.3/9.4, AC-10.1) | twilio webhook form payloads |
| `extraction-merge.test.ts` | front/back merge, dedupe, expiry warnings | two canned extraction JSONs |
| Manual E2E | PRD §14 demo script checklist, run daily from Day 3 | demo kit strips |
LLM calls are **never** made in tests — `openai.ts` exports an injectable interface; tests pass canned outputs.

## 16. Build & run (details in `05-TECH-STACK.md`)
`npm run dev` (Next, :3000) · `npm run worker` (tick loop) · `npm run seed` · `npm run demo:seed` · `npm run pregen-audio` · `npm run purge` · `npm test` · `ngrok http 3000` → set `PUBLIC_BASE_URL` → restart both processes.
