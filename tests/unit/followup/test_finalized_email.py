"""Follow-up email content from a frozen Master Presentation V2 snapshot (pure functions)."""

from __future__ import annotations

import copy

import pytest

from services.followup.finalized import (
    NoConfirmedContent,
    content_from_snapshot,
    has_deadline,
    render_finalized_lengths,
    states_owner,
)
from services.followup.rendering import followup_content_word_count

STATICS = {
    "project_name": "Nordwind Quoting",
    "client_short": "Nordwind",
    "salutation_style": "informal",
    "standard_recipients": [{"email": "dana@nordwind.example", "first_name": "Dana", "last_name": "Weber", "salutation": "Ms", "kind": "to", "primary": True}],
    "sender_profile": {"name": "Lena Hoffmann", "role": "Project Lead", "email": "lena@borek.example"},
}


def finding(text: str, source: str = "transcript") -> dict[str, str]:
    return {"text": text, "source": source}


def snapshot(**findings: list[dict[str, str]]) -> dict:
    categories = ("requirements", "challenges", "priorities", "opportunities", "discussed_solutions", "decisions", "follow_ups")
    return {
        "findings": {name: list(findings.get(name, [])) for name in categories},
        "excluded_findings": [],
        "meeting_extraction": {"execution_mode": "fixture"},
    }


BASE = snapshot(
    requirements=[finding("Quotes must go out within one day")],
    challenges=[finding("Pricing data sits in three systems.", "both")],
    priorities=[finding("Start with the sales team.")],
    opportunities=[finding("The service team could reuse the assistant.", "personal_notes")],
    discussed_solutions=[finding("A drafting assistant that prepares the quote.")],
    decisions=[finding("Run a pilot with ten quotes."), finding("The client will sign next week.", "personal_notes")],
    follow_ups=[finding("Dana Weber will send the pricing export by 16.10.2026."), finding("Share the pilot plan")],
)


def test_only_client_statements_are_reported_and_owner_notes_are_flagged() -> None:
    content = content_from_snapshot(BASE)
    assert content["heard"] == ["Quotes must go out within one day", "Pricing data sits in three systems.", "Start with the sales team."]
    assert content["decisions"] == ["Run a pilot with ten quotes."], "an owner note is not an agreed decision"
    assert content["discussed"] == ["A drafting assistant that prepares the quote."]
    assert content["owner_only_count"] == 2
    assert content["review_flags"] == [
        "fixture_extraction",
        "meeting_date_unconfirmed",
        "owner_notes_omitted",
        "action_owner_unconfirmed",
        "action_date_unconfirmed",
    ]
    live = copy.deepcopy(BASE)
    live["meeting_extraction"]["execution_mode"] = "live"
    assert "fixture_extraction" not in content_from_snapshot(live)["review_flags"]


def test_three_lengths_add_supported_detail_and_nothing_else() -> None:
    lengths, flags = render_finalized_lengths(content_from_snapshot(BASE), STATICS)
    short, medium, extensive = lengths["short"]["body"], lengths["medium"]["body"], lengths["extensive"]["body"]
    assert short.startswith("Hi Dana,\n\nthank you for your time in our meeting.")
    assert "Key points\n- Quotes must go out within one day.\n- Pricing data sits in three systems.\n- Start with the sales team." in short
    assert "Decisions" not in short and "Also discussed" not in short
    assert "- Dana Weber will send the pricing export by 16.10.2026." in short, "a stated owner and date are kept as written"
    assert "- Share the pilot plan (date to be confirmed)." in short, "an unknown deadline is named as such"
    assert "Decisions\n- Run a pilot with ten quotes." in medium and "Also discussed\n- A drafting assistant" in medium
    assert "Discussed, not yet decided\n- A drafting assistant" in extensive
    # The extensive draft sorts the same confirmed statements by what they are; it adds no statement.
    assert "Your requirements\n- Quotes must go out within one day." in extensive
    assert "Challenges you described\n- Pricing data sits in three systems." in extensive
    assert "Your priorities\n- Start with the sales team." in extensive and "What we heard" not in extensive
    assert "Opportunities you raised" not in extensive, "the only opportunity came from the owner's notes"
    bullets = lambda body: sorted(line for line in body.splitlines() if line.startswith("- "))  # noqa: E731
    assert bullets(extensive) == bullets(medium), "with this little material both drafts hold the same points"
    for body in (short, medium, extensive):
        assert "sign next week" not in body and "service team" not in body, "owner notes never appear as client statements"
        assert body.endswith("Best regards\nLena Hoffmann\nProject Lead - BOREK")
        assert "(agreed" not in body and "Participants" not in body, "no meeting date or participant is invented"
    assert {name: lengths[name]["subject"] for name in lengths} == dict.fromkeys(lengths, "Nordwind Quoting — Follow-up to our meeting")
    assert [lengths[name]["word_count"] for name in ("short", "medium", "extensive")] == [followup_content_word_count(body) for body in (short, medium, extensive)]
    assert "content_trimmed" not in flags
    formal = {**STATICS, "salutation_style": "formal"}
    assert render_finalized_lengths(content_from_snapshot(BASE), formal)[0]["short"]["body"].startswith("Dear Ms Weber,")


def test_the_extensive_draft_is_longer_only_where_more_was_confirmed() -> None:
    rich = snapshot(
        requirements=[finding(f"Requirement {index} must be met.") for index in range(8)],
        challenges=[finding(f"Challenge {index} slows the team down.") for index in range(4)],
        opportunities=[finding("Past quotes could be reused as a starting point.")],
        discussed_solutions=[finding(f"Solution {index} was looked at.") for index in range(5)],
        decisions=[finding("Run a pilot with ten quotes.")],
        follow_ups=[finding("Borek will send the plan by 16.10.2026.")],
    )
    lengths, _flags = render_finalized_lengths(content_from_snapshot(rich), STATICS)
    medium, extensive = lengths["medium"]["body"], lengths["extensive"]["body"]
    count = lambda body: sum(line.startswith("- ") for line in body.splitlines())  # noqa: E731
    assert count(medium) == 5 + 1 + 3 + 1, "the medium draft shows the first five statements and three discussed points"
    assert count(extensive) == 8 + 4 + 1 + 5 + 1 + 1, "the extensive draft shows every confirmed statement"
    assert "Opportunities you raised\n- Past quotes could be reused as a starting point." in extensive
    assert lengths["extensive"]["word_count"] > lengths["medium"]["word_count"] + 40
    confirmed = {f"- {item['text']}" for items in rich["findings"].values() for item in items}
    assert {line for line in extensive.splitlines() if line.startswith("- ")} <= confirmed, "nothing but confirmed statements"


def test_word_caps_are_kept_by_dropping_whole_points() -> None:
    long_point = "The quoting team needs every incoming request answered with a complete and checked offer including delivery terms"
    many = snapshot(
        requirements=[finding(f"{long_point} for region {index}.") for index in range(40)],
        decisions=[finding(f"Decision number {index} was taken in the meeting.") for index in range(10)],
        follow_ups=[finding(f"Borek will send document {index} by 16.10.2026.") for index in range(12)],
    )
    lengths, flags = render_finalized_lengths(content_from_snapshot(many), STATICS)
    assert lengths["short"]["word_count"] <= 150 and lengths["medium"]["word_count"] <= 300 and lengths["extensive"]["word_count"] <= 500
    assert "content_trimmed" in flags, "the owner is told that confirmed points were left out"
    for name in ("short", "medium", "extensive"):
        for line in lengths[name]["body"].splitlines():
            if line.startswith("- "):
                assert line.endswith("."), "no sentence is cut in the middle"
    assert lengths["short"]["body"].count("\n- Borek will send") <= 5 and "Next steps" in lengths["extensive"]["body"]


def test_empty_blocks_are_omitted_and_an_empty_package_is_refused() -> None:
    only_requirement = snapshot(requirements=[finding("Quotes must go out within one day.")])
    content = content_from_snapshot(only_requirement)
    assert "no_next_steps_confirmed" in content["review_flags"] and "action_owner_unconfirmed" not in content["review_flags"]
    body = render_finalized_lengths(content, STATICS)[0]["extensive"]["body"]
    assert "Next steps" not in body and "Decisions" not in body and "\n\n\n" not in body
    with pytest.raises(NoConfirmedContent):
        content_from_snapshot(snapshot(decisions=[finding("Only in my notes.", "personal_notes")]))
    with pytest.raises(NoConfirmedContent):
        content_from_snapshot(snapshot())


@pytest.mark.parametrize(
    ("text", "owner", "deadline"),
    [
        ("Dana Weber will send the pricing export by Friday.", True, True),
        ("Borek: prepare the pilot plan until 16.10.2026", True, True),
        ("Send the pricing export by Friday.", False, True),
        ("Share the pilot plan", False, False),
        ("Tom shares the system list next week", True, True),
        ("Schedule the workshop on 2026-10-20", False, True),
    ],
)
def test_owner_and_deadline_are_only_recognised_when_stated(text: str, owner: bool, deadline: bool) -> None:
    assert states_owner(text) is owner
    assert has_deadline(text) is deadline
