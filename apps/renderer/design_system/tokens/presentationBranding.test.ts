/** TSK-010 approved presentation branding token checks. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { BorekColors } from "./colors.js";
import { BorekFontFamilies } from "./typography.js";
import {
  APPROVED_BOREK_LOGO,
  APPROVED_CLIENT_LOGO,
  APPROVED_COVER_SURFACE,
  APPROVED_GAMMA_BRANDING,
  APPROVED_PRESENTATION_COLORS,
  APPROVED_PRESENTATION_TYPOGRAPHY,
  BOREK_DESIGN_TOKENS,
} from "./presentationBranding.js";

const CONTRACT_PATH = fileURLToPath(
  new URL("../../../../packages/contracts/borek_design_tokens.json", import.meta.url),
);
const GAMMA_TEMPLATE_PATH = fileURLToPath(
  new URL("../../../../packages/contracts/gamma_template.json", import.meta.url),
);

const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const gammaTemplate = JSON.parse(readFileSync(GAMMA_TEMPLATE_PATH, "utf8"));

assert.equal(APPROVED_PRESENTATION_COLORS.primary, "2C567A");
assert.equal(APPROVED_PRESENTATION_COLORS.heading, "0D1D51");
assert.equal(APPROVED_PRESENTATION_COLORS.accent, "0072C7");
assert.equal(APPROVED_PRESENTATION_COLORS.cardBackground, "FFFFFF");

assert.equal(APPROVED_PRESENTATION_TYPOGRAPHY.headingFont, "Inter");
assert.equal(APPROVED_PRESENTATION_TYPOGRAPHY.bodyFont, "Inter");

assert.equal(APPROVED_COVER_SURFACE.appearance, "dark");
assert.equal(APPROVED_COVER_SURFACE.hex, null);

assert.equal(APPROVED_BOREK_LOGO.placement, "bottom_left_header_footer");
assert.equal(APPROVED_BOREK_LOGO.everyCard, true);
assert.equal(APPROVED_BOREK_LOGO.runtimeOverridable, false);

assert.deepEqual(APPROVED_CLIENT_LOGO.cards, ["cover", "closing"]);
assert.equal(APPROVED_CLIENT_LOGO.position, "bottom_right");
assert.equal(APPROVED_CLIENT_LOGO.coBrandWithBorekLogo, true);

assert.equal(APPROVED_GAMMA_BRANDING.locked, true);
assert.equal(APPROVED_GAMMA_BRANDING.requestOverrideForbidden, true);
assert.deepEqual(
  [...APPROVED_GAMMA_BRANDING.lockedKeys].sort(),
  [...gammaTemplate.branding.locked_keys].sort(),
);

assert.notEqual(APPROVED_PRESENTATION_COLORS.primary, BorekColors.primary);
assert.notEqual(APPROVED_PRESENTATION_TYPOGRAPHY.headingFont, BorekFontFamilies.heading);
assert.notEqual(APPROVED_PRESENTATION_TYPOGRAPHY.bodyFont, BorekFontFamilies.body);

const approvedHexSet = new Set(Object.values(APPROVED_PRESENTATION_COLORS));
const forbiddenFallbackHex = new Set(["0057B8", "182230", "667085"]);
for (const hex of forbiddenFallbackHex) {
  assert.ok(!approvedHexSet.has(hex), `approved tokens must not include fallback hex ${hex}`);
}

assert.equal(BOREK_DESIGN_TOKENS.schema_version, "1.0");
assert.equal(contract.authority.presentation_engine, "gamma");
assert.equal(contract.fallback_renderer.token_path, "apps/renderer/design_system/tokens/");

process.stdout.write("TSK-010 presentationBranding tests passed\n");
