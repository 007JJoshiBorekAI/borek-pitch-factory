"""Bridge to the root-level Borek deck generator scripts.

The generator lives at the repository root so its CLIs keep working unchanged:

    borek_pptx.py        layouts + python-pptx renderer (``build_deck``)
    llm_planner.py       material -> slide-spec prompt, JSON parsing, normalisation
    make_ai_tech_deck.py pre-meeting deck (``Ai Tech Borek Presentation`` look, max 8 slides)
    make_master_deck.py  post-meeting deck (``Borek Master Presentation`` layouts)
    preview_pptx.py      PNG renderer used for the previews and the PDF

This module is the only place the backend imports them from, so the dependency on
the repository root, python-pptx and Pillow fails with one clear error instead of
an ImportError deep inside a worker.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from types import ModuleType

# apps/api/services/presentation/borek_deck/engine.py -> repository root
REPO_ROOT = Path(__file__).resolve().parents[5]

PRE_MEETING_MAX_SLIDES = 8


class BorekDeckEngineUnavailable(RuntimeError):
    """The deck generator or one of its dependencies cannot be imported."""

    code = "BOREK_DECK_ENGINE_UNAVAILABLE"
    retryable = False


@dataclass(frozen=True)
class Engine:
    bp: ModuleType
    llm_planner: ModuleType
    ai_tech: ModuleType
    master: ModuleType
    preview: ModuleType

    @property
    def layouts(self) -> frozenset[str]:
        return frozenset(self.bp.LAYOUTS)

    def template_for(self, kind: str) -> str | None:
        """Reference PPTX whose theme/size is reused; ``None`` builds an identical blank 20 x 11.25 in deck."""
        module = self.ai_tech if kind == "pre_meeting" else self.master
        reference = Path(module.REFERENCE)
        return str(reference) if reference.exists() else None

    def footer_for(self, kind: str, lang: str = "EN") -> str:
        if kind == "pre_meeting":
            return str(self.ai_tech.FOOTER)
        return str(self.master.FOOTERS[lang.upper()])


@lru_cache(maxsize=1)
def engine() -> Engine:
    root = str(REPO_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)
    try:
        import borek_pptx
        import llm_planner
        import make_ai_tech_deck
        import make_master_deck
        import preview_pptx
    except ImportError as exc:  # pragma: no cover - exercised only on a broken install
        raise BorekDeckEngineUnavailable(
            f"The Borek deck generator could not be imported ({exc}). "
            "Install python-pptx, Pillow and lxml and make sure borek_pptx.py and "
            "borek_assets/ are deployed next to the backend."
        ) from exc
    return Engine(
        bp=borek_pptx,
        llm_planner=llm_planner,
        ai_tech=make_ai_tech_deck,
        master=make_master_deck,
        preview=preview_pptx,
    )
