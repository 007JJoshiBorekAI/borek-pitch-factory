"""PPT #1 output limits. Generic decks are unchanged.

Currency detection matches the existing SUCCESS_METRICS scan. PPT #1 applies
that scan, plus explicit price, ROI, and numbered cost/budget language, to
its own plan text and generated slide copy. Discovery source text is not
rejected for phrases such as "budget approved".
"""

from __future__ import annotations

import re
from typing import Any

from packages.contracts.validators import ContractValidationError
from services.slides.business_rules.no_currency import _CURRENCY_TEXT, _NUMBER_TOKEN

PPT1_MAX_SLIDES = 8

DISCOVERY_PAGE_KEYS: tuple[str, ...] = (
    "cover",
    "client_context",
    "opportunity",
    "borek_approach",
    "relevant_use_case",
    "pilot_proposal",
    "next_steps",
)

DISCOVERY_REFERENCE_RE = re.compile(
    "^discovery\\.(?:" + "|".join(DISCOVERY_PAGE_KEYS) + ")$"
)

_PRICE_OR_ROI = re.compile(
    r"\b(?:prices?|pricing|roi|return\s+on\s+investment)\b",
    re.IGNORECASE,
)
_NUMBERED_COMMERCIAL = re.compile(
    r"\b(?:costs?|savings?|budgets?)\b",
    re.IGNORECASE,
)
_SKIP_KEYS = frozenset(
    {
        "schema_version",
        "slideId",
        "layoutId",
        "sourceChapterIds",
        "fieldProvenance",
        "darkBackground",
    }
)


class Ppt1CommercialContentError(RuntimeError):
    """Generated PPT #1 copy contains pricing or commercial offer language."""

    code = "PPT1_COMMERCIAL_CONTENT"
    retryable = False


def is_ppt1_commercial_text(text: str) -> bool:
    """Return whether this output string is prohibited on PPT #1.

    "budget approved" has no amount and is allowed. A currency token, the
    words price/pricing/ROI, or cost/budget/savings next to a number is not.
    """
    if _CURRENCY_TEXT.search(text) or _PRICE_OR_ROI.search(text):
        return True
    return bool(_NUMBERED_COMMERCIAL.search(text) and _NUMBER_TOKEN.search(text))


def assert_ppt1_plan(plan: dict[str, Any]) -> None:
    """Reject a PPT #1 plan that is too long, ungrounded, or commercial."""
    slides = plan.get("slides") or []
    if len(slides) > PPT1_MAX_SLIDES:
        raise ContractValidationError(
            f"PPT #1 plan has {len(slides)} slides; maximum is {PPT1_MAX_SLIDES}"
        )
    texts: list[str] = [str(plan.get("title") or "")]
    for slide in slides:
        texts.append(str(slide.get("purpose") or ""))
        references = slide.get("frameworkReferences") or []
        if not references:
            raise ContractValidationError("PPT #1 slide is missing a Discovery reference")
        for reference in references:
            if not isinstance(reference, str) or not DISCOVERY_REFERENCE_RE.match(reference):
                raise ContractValidationError(
                    "PPT #1 slides must reference discovery pages, "
                    f"not {reference!r}"
                )
    hit = next((text for text in texts if text and is_ppt1_commercial_text(text)), None)
    if hit is not None:
        raise ContractValidationError(
            f"PPT #1 plan contains prohibited commercial content: {hit}"
        )


def commercial_strings(value: Any) -> list[str]:
    """Return prohibited commercial strings found in slide-copy values."""
    hits: list[str] = []
    _collect_commercial(value, hits)
    return hits


def reject_ppt1_slide_content(slide_specs: list[dict[str, Any]]) -> None:
    """Fail closed when generated PPT #1 slide copy is commercial."""
    hits: list[str] = []
    for spec in slide_specs:
        _collect_commercial(spec, hits)
    if hits:
        raise Ppt1CommercialContentError(
            "PPT #1 generated content contains prohibited commercial content: "
            f"{hits[0]}"
        )


def _collect_commercial(value: Any, hits: list[str]) -> None:
    if isinstance(value, str):
        if is_ppt1_commercial_text(value):
            hits.append(value)
        return
    if isinstance(value, list):
        for item in value:
            _collect_commercial(item, hits)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if key in _SKIP_KEYS:
                continue
            _collect_commercial(item, hits)
