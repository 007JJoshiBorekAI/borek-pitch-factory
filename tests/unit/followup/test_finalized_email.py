"""Follow-up email content from a frozen Master Presentation V2 snapshot (pure functions)."""

from __future__ import annotations

import copy

import pytest

from services.followup.finalized import (
    WORD_CAPS,
    ContentDoesNotFit,
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
        "speaker_unverified",
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
    assert "Decisions noted\n- Run a pilot with ten quotes." in medium and "Also discussed\n- A drafting assistant" in medium
    assert "Discussed, not yet decided\n- A drafting assistant" in extensive
    # The extensive draft sorts the same confirmed statements by what they are; it adds no statement.
    assert "Requirements\n- Quotes must go out within one day." in extensive
    assert "Challenges\n- Pricing data sits in three systems." in extensive
    assert "Priorities\n- Start with the sales team." in extensive and "Points from the meeting" not in extensive
    assert "Opportunities mentioned" not in extensive, "the only opportunity came from the owner's notes"
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
    assert "Opportunities mentioned\n- Past quotes could be reused as a starting point." in extensive
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


# Wording that would claim the client said, required or agreed something.
CLIENT_ATTRIBUTION = ("Your ", "your requirement", "your priorit", "you said", "you described", "you raised", "you told", "you asked",
                      "what we heard", "we agreed", "agreed", "as you ")


def test_statements_by_a_borek_employee_are_never_attributed_to_the_client() -> None:
    """A finding from the transcript was said in the meeting - by whom, the package does not record."""
    package = snapshot(
        requirements=[finding("We recommend a fixed-price pilot of six weeks.")],  # proposed by a BOREK colleague
        priorities=[finding("Borek suggests starting with the service team.")],
        opportunities=[finding("Our academy could train two of the client's developers.")],
        decisions=[finding("Borek will prepare a proposal for a pilot.")],  # one side's statement, not a mutual decision
        follow_ups=[finding("Borek will send the proposal by 16.10.2026.")],
    )
    content = content_from_snapshot(package)
    assert "speaker_unverified" in content["review_flags"], "the owner is asked to check who said what"
    lengths, flags = render_finalized_lengths(content, STATICS)
    assert "speaker_unverified" in flags
    for name, draft in lengths.items():
        text = f"{draft['subject']}\n{draft['body']}"
        intro_and_headings = "\n".join(line for line in text.splitlines() if not line.startswith("- "))
        for phrase in CLIENT_ATTRIBUTION:
            assert phrase not in intro_and_headings, (name, phrase)
        assert "we noted" in draft["body"], "points are reported as noted in the meeting"
    assert "Decisions noted\n- Borek will prepare a proposal for a pilot." in lengths["medium"]["body"]
    extensive = lengths["extensive"]["body"]
    assert "Requirements\n- We recommend a fixed-price pilot of six weeks." in extensive
    assert "Priorities\n- Borek suggests starting with the service team." in extensive
    assert "Opportunities mentioned\n- Our academy could train two of the client's developers." in extensive
    # The statements themselves are reproduced as confirmed, word for word.
    confirmed = {f"- {item['text']}" for items in package["findings"].values() for item in items}
    assert {line for line in extensive.splitlines() if line.startswith("- ")} <= confirmed


def test_headings_never_name_a_speaker_for_any_kind_of_finding() -> None:
    everything = snapshot(**{name: [finding(f"A {name} statement.")] for name in
                             ("requirements", "challenges", "priorities", "opportunities", "discussed_solutions", "decisions", "follow_ups")})
    lengths, _flags = render_finalized_lengths(content_from_snapshot(everything), STATICS)
    headings = {line for draft in lengths.values() for line in draft["body"].splitlines()
                if line and not line.startswith("- ") and line[0].isupper() and not line.endswith((".", ","))}
    assert headings == {"Key points", "Next steps", "Points from the meeting", "Decisions noted", "Also discussed", "Requirements", "Challenges", "Priorities",
                        "Discussed, not yet decided", "Opportunities mentioned", "Best regards", "Lena Hoffmann", "Project Lead - BOREK"}


def words(count: int, label: str) -> str:
    return " ".join([label, *(f"w{index}" for index in range(count - 2))]) + " end."


@pytest.mark.parametrize("size", [120, 160, 310, 480])
def test_an_exceptionally_long_finding_never_breaks_a_word_cap_and_is_never_cut(size: int) -> None:
    long_text = words(size, "LONG")
    package = snapshot(
        requirements=[finding(long_text), finding("Quotes must go out within one day."), finding("Offers need a sign-off.")],
        decisions=[finding("Run a pilot with ten quotes.")],
        follow_ups=[finding("Borek will send the plan by 16.10.2026.")],
    )
    lengths, flags = render_finalized_lengths(content_from_snapshot(package), STATICS)
    for name, draft in lengths.items():
        assert draft["word_count"] == followup_content_word_count(draft["body"]) <= WORD_CAPS[name], (name, draft["word_count"])
        lines = [line for line in draft["body"].splitlines() if line.startswith("- ")]
        assert lines, "the draft still reports the statements that fit"
        for line in lines:
            assert line.endswith("."), "no statement is cut"
        assert ("LONG" in draft["body"]) == (f"- {long_text}" in draft["body"]), "the long statement is whole or absent, never partial"
    # It pushes no shorter statement out of a draft it cannot be part of.
    if size > WORD_CAPS["short"]:
        assert "LONG" not in lengths["short"]["body"] and "Quotes must go out within one day." in lengths["short"]["body"]
    if size > WORD_CAPS["medium"]:
        assert "LONG" not in lengths["medium"]["body"] and "Offers need a sign-off." in lengths["medium"]["body"]
    assert ("content_trimmed" in flags) == ("LONG" not in lengths["extensive"]["body"])


def test_generation_fails_with_a_classified_error_when_nothing_fits() -> None:
    """One confirmed statement, longer than the short draft allows: it is not shortened to make it fit."""
    with pytest.raises(ContentDoesNotFit) as error:
        render_finalized_lengths(content_from_snapshot(snapshot(requirements=[finding(words(170, "ONLY"))])), STATICS)
    assert error.value.code == "FOLLOWUP_CONTENT_TOO_LONG" and "short draft (150 content words)" in str(error.value)
    with pytest.raises(ContentDoesNotFit) as error:
        render_finalized_lengths(content_from_snapshot(snapshot(follow_ups=[finding(words(520, "ONLY"))])), STATICS)
    assert "without being shortened" in str(error.value)
    # Just inside the cap it is reported whole.
    fits = render_finalized_lengths(content_from_snapshot(snapshot(requirements=[finding(words(100, "ONLY"))])), STATICS)[0]
    assert all(words(100, "ONLY") in draft["body"] for draft in fits.values())
