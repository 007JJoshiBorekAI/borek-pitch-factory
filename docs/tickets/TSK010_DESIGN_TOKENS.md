# TSK-010 — Approved Borek design tokens

**Status:** schema 2.0 — Arbios definitive master aligned  
**Owner:** Blenard Tahiraj  
**Consumers:** TSK-014 Design Agent

## Authority

Arbios confirmed the following as **definitive presentation references**:

- `Borek Master Presentation.html` — visual CI, grid, typography, layouts
- `Ai Tech Use Case EN 1.pptx` — use-case narrative structure only (not colours)

Machine-readable contract: `packages/contracts/borek_design_tokens.json` (`schema_version: 2.0`).

JJ-26 slot rules, stage profiles, and commercial safeguards in `gamma_template.json`
remain authoritative for journey structure.

## Three branding layers

| Layer | Role | Location |
| --- | --- | --- |
| **A. Approved presentation branding** | Arbios master CI for Gamma decks and the Design Agent | `packages/contracts/borek_design_tokens.json` |
| **B. Fallback renderer technical tokens** | PptxGenJS fallback / Framework export defaults | `apps/renderer/design_system/tokens/` |
| **C. TSK-014 layout mapping** | Gamma journey cards → Arbios master layouts | `packages/contracts/gamma_arbios_layout_map.json` |

## Approved token mapping (schema 2.0)

| Token | Value | Source |
| --- | --- | --- |
| `colors.primary` / `colors.heading` | `#0D1240` navy | Arbios guide slide 03 |
| `colors.body` | `#515C70` slate | Arbios guide slide 03 |
| `colors.kicker` | `#8A90A5` grey | Arbios guide slide 03 |
| `colors.accent` | `#124F94` blue | Arbios AI Suite accent |
| `colors.card_background` | `#FFFFFF` | Arbios guide slide 03 |
| `colors.card_panel` | `#F3F4F8` | Arbios card fill |
| `surfaces.cover.hex` | `#0D1240` | F1 Cover |
| `typography.*` | Inter + px scale | Arbios guide slides 02–03 |
| `borek_logo.placements.content_slide` | top-right, dark logo | Arbios guide slide 02 |
| `borek_logo.placements.cover` | top-left, white logo | Arbios guide slide 02 |
| `footer.left_text` | Borek Solutions Group · boreksolutions.de · Confidential | Arbios guide slide 02 |
| `client_logo.*` | bottom-right on cover/closing | `gamma_template.json` + JJ-27 |

### Superseded JJ-26 values

| JJ-26 value | Replaced by |
| --- | --- |
| `#2C567A` primary | `#0D1240` navy |
| `#0D1D51` heading | `#0D1240` navy |
| `#0072C7` accent | `#124F94` blue (+ semantic accents) |
| bottom-left logo on every card | top-right (content) / top-left (cover/closing) |

## Related contracts (Phase 4)

| File | Purpose |
| --- | --- |
| `arbios_master_layout_registry.json` | L01–L24 + F1/F2/F3 reusable layouts |
| `gamma_arbios_layout_map.json` | Journey `layout_id` → Arbios layout |
| `reference_deck_visual_contract.json` | Deterministic visual checks |
| `use_case_presentation_reference.json` | PPTX narrative structure reference |

## Gamma branding (locked)

Branding is baked into the Gamma theme at build time. Runtime generation sends
**content slots only**. Phase 4 validates the expected design configuration via
`build_gamma_design_configuration()` before provider calls.

Locked request keys (from `gamma_template.json`):

`brand_color`, `theme`, `font`, `logo_override`, `template_css`, `master_id`

## Tests

`tests/unit/contracts/test_borek_design_tokens.py`  
`tests/unit/gamma/test_tsk014_phase4_arbios_contract.py`
