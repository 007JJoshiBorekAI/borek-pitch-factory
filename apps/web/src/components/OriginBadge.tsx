import React from "react";

import type { OriginKind } from "@/lib/stage1Contracts";
import { originBadgeClassName, originLabel } from "@/lib/stage1ResearchView";

export function OriginBadge({ origin }: { origin: OriginKind }) {
  return (
    <span className={originBadgeClassName(origin)} title={originLabel(origin)}>
      {originLabel(origin)}
    </span>
  );
}
