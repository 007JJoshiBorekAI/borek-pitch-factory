/**
 * TSK-010: Approved Borek presentation branding (JJ-26 CI).
 *
 * Loads `packages/contracts/borek_design_tokens.json` — the Design Agent source
 * of truth for approved presentation CI. This module is distinct from the
 * fallback renderer tokens in colors.ts, typography.ts, and branding.ts.
 */

import designTokens from "../../../../packages/contracts/borek_design_tokens.json" with { type: "json" };

export const APPROVED_PRESENTATION_COLORS = {
  primary: designTokens.colors.primary.hex,
  heading: designTokens.colors.heading.hex,
  accent: designTokens.colors.accent.hex,
  cardBackground: designTokens.colors.card_background.hex,
} as const;

export type ApprovedPresentationColorToken = keyof typeof APPROVED_PRESENTATION_COLORS;

export const APPROVED_PRESENTATION_TYPOGRAPHY = {
  headingFont: designTokens.typography.heading_font.family,
  bodyFont: designTokens.typography.body_font.family,
} as const;

export const APPROVED_BOREK_LOGO = {
  placement: designTokens.borek_logo.placement,
  everyCard: designTokens.borek_logo.every_card,
  runtimeOverridable: designTokens.borek_logo.runtime_overridable,
} as const;

export const APPROVED_CLIENT_LOGO = {
  slot: designTokens.client_logo.slot,
  cards: designTokens.client_logo.cards,
  position: designTokens.client_logo.position,
  maxHeightPct: designTokens.client_logo.max_height_pct,
  minClearSpacePct: designTokens.client_logo.min_clear_space_pct,
  coBrandWithBorekLogo: designTokens.client_logo.co_brand_with_borek_logo,
} as const;

export const APPROVED_GAMMA_BRANDING = {
  locked: designTokens.gamma_branding.locked,
  lockedKeys: designTokens.gamma_branding.locked_keys,
  themeIdSetting: designTokens.gamma_branding.theme_id_setting,
  templateIdSetting: designTokens.gamma_branding.template_id_setting,
  requestOverrideForbidden: designTokens.gamma_branding.request_override_forbidden,
} as const;

export const APPROVED_COVER_SURFACE = {
  appearance: designTokens.surfaces.cover.appearance,
  hex: designTokens.surfaces.cover.hex,
} as const;

/** Full contract payload for Design Agent consumers that need source metadata. */
export const BOREK_DESIGN_TOKENS = designTokens;

/** Hex without leading # (PptxGenJS convention) for approved presentation colors. */
export function approvedPresentationColorHex(token: ApprovedPresentationColorToken): string {
  return APPROVED_PRESENTATION_COLORS[token];
}
