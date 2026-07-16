# DawaiSaathi — Free Demo and Auth Experiment Boundary

| | |
|---|---|
| **Status** | Approved implementation decision |
| **Scope** | Free, local demo only; does not change the product's production architecture |
| **Supersedes** | The former absolute “no auth” rule only for a non-authoritative UX experiment |

## 1. Approved demo runtime

| Concern | Decision | Non-negotiable guardrail |
|---|---|---|
| Health data | SQLite through Prisma on the demo laptop | The SQLite file, uploaded medicine images, phone numbers, schedules, calls, and adherence history stay local. |
| Authentication | Supabase Free **experiment only** | It may demonstrate sign-up, sign-in, and session UI, but it is not a source of access control for the local health-data APIs. |
| Voice | Twilio trial | Call only verified presenter/demo phone numbers. Keep the simulated-call path ready for every rehearsal. |
| Reminders | Local `npm run worker` process | Start it in a second terminal for the demo; it is deliberately not deployed to a serverless cron. |
| AI | OpenAI or NVIDIA NIM | A hard local request budget applies before scans or generated audio are requested. |

## 2. Why Supabase Auth must remain isolated

The local MVP has one unpartitioned SQLite household. Adding a cloud login in front of it without an ownership model would create the appearance of protection without enforcing it. Therefore, until the migration gates below are completed:

1. Do not upload patient, caregiver, medication, image, schedule, call, adherence, or interaction data to Supabase.
2. Do not treat a Supabase session as authorization for any existing local health-data route.
3. Do not show login as a claim that the demo is multi-user, cloud-synced, or access-controlled.
4. Keep the experiment opt-in and disabled by default when its credentials are absent.

The experiment is useful for validating the sign-in flow and future user-facing copy. It is not a security feature for this demo.

## 3. Configuration and demo checklist

Keep real secrets only in `.env`, never in the repository or demo screenshots.

```bash
# Terminal 1 — application
npm run dev

# Terminal 2 — reminder worker
npm run worker

# Optional Terminal 3 — only for live Twilio trial calls
ngrok http 3000
```

Before a live-call rehearsal:

1. Confirm `DEMO_MODE=true` and seed only synthetic/demo information.
2. Confirm the Twilio caller ID and each destination number are verified in the trial console.
3. Update `PUBLIC_BASE_URL` with the current ngrok HTTPS URL, then restart the app and worker.
4. Start with the simulated-call rehearsal; use live Twilio only after it passes.
5. Keep the worker terminal visible so call state and errors are observable.

For the selected LLM provider, use a separate demo key, set the provider-side budget/alerts available to you, and limit rehearsals to seeded scan/audio fixtures once the flow is proven. API usage is metered; there is no assumed unlimited free tier.

The app adds a second, fail-closed layer: before any uncached network request, it atomically reserves a local SQLite slot. The default `.env.example` allows at most 12 LLM attempts and 12 new TTS generations per `DEFAULT_TZ` day. Failed attempts still count, cached audio does not, and data erasure does not reset the cap. Change either value only deliberately; set it to `0` to block that class of OpenAI request. Run `npm run db:push` once after pulling this change so the budget table exists.

## 4. Promotion gates for real authentication

Supabase Auth can become real access control only in a separate cloud-migration milestone. All of these must be complete first:

1. Move the source-of-truth data from local SQLite to a managed PostgreSQL database and add an immutable user/household owner ID to every protected record.
2. Enforce authorization on every server route and background-worker query; test cross-household denial explicitly.
3. If browser access goes directly to Supabase, enable Row Level Security and write policies based on the authenticated user and household membership. Never rely on client filtering.
4. Define consent, deletion/export, retention, audit logging, backups, incident response, and a privacy notice appropriate to health-related data.
5. Re-evaluate Indian telephony, data residency, and privacy obligations before inviting real families.

Until then, a missing Supabase configuration must leave the local demo fully usable and must not block scan, schedule, simulated-call, or worker flows.

## 5. References for the implementation milestone

- Supabase Auth and SSR guidance: <https://supabase.com/docs/guides/auth>
- Supabase Row Level Security guidance: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Twilio Voice trial limitations: <https://www.twilio.com/docs/usage/trials/try-out-voice>
- OpenAI API pricing: <https://developers.openai.com/api/docs/pricing>
