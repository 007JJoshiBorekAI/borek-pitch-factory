"""Borek deck generator wired into the presentation pipeline.

    pre-meeting  (PPT #1)  -> make_ai_tech_deck  (``plan_pre_meeting_deck``)
    post-meeting (PPT #2)  -> make_master_deck   (``plan_post_meeting_deck``)

Importing this package is cheap: python-pptx and Pillow are only loaded when a deck is
planned or rendered (see ``engine``). Use ``deck_plan`` for the storage helpers.
"""

from services.presentation.borek_deck.deck_plan import (
    PLAN_ENGINE,
    POST_MEETING,
    PRE_MEETING,
    borek_slide_spec,
    borek_slides_from_specs,
    is_borek_plan,
    is_borek_slide_specs,
)

__all__ = [
    "PLAN_ENGINE",
    "POST_MEETING",
    "PRE_MEETING",
    "borek_slide_spec",
    "borek_slides_from_specs",
    "is_borek_plan",
    "is_borek_slide_specs",
]
