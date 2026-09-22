# BT-34 implementation report — borek-pitch-factory migration

2026-09-22. **BT-34 is not complete.** Stage 1 text intake, prompt integration, research contract, and provider boundaries are ported locally into the new repository. External company research and voice transcription remain unavailable.

## Repository state

| Item | Value |
| --- | --- |
| Repository | `007JJoshiBorekAI/borek-pitch-factory` |
| Branch | `bt/bt34-stage1-intake` |
| Base | `origin/main` @ `e0153bd` |
| Source port | `arvanit1/borek-ai-suite` @ `0ee50779` (reference only; not merged) |

## Transferred functionality

1. Nested `stage1_intake` API with flat DB columns (`027_bt34_stage1_intake.sql`).
2. Canonical field **`client_web_page`** (replaces old `client_website`).
3. `STAGE1_INTAKE` prompt block in extraction, synthesis, and research paths.
4. `stage1_research.schema.json` v1.0 + unknown fixture + codegen registration.
5. `POST …/stage1-research` and `POST …/stage1-voice` (503 stub for nonempty voice).
6. Provider interface with explicit unavailable behavior.
7. Integration with checkpoint-aware `stage_a_orchestration` (preserved).
8. Focused tests: 60 passed (BT-34 + migration + audit + orchestration).

## Preserved new-repo functionality

- Migrations 025 (framework versioning) and 026 (knowledge checkpoints) untouched.
- Checkpoint reuse, `stage_callback`, chapter regeneration, production guards.

## Blockers (unchanged)

1. Approved company research provider absent.
2. Voice transcription + BT-36 summary integration absent.
3. Live/disposable DB migration proof not run.
4. QA-01 sign-off outstanding.

## Not implemented (by design)

- BT-35 client document pipeline
- BT-36 stage output pipelines
