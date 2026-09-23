# TSK-014 — Design Agent (Phases 1–3 handoff)

**Status:** Phases 1–3 implemented; full acceptance blocked on reference deck  
**Owner:** Blenard Tahiraj  
**Branch:** `bt/tsk014-design-agent`  
**Depends on:** TSK-010 design tokens; TSK-012 content agent (not integrated)

## Assignment

From `docs/tickets/TSK_ASSIGNMENT.md`:

> Output carries the CI and is judged sendable without rework against the reference deck.

**TSK-014 does not yet meet the full sendability acceptance criterion.** Phases 1–3
deliver deterministic compliance infrastructure only.

## What is implemented

| Phase | Module | Role |
| --- | --- | --- |
| **1** | `apps/api/services/gamma/design_compliance.py` | Deterministic design-rule validation against TSK-010 tokens and JJ-31 stage profiles |
| **2** | `apps/services/api/app/services/gamma_stage.py` | Pre-render hook: `validate_gamma_design_compliance()` before Gamma provider invocation |
| **3** | `apps/api/services/gamma/reference_deck_compliance.py` | Optional structural reference-deck comparison interface |

## Deterministic checks that pass today

Design compliance (Phase 1–2) validates Gamma content payloads for:

- Known journey stage and stage-profile slot allow-list
- Forbidden runtime branding overrides
- Pricing and commercial-content restrictions by stage
- Client-logo eligibility by stage
- Ungrounded price refusal
- TSK-010 ↔ JJ-26 locked-key contract alignment

These checks run **before** the Gamma provider is called. Valid payloads are not
modified by the hook.

## Structural compliance is not visual acceptance

Phase 3 can compare a payload against an optional **structural manifest** (card
order, required slots, forbidden fact kinds). A structural pass means the payload
matches the manifest's layout expectations only.

It does **not** mean:

- Colours, fonts, or spacing match Euron CI visually
- The deck is sendable without rework
- Jaya/QA visual review is complete

`ReferenceDeckComplianceResult.visual_acceptance` is always `false`.

## Approved reference deck: unavailable

Repository search found **no** approved product reference deck:

- No reference PPTX/PDF from Jaya/QA/Euron
- No `packages/contracts/reference_deck_manifest.json`
- `tests/golden_deck/` is an **internal renderer** regression harness using
  fallback tokens — **not** the TSK-014 product reference deck

When no manifest is configured, Phase 3 returns `REFERENCE_DECK_UNAVAILABLE`
rather than a false pass.

## Proposed manifest format (not yet approved)

Phase 3 supports an **internal proposal** for a future QA manifest at:

- `packages/contracts/reference_deck_manifest.json`, or
- `packages/contracts/fixtures/reference_deck/manifest.json`

```json
{
  "schema_version": "1.0",
  "reference_id": "qa-deepening-v1",
  "stage": "deepening",
  "source": "Jaya QA approved deck YYYY-MM-DD",
  "layout_ids": ["COVER_01", "EXECUTIVE_SUMMARY_01"],
  "required_slots": ["cover.title"],
  "pricing_permitted": false,
  "client_logo_permitted": true,
  "forbidden_grounded_fact_kinds": ["pricing"]
}
```

This shape is **not** an approved QA or product contract. Do not add a production
manifest until Jaya/QA confirms the format and supplies the reference deck.

Manifest loading rejects unknown stages and undeclared layout ids. Malformed
on-disk manifests are treated as unavailable during discovery.

## What Jaya/QA must provide

1. **Approved reference deck** (PPTX/PDF) for at least one journey stage
2. **Confirmed structural manifest** derived from that deck (card order, required
   sections, stage restrictions)
3. **Visual acceptance sign-off** against the reference deck
4. **JJ-31 freeze** of the First Contact three-slide profile before a First
   Contact reference baseline

First Contact presentation output remains `unfrozen` (`FIRST_MEETING_PPT_PROFILE_UNFROZEN`)
until JJ-31 finalizes the profile. Do not invent a three-slide mapping.

## Explicit non-goals (Phases 1–3)

- Content generation or planner changes
- Internal PPTX renderer or golden-deck baseline changes
- Live Gamma calls
- Runtime branding overrides
- Claiming full TSK-014 acceptance without reference-deck evidence

## Tests

| Suite | Path |
| --- | --- |
| Phase 1 | `tests/unit/gamma/test_tsk014_design_compliance.py` |
| Phase 2 | `tests/unit/gamma/test_tsk014_gamma_prerender.py` |
| Phase 3 | `tests/unit/gamma/test_tsk014_reference_deck_compliance.py` |
