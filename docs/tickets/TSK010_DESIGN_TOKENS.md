# TSK-010 — Approved Borek design tokens

**Status:** implemented (contract + loaders)  
**Owner:** Blenard Tahiraj  
**Consumers:** TSK-014 Design Agent

## Assignment

From `docs/tickets/TSK_ASSIGNMENT.md`:

> CI sheet from Euron is translated into the design tokens used by the design agent.

Jaya confirmed the JJ-26 branding sources are **final**. The machine-readable
contract is `packages/contracts/borek_design_tokens.json`.

## Three branding layers

| Layer | Role | Location |
| --- | --- | --- |
| **A. Approved presentation branding** | JJ-26 CI for Gamma decks and the Design Agent | `packages/contracts/borek_design_tokens.json` |
| **B. Fallback renderer technical tokens** | PptxGenJS fallback / Framework export defaults | `apps/renderer/design_system/tokens/` |
| **C. TSK-014 layout decisions** | How approved tokens are applied on slides | Future Design Agent work |

Per **D4** (`docs/PITCH_FACTORY_EXTENSION_DECISIONS.md`): Gamma is the
presentation branding source of truth. The internal renderer remains a
feature-flagged fallback with its own technical palette until TSK-014 chooses
to align it.

## Approved token mapping

| Token | Value | Source | Design Agent use |
| --- | --- | --- | --- |
| `colors.primary` | `#2C567A` | JJ-26 CI sheet | Primary accent, pills, highlights |
| `colors.heading` | `#0D1D51` | JJ-26 CI sheet | Slide titles, cover headings |
| `colors.accent` | `#0072C7` | JJ-26 CI sheet | Secondary emphasis |
| `colors.card_background` | `#FFFFFF` | JJ-26 CI sheet | Content card backgrounds |
| `surfaces.cover.appearance` | `dark` | JJ-26 CI sheet | Cover/closing dark fields |
| `surfaces.cover.hex` | `null` | — | **Not specified** — do not invent |
| `typography.heading_font` | Inter | JJ-26 CI sheet | Headings |
| `typography.body_font` | Inter | JJ-26 CI sheet | Body copy |
| `borek_logo.placement` | bottom-left header/footer, every card | JJ-26 CI sheet | Gamma theme placement |
| `client_logo.*` | bottom-right on cover/closing, co-brand rules | `gamma_template.json` + JJ-27 | Stage-profile gated co-branding |

### Fallback renderer equivalents (not approved CI)

| Approved | Fallback token | Fallback value |
| --- | --- | --- |
| `colors.primary` | `BorekColors.primary` | `0057B8` |
| `colors.heading` | `BorekColors.text` | `182230` |
| `colors.accent` | — | no dedicated token |
| `typography.heading_font` | `BorekFontFamilies.heading` | Aptos Display |
| `typography.body_font` | `BorekFontFamilies.body` | Aptos |
| `borek_logo.placement` | `BorekBranding.logo` | top-left margin |

## Gamma branding (locked)

Branding is baked into the Gamma theme at build time. Runtime generation sends
**content slots only**.

Locked request keys (from `gamma_template.json`):

`brand_color`, `theme`, `font`, `logo_override`, `template_css`, `master_id`

Environment settings (deployment, not design tokens):

- `GAMMA_THEME_ID` — default `4kv51cbpy4xonmj` per spike notes
- `GAMMA_TEMPLATE_ID` — workspace-specific Gamma template id

## Not specified by approved sources

Do **not** treat these as approved CI values:

| Item | Notes |
| --- | --- |
| Dark cover hex | JJ-26 says “dark cover” only |
| Font sizes / weights | Not in JJ-26 CI sheet |
| Spacing / grid / margins | Renderer uses technical plan defaults (`BorekSpacing`, etc.) |
| Logo asset paths | Renderer ships `logo.png` / `logo-on-light.png`; Gamma uses theme logo |
| Secondary spike accents (`#3B76A6`, `#44546A`) | Documented in spike only, not JJ-26 CI table |
| Gamma body default `#2C2821` | Spike cosmetic note, not JJ-26 |
| Web app CSS (`apps/web/src/app/globals.css`) | Corporate website palette, separate from pitch CI |

## Loaders

| Runtime | Module |
| --- | --- |
| Python (API / agents) | `packages/contracts/presentation_branding.py` → `load_borek_presentation_branding()` |
| TypeScript (renderer / agents) | `apps/renderer/design_system/tokens/presentationBranding.ts` |

## Tests

- `tests/unit/contracts/test_borek_design_tokens.py`
- `apps/renderer/design_system/tokens/presentationBranding.test.ts`
- Existing Gamma contract tests (`tests/unit/gamma/test_jj26_template_contract.py`, `test_gamma_spike.py`)
- Existing fallback renderer token tests (`test:at11`..`test:branding`)
