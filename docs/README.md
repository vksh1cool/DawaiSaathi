# DawaiSaathi — Documentation Index

**DawaiSaathi (दवाई साथी)** — Snap your meds once; it tells your grandma what to take, when, in her own language. One photo of medicine strips → verified med list, drug-interaction safety checks, Jan Aushadhi generic savings, and IVR reminder calls that work on feature phones.

## Reading order

| # | Doc | Answers | Read when |
|---|---|---|---|
| 1 | [`01-PRD.md`](01-PRD.md) | What we're building, for whom, MVP scope, acceptance criteria, safety guardrails, demo script, 5-day plan | Always first |
| 2 | [`02-DESIGN.md`](02-DESIGN.md) | Screens (wireframes S0–S9, M1), design tokens, components, verbatim IVR scripts (Hindi/English), copy rules | Building any UI or the voice flow |
| 3 | [`03-SYSTEM-ARCHITECTURE.md`](03-SYSTEM-ARCHITECTURE.md) | File tree, Prisma schema, every API contract, LLM prompts + JSON schemas, openFDA/Twilio/TTS integration, worker design. **Wins all technical conflicts.** | Building anything backend |
| 4 | [`04-DATA-FLOW-INTEGRATION.md`](04-DATA-FLOW-INTEGRATION.md) | Runtime sequences with example payloads, DoseEvent state machine, seed CSVs (exact rows), caching/idempotency, failure matrix | Wiring flows end-to-end; writing tests |
| 5 | [`05-TECH-STACK.md`](05-TECH-STACK.md) | Exact dependencies + versions, setup commands, Twilio/ngrok/OpenAI account steps, costs | Day 0 setup |

## For the implementing agent

- Requirements carry IDs (`US-n`, `AC-n.m`, `F-n`) — reference them in commits/tests.
- All product decisions are **frozen**; do not re-litigate scope (PRD §11). Defaults are marked *(default)* and live in `src/lib/config.ts`.
- Build order = PRD §15 (Day 1 → Day 5). Each day has a testable gate.
- Non-negotiables to re-read before shipping: PRD §9 (medical safety), Arch §8.4 post-validation gates, Data-Flow §12 failure matrix.
