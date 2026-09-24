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

assert.equal(APPROVED_PRESENTATION_COLORS.primary, "0D1240");
assert.equal(APPROVED_PRESENTATION_COLORS.heading, "0D1240");
assert.equal(APPROVED_PRESENTATION_COLORS.body, "515C70");
assert.equal(APPROVED_PRESENTATION_COLORS.kicker, "8A90A5");
assert.equal(APPROVED_PRESENTATION_COLORS.accent, "124F94");
assert.equal(APPROVED_PRESENTATION_COLORS.cardBackground, "FFFFFF");

assert.equal(APPROVED_PRESENTATION_TYPOGRAPHY.headingFont, "Inter");
assert.equal(APPROVED_PRESENTATION_TYPOGRAPHY.bodyFont, "Inter");

assert.equal(APPROVED_COVER_SURFACE.appearance, "dark");
assert.equal(APPROVED_COVER_SURFACE.hex, "0D1240");

assert.equal(APPROVED_BOREK_LOGO.placements.content_slide.anchor, "top_right");
assert.equal(APPROVED_BOREK_LOGO.placements.cover.anchor, "top_left");
assert.equal(APPROVED_BOREK_LOGO.everyCard, true);
assert.equal(APPROVED_BOREK_LOGO.runtimeOverridable, false);

assert.deepEqual(APPROVED_CLIENT_LOGO.cards, ["cover", "closing"]);
assert.equal(APPROVED_CLIENT_LOGO.position, "bottom_right");
assert.equal(APPROVED_CLIENT_LOGO.coBrandWithBorekLogo, true);

assert.equal(APPROVED_GAMMA_BRANDING.locked, true);
assert.equal(APPROVED_GAMMA_BRANDING.requestOverrideForbidden, true);
assert.equal(APPROVED_GAMMA_BRANDING.designContractVersion, "2.0");
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
  assert.equal(approvedHexSet.has(hex), false, `approved CI must not reuse fallback hex ${hex}`);
}

assert.equal(BOREK_DESIGN_TOKENS.schema_version, contract.schema_version);

console.log("presentationBranding.test.ts: all assertions passed");
