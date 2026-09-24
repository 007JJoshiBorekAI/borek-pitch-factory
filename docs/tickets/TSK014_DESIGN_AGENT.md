# TSK-014 — Design Agent

**Status:** Phases 1–4 implemented; rendered visual acceptance still pending  
**Owner:** Blenard Tahiraj  
**Branch:** `bt/tsk014-design-agent`  
**Depends on:** TSK-010 design tokens (schema 2.0); TSK-012 content agent (not integrated)

## Assignment

From `docs/tickets/TSK_ASSIGNMENT.md`:

> Output carries the CI and is judged sendable without rework against the reference deck.

**TSK-014 does not yet meet full sendability acceptance.** Phase 4 aligns contracts
and deterministic checks with the Arbios definitive master. `visual_acceptance`
remains `false` until a generated deck is rendered and compared against the reference.

## What is implemented

| Phase | Module | Role |
| --- | --- | --- |
| **1** | `apps/api/services/gamma/design_compliance.py` | Deterministic design-rule validation against TSK-010 tokens and JJ-31 stage profiles |
| **2** | `apps/services/api/app/services/gamma_stage.py` | Pre-render hook: `validate_gamma_design_compliance()` before Gamma provider invocation |
| **3** | `apps/api/services/gamma/reference_deck_compliance.py` | Structural reference-deck comparison |
| **4** | `design_configuration.py`, `layout_map.py`, `visual_contract.py` | Arbios master alignment, layout mapping, visual contract enforcement |

## Phase 4 — Arbios definitive master

**Authority:** Arbios confirmed `Borek Master Presentation.html` and
`Ai Tech Use Case EN 1.pptx` as definitive (no further approval gate).

### Contracts added/updated

| File | Purpose |
| --- | --- |
| `packages/contracts/borek_design_tokens.json` | Schema 2.0 — navy/slate palette, Inter scale, logo/footer rules |
| `packages/contracts/arbios_master_layout_registry.json` | F1/F2/F3 + L01–L24 layouts |
| `packages/contracts/gamma_arbios_layout_map.json` | Journey `layout_id` → Arbios layout |
| `packages/contracts/reference_deck_visual_contract.json` | Deterministic visual checks |
| `packages/contracts/use_case_presentation_reference.json` | PPTX narrative structure (not colours) |
| `packages/contracts/fixtures/reference_deck/manifest.json` | Deepening structural fixture |

### Pre-render enforcement

`build_gamma_request()` now validates payloads against:

- JJ-31 stage profiles and commercial safeguards (unchanged)
- Arbios layout mapping for every card in the payload
- Full expected `design_configuration` from approved tokens (colours, canvas, footer, logos)

This does **not** mutate payloads or call the Gamma provider.

### Reference-deck compliance

When a manifest is configured, Phase 3 runs:

1. Structural checks (stage, layout order, slots, pricing/logo gates)
2. Deterministic visual-contract checks via `visual_contract.py`

`ReferenceDeckComplianceResult.visual_acceptance` remains **`false`** without render evidence.

## Deterministic checks (Phases 1–4)

- Known journey stage and stage-profile slot allow-list
- Forbidden runtime branding overrides
- Pricing and commercial-content restrictions by stage
- Client-logo eligibility by stage
- Ungrounded price refusal
- TSK-010 ↔ JJ-26 locked-key contract alignment
- Arbios layout mapping for each Gamma card
- Design configuration matches schema 2.0 tokens (canvas, footer, colours, typography)
- Visual contract footer, canvas, logo anchors, Inter font

## Remaining limitations

1. **Gamma theme rebuild** — `GAMMA_THEME_ID` must be rebuilt in Gamma workspace to
   apply navy palette and logo placement physically. Contracts enforce expected config only.
2. **Rendered visual acceptance** — no pixel/render comparison until a staging deck exists.
3. **First Contact** — `FIRST_MEETING_PPT_PROFILE_UNFROZEN` unchanged.
4. **Fallback renderer** — `apps/renderer/design_system/tokens/` not aligned (separate work).
5. **Logo SVG assets** — `logo-dark-2.svg` / `logo-white-2.svg` referenced but not vendored in repo.

## Explicit non-goals

- Paid Gamma provider calls in tests
- Claiming visual approval without render evidence
- Overwriting journey stage profiles or slot provenance rules
- Importing PPTX Office theme colours

## Tests

| Suite | Path |
| --- | --- |
| Phase 1 | `tests/unit/gamma/test_tsk014_design_compliance.py` |
| Phase 2 | `tests/unit/gamma/test_tsk014_gamma_prerender.py` |
| Phase 3 | `tests/unit/gamma/test_tsk014_reference_deck_compliance.py` |
| Phase 4 | `tests/unit/gamma/test_tsk014_phase4_arbios_contract.py` |
| TSK-010 | `tests/unit/contracts/test_borek_design_tokens.py` |

## Extraction tool

`tools/reference_deck/extract_arbios_master.py` — re-extract layout inventory from HTML master.
