import assert from "node:assert/strict";
import { test } from "node:test";

import { pitchReviewResultHref } from "./stage2PreparePipeline.js";

test("pitchReviewResultHref targets pitch review with presentation ids", () => {
  assert.equal(
    pitchReviewResultHref("opp-1", {
      presentationId: "pres-1",
      presentationVersionId: "ver-1",
    }),
    "/pitch-review?opportunityId=opp-1&presentationId=pres-1&presentationVersionId=ver-1",
  );
});
