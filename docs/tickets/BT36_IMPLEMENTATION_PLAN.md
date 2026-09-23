# BT-36 — Implementation plan (Phase 1 complete)

**Branch:** `bt/bt36-stage-outputs`  
**Phase 1 (this pass):** Contracts, fixtures, codegen, contract tests, architecture map  
**Owner:** Blenard Tahiraj

---

## Phase 1 deliverables (done)

| Artifact | Path |
| --- | --- |
| Stage 1 outputs schema | `packages/contracts/stage1_outputs.schema.json` |
| Stage 2 outputs schema | `packages/contracts/stage2_outputs.schema.json` |
| Transcript summary schema | `packages/contracts/transcript_summary.schema.json` |
| Fixtures | `packages/contracts/fixtures/stage1_outputs.*.json`, `stage2_outputs.*.json`, `transcript_summary.*.json` |
| Contract tests | `tests/unit/contracts/test_stage1_outputs_schema.py`, `test_stage2_outputs_schema.py`, `test_transcript_summary_schema.py` |
| Codegen registration | `scripts/generate_pydantic.py`, `scripts/generate_typescript.js` |

---

## Remaining phases (recommended order)

### Phase 2 — Transcript summarization worker

1. Add `TRANSCRIPT_SUMMARIZING` to `JobStage` in `apps/services/api/app/schemas/jobs.py` and stage pipeline tuples.
2. Persist summaries (new table / artifact store keyed by `transcript_id` + `conversation_id`).
3. Implement `apps/api/services/transcript/summarization.py`:
   - Input: parsed speaker turns (redacted via `redact_turns_for_llm`)
   - Output: `transcript_summary.schema.json` validated payload
   - Prompt block: `TRANSCRIPT_SUMMARY_BEGIN … TRANSCRIPT_SUMMARY_END`
4. Wire worker stage in `apps/services/api/app/worker.py` after `TRANSCRIPT_PROCESSING`.
5. API: GET summary alongside existing transcript endpoints (raw turns unchanged for audit).
6. Unit + integration tests with fixture transcripts (no paid provider calls in CI).

### Phase 3 — Redirect downstream consumers to summary-only

Replace raw-transcript prompt injection in:

| Consumer | File | Current behaviour |
| --- | --- | --- |
| Knowledge extraction | `apps/api/services/knowledge_model/extraction.py` | `redact_turns_for_llm` → full turns in prompt |
| Framework synthesis | `apps/api/services/framework/synthesis.py` | Reads knowledge models built from raw turns |
| Follow-up extraction | `apps/api/services/followup/extraction.py` | Accepts raw `transcript: str` |
| Stage A orchestration | `apps/services/api/app/services/stage_a_orchestration.py` | Enqueues extraction/synthesis with transcript sections |
| Guardrails | `apps/api/services/framework/guardrails.py` | Validates `transcript_id` on models |

Each path must load the persisted `TranscriptSummary` and serialize the controlled block only. Add regression tests asserting raw turn text never appears in prompt builders.

### Phase 4 — Stage 1 output generation (First contact)

Job graph extension (First contact):

```
CLIENT_DOCUMENT_PROCESSING
  → STAGE1_RESEARCH (BT-34, existing)
  → STAGE1_OUTPUTS (new — discovery questions, use cases, agenda)
  → PRESENTATION_PLANNING (first_meeting_3_slide profile)
  → GAMMA/PPTX_RENDERING
  → optional FOLLOWUP_* (email)
```

Integration points:

| Step | Entry point |
| --- | --- |
| Intake + documents | `apps/services/api/app/services/first_contact_inputs.py`, BT-35 client document router |
| Research | `POST …/stage1-research` → `generate_stage1_research()` in `apps/api/services/framework/stage1_research.py` |
| Stage 1 outputs | **New** service validating against `stage1_outputs.schema.json` |
| Presentation | `apps/services/api/app/services/framework_generation.py`, presentation planning profile |
| Journey marker | `apps/services/api/app/services/journey_stage.py` — mark first_contact complete when deck + outputs persisted |
| Audit | `apps/services/api/app/services/audit/audit_log.py` — new event types |

### Phase 5 — Stage 2 output generation (Deepening)

Job graph extension (Deepening):

```
TRANSCRIPT_PROCESSING
  → TRANSCRIPT_SUMMARIZING
  → STAGE2_OUTPUTS (call summary, MOM)
  → FRAMEWORK_SYNTHESIZING (summary-fed)
  → PRESENTATION_PLANNING (deepening_adjusted)
  → GAMMA/PPTX
  → FOLLOWUP_* (post-call email)
```

Integration points:

| Step | Entry point |
| --- | --- |
| Transcript upload | Existing transcript router + `first_contact_inputs.py` deepening gate (`TRANSCRIPT_REQUIRED`) |
| Framework enqueue | `enqueue_framework_generate()` in `framework_generation.py` |
| Stage 2 outputs | **New** service validating against `stage2_outputs.schema.json` |
| Adjusted deck | Existing presentation pipeline with BT-31 journey eligibility |

### Phase 6 — Optional email + completion markers

- Reuse JJ-32 follow-up pipeline (`followup_extraction.schema.json`) fed from `TranscriptSummary` or Stage 2 outputs.
- Wire `email_draft` refs on stage output schemas to follow-up artifact IDs.
- Journey completion: extend BT-31 eligibility checks to require stage output artifacts per stage.

### Phase 7 — Voice / Outlook (deferred dependencies)

| Capability | Dependency |
| --- | --- |
| Voice transcription intake | MS-33 (Jaya) |
| Outlook draft send | MS-35 (Mayank) |
| AT-59 live corpus RAG | Mayank / corpus deployment |

---

## Transcript security rule (design)

```
Raw transcript (storage + human API)
        │
        ▼
TRANSCRIPT_SUMMARIZING  ← only stage that may send raw/redacted turns to LLM
        │
        ▼
transcript_summary.schema.json (persisted artifact)
        │
        ├──► extraction_v1 prompts
        ├──► synthesis_v1 prompts
        ├──► followup_extraction_v1 prompts
        ├──► stage2_outputs generation
        └──► presentation planning enrichment
```

- Raw turns remain in `transcripts` / `transcript_sections` tables and existing download APIs.
- Downstream prompt builders must accept `TranscriptSummary` (or its serialized block), never `SpeakerTurn[]` or raw strings.
- `summary_truncated` and `uncertainty_notes` propagate to review UI and audit.

---

## Dependencies requiring Jaya or Mayank

| Item | Owner | Notes |
| --- | --- | --- |
| MS-33 voice → transcript → summarization | Jaya | Same summarization contract; no separate raw path |
| MS-35 Outlook follow-up send | Mayank | Consumes follow-up artifacts referenced by `email_draft` |
| AT-59 live use-case corpus | Mayank | Stage 1 `CorpusSourceRef.entry_id` values |
| MS-32 human review checklist | Jaya | “Check against transcript” uses raw API; generation uses summary |

---

## Test strategy (post Phase 1)

- Contract tests: `tests/unit/contracts/test_stage*_outputs_schema.py`, `test_transcript_summary_schema.py`
- Codegen: `test_pydantic_codegen.py`, `test_typescript_codegen.py` (extend when those lists are updated)
- Integration: full_pipeline tests per stage mirroring BT-34/BT-35 patterns
- Security regression: assert prompt fixtures never contain `turn:` lines from raw ingestion
