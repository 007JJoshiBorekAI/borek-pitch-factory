"""MS-32 follow-up email rendering (Python port of followupReview.test.ts)."""

from __future__ import annotations

import json
from pathlib import Path

from services.followup.rendering import (
    followup_content_word_count,
    render_followup_draft,
    render_three_lengths,
)

FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "fixtures" / "followup_extraction"

INFORMAL_STATICS = {
    "project_name": "Acme Invoice Pilot",
    "client_short": "Acme",
    "salutation_style": "informal",
    "standard_recipients": [
        {
            "email": "markus@example.com",
            "first_name": "Markus",
            "last_name": "Weber",
            "salutation": "Mr",
            "kind": "to",
            "primary": True,
        }
    ],
    "sender_profile": {
        "name": "Lena Hoffmann",
        "role": "Project Lead",
        "email": "lena@borek.example",
    },
}


def _load(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def test_workshop_clear_renders_ms32_template() -> None:
    extraction = _load("workshop_clear")
    draft = render_followup_draft(extraction, INFORMAL_STATICS)
    assert "Acme Invoice Pilot" in draft["subject"]
    assert draft["body"].startswith("Hi Markus,")
    for point in extraction["key_points"]:
        assert point in draft["body"]
    for action in extraction["action_items"]:
        assert action["action"] in draft["body"]
    assert "Decisions" in draft["body"]
    assert "Open from our side" not in draft["body"]
    assert "{{" not in draft["body"]
    assert followup_content_word_count(draft["body"]) <= 150


def test_three_lengths_short_medium_extensive() -> None:
    extraction = _load("workshop_clear")
    lengths = render_three_lengths(extraction, INFORMAL_STATICS)
    assert lengths["short"]["word_count"] <= 150
    assert lengths["medium"]["word_count"] <= 300
    assert lengths["extensive"]["word_count"] <= 500
    assert "Key points" in lengths["short"]["body"]
    assert "Participants:" in lengths["medium"]["body"]


def test_tbd_renders_as_date_to_be_confirmed() -> None:
    extraction = _load("no_deadline")
    draft = render_followup_draft(extraction, INFORMAL_STATICS)
    assert "date to be confirmed" in draft["body"]
    assert "by TBD" not in draft["body"]
