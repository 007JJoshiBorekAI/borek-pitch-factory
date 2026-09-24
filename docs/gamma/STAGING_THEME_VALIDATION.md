# Staging validation — schema 2.0 Gamma theme (TSK-014)

Use this procedure to validate Jaya's rebuilt theme before production rollout.
Do **not** set `GAMMA_THEME_CONTRACT_VERSION=2.0` or mark visual acceptance until
every checklist item below passes on exported artifacts.

## Staging configuration

Apply only on a **staging** deployment (local docker stack or staging host).
Production must keep `GAMMA_THEME_ID=4kv51cbpy4xonmj` until sign-off.

| Variable | Staging value | Notes |
| --- | --- | --- |
| `PRESENTATION_ENGINE` | `gamma` | Required |
| `GAMMA_EXECUTION_MODE` | `live` | Requires valid `GAMMA_API_KEY` |
| `GAMMA_THEME_ID` | `f5ix6vkbsmlsqg1` | New schema 2.0 theme |
| `GAMMA_TEMPLATE_ID` | `g_o2guwb3zh541ihu` | Existing branded template — verify still valid |
| `GAMMA_API_KEY` | staging key | From Gamma workspace |
| `PUBLIC_API_BASE_URL` | staging API HTTPS origin | Required for deepening client-logo co-brand |
| `GAMMA_THEME_CONTRACT_VERSION` | **unset** | Set to `2.0` only after visual QA |

Template file: [`.env.staging.example`](../../.env.staging.example)

## Template compatibility

The Pitch Factory contract (`borek-branded-standard` / `v1`) is unchanged. At
generation time the live adapter sends **both**:

- `gammaId` → `GAMMA_TEMPLATE_ID` (layout / slot structure)
- `themeId` → `GAMMA_THEME_ID` (colours, fonts, Borek logo, footer)

Most journey stages without a fetchable client logo use
`POST /v1.0/generations/from-template` and rely on the theme for Borek branding.
Deepening / concretisation with a signed client logo use scratch
`POST /v1.0/generations`; the adapter sends only the **client logo** in
`headerFooter.bottomRight`. Borek logo placement is **theme-owned** (schema 2.0).

**Before first live run:** confirm with Jaya that `g_o2guwb3zh541ihu` still
exists in the workspace and accepts `themeId=f5ix6vkbsmlsqg1`.

## Validation run — one Deepening presentation

### Prerequisites

1. Staging env configured from table above (`GAMMA_THEME_CONTRACT_VERSION` unset).
2. Logo assets uploaded to theme (`logo-dark-2.svg`, `logo-white-2.svg`).
3. Opportunity with a grounded Framework and journey stage **Deepening**.
4. Optional: client logo uploaded (≥128px edge) if testing co-brand path.
5. `PUBLIC_API_BASE_URL` reachable by Gamma when testing client logo.

### Generate

1. Start staging stack with staging `.env`.
2. Approve a presentation version for the Deepening opportunity (standard UI flow).
3. Confirm job stage `GAMMA_RENDERING` completes and artifacts persist (PPTX + PDF).

### Export review

Compare exported PPTX/PDF against
`Borek Master Presentation.html` (Arbios definitive master):

| Check | Arbios reference | Pass? |
| --- | --- | --- |
| Cover background | `#0D1240` navy | |
| Cover Borek logo | white, top-left | |
| Content Borek logo | dark, top-right (not bottom-left) | |
| Title colour | `#0D1240` | |
| Body colour | `#515C70` | |
| Accent | `#124F94` | |
| Footer text | `Borek Solutions Group · boreksolutions.de · Confidential` | |
| Footer colour | `#9AA0B3`, uppercase | |
| Typography | Inter | |
| Client logo (if uploaded) | bottom-right on cover + closing only | |
| No duplicate Borek logos | single mark per slide | |

Record screenshots or side-by-side notes. **Do not** set `visual_acceptance` in code;
that remains a future automation step.

### After visual pass (staging only)

1. Set `GAMMA_THEME_CONTRACT_VERSION=2.0` on staging.
2. Re-run targeted tests: `pytest tests/unit/gamma/test_tsk014_phase4_arbios_contract.py`.
3. Confirm `gamma_theme_contract_aligned` is true in compliance reports.
4. Plan production env update separately after stakeholder sign-off.

## What blocks the first live run

| Blocker | Owner |
| --- | --- |
| Staging `.env` with `GAMMA_THEME_ID=f5ix6vkbsmlsqg1` | DevOps / operator |
| Valid `GAMMA_API_KEY` for workspace | Jaya |
| Template `g_o2guwb3zh541ihu` confirmed compatible | Jaya |
| Theme built with extracted logo SVGs | Jaya (done) |
| `PUBLIC_API_BASE_URL` (if testing client logo path) | DevOps |
| Manual visual comparison | Design / Blenard |
