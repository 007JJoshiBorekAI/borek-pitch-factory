"""Follow-up email content from a frozen Master Presentation V2 snapshot (pure functions)."""

from __future__ import annotations

import copy
import re

import pytest

from services.followup.finalized import (
    WORD_CAPS,
    ContentDoesNotFit,
    NoConfirmedContent,
    content_from_snapshot,
    has_deadline,
    inline_form,
    ordinary_words,
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


def statements(package: dict) -> list[str]:
    return [item["text"] for items in package["findings"].values() for item in items]


def core(text: str) -> str:
    """A statement without its final full stop: the words that have to be in the email unchanged."""
    return " ".join(text.split()).rstrip(".")


def has(body: str, text: str) -> bool:
    """The statement is in the email word for word; only the capital of its first letter may differ."""
    words = core(text)
    return words in body or words[0].lower() + words[1:] in body


def frame_of(body: str, package: dict) -> str:
    """The email without the confirmed statements: the wording the application itself adds."""
    for text in sorted(statements(package), key=len, reverse=True):
        words = core(text)
        body = body.replace(words, "").replace(words[0].lower() + words[1:], "")
    return body


def render(package: dict, statics: dict = STATICS, **options) -> tuple[dict, list[str]]:
    return render_finalized_lengths(content_from_snapshot(package), statics, **options)


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
    lengths, flags = render(BASE)
    short, medium, extensive = lengths["short"]["body"], lengths["medium"]["body"], lengths["extensive"]["body"]
    assert short.startswith("Hi Dana,\n\nThank you for your time in our meeting. It gave us a clear picture of the situation at Nordwind.\n\n")
    # The points are one sentence, not a headed list.
    assert "In brief, the main points as we understood them: quotes must go out within one day; pricing data sits in three systems; start with the sales team.\n\n" in short
    assert "Run a pilot" not in short and "drafting assistant" not in short, "the short email keeps to the first points"
    assert "As next steps:\n- Dana Weber will send the pricing export by 16.10.2026.\n- Share the pilot plan (date to be confirmed)." in short
    # Requirements, challenges and priorities are one connected paragraph in the medium email.
    assert (
        "The core requirement, as we understood it: quotes must go out within one day. What makes this difficult today: pricing data sits in three systems. "
        "As for priorities: start with the sales team.\n\n"
    ) in medium
    assert "For the way forward, this is the direction that was discussed: run a pilot with ten quotes." in medium
    assert "This is where we see our role. One idea we talked through, not decided yet: a drafting assistant that prepares the quote." in medium
    assert "The core requirement, as we understood it: quotes must go out within one day.\n\n" in extensive
    assert "not decided yet: a drafting assistant that prepares the quote.\n\n" in extensive
    assert "Looking further ahead" not in extensive, "the only opportunity came from the owner's notes"
    used = lambda body: sorted(text for text in statements(BASE) if has(body, text))  # noqa: E731
    assert used(extensive) == used(medium), "with this little material both emails hold the same statements"
    for body in (short, medium, extensive):
        assert "sign next week" not in body and "service team" not in body, "owner notes never appear as client statements"
        assert body.endswith("Best regards\nLena Hoffmann\nProject Lead - BOREK")
        assert "(agreed" not in body and "Participants" not in body, "no meeting date or participant is invented"
        # Order: what was understood, the attached presentation, the next steps, the closing.
        assert body.index("start with the sales team") < body.index("attached") < body.index("As next steps") < body.index("let me know") < body.index("Best regards")
        assert "\n\n\n" not in body
    assert {name: lengths[name]["subject"] for name in lengths} == dict.fromkeys(lengths, "Nordwind Quoting — Follow-up to our meeting")
    assert [lengths[name]["word_count"] for name in ("short", "medium", "extensive")] == [followup_content_word_count(body) for body in (short, medium, extensive)]
    assert "content_trimmed" not in flags
    formal = {**STATICS, "salutation_style": "formal"}
    assert render(BASE, formal)[0]["short"]["body"].startswith("Dear Ms Weber,")


def test_the_email_is_a_letter_not_a_report() -> None:
    lengths, _flags = render(BASE)
    report_headings = ("Key points", "Points from the meeting", "Requirements", "Challenges", "Priorities", "Decisions noted", "Also discussed",
                       "Discussed, not yet decided", "Opportunities mentioned", "Next steps")
    for name, draft in lengths.items():
        lines = [line for line in draft["body"].split("\nBest regards\n")[0].splitlines() if line]
        assert not [line for line in lines if line in report_headings], name
        # Every line is a greeting, a paragraph of sentences, the lead-in to the next steps, or a next step.
        assert all(line.endswith((".", ",", ":")) for line in lines), (name, lines)
        listed = [line for line in lines if line.startswith("- ")]
        assert listed == [line for line in listed if "pricing export" in line or "pilot plan" in line], "only next steps are listed"
        assert "Thank you" in lines[1] and "attached" in draft["body"] and "let me know" in draft["body"]
        # No stock phrase is repeated, and the statements are not lined up one full stop after the other.
        for phrase in ("we noted the following", "as we understood", "this is the direction", "This is where we see our role"):
            assert draft["body"].count(phrase) <= 1, (name, phrase)
        assert "we noted the following" not in draft["body"]
    one_step = snapshot(requirements=[finding("Quotes must go out within one day.")], follow_ups=[finding("Borek will send the plan by 16.10.2026.")])
    body = render(one_step)[0]["medium"]["body"]
    assert "As a next step: Borek will send the plan by 16.10.2026." in body and "\n- " not in body, "a single next step is a sentence"


def test_the_client_is_named_only_as_the_owner_entered_it() -> None:
    assert "the situation at Nordwind" in render(BASE)[0]["medium"]["body"]
    for missing in ("", "   ", None):
        body = render(BASE, {**STATICS, "client_short": missing})[0]["medium"]["body"]
        assert "a clear picture of the current situation, and" in body and "situation at" not in body and "None" not in body


def test_the_wording_around_the_statements_states_no_fact_of_its_own() -> None:
    """Nothing but confirmed statements carries a name, a number, a date or a commitment."""
    lengths, _flags = render(BASE)
    for name, draft in lengths.items():
        frame = frame_of(draft["body"], BASE).replace("Lena Hoffmann", "").replace("situation at Nordwind", "")
        assert not re.search(r"\d", frame), (name, "the frame holds no number or date")
        for word in ("Dana Weber", "Nordwind", "promise", "agreed", "decided to", "will send", "deadline", "Monday", "tomorrow", "next week", "this morning", "academy"):
            assert word not in frame, (name, word)
        assert "not decided yet" in frame or name == "short", "discussed ideas are introduced as open"


def test_a_statement_inside_a_sentence_keeps_its_words() -> None:
    package = snapshot(
        requirements=[finding("Motor claims must be settled within two days."), finding("IT must approve every interface."), finding("Markus signs off the pilot.")],
        challenges=[finding("Claim documents are keyed in by hand."), finding("Is the archive connected? Nobody knew.")],
        decisions=[finding("Run a pilot with motor claims and claim documents from Munich.")],
    )
    vocabulary = ordinary_words(statements(package))
    assert {"motor", "claim", "pilot"} <= vocabulary and "markus" not in vocabulary and "munich" not in vocabulary
    # An ordinary first word is written in lower case; a name or an abbreviation never is.
    assert inline_form("Motor claims must be settled within two days.", vocabulary) == "motor claims must be settled within two days"
    assert inline_form("IT must approve every interface.", vocabulary) == "IT must approve every interface"
    assert inline_form("Markus signs off the pilot.", vocabulary) == "Markus signs off the pilot"
    assert inline_form("Borek will send the plan.") == "Borek will send the plan"
    assert inline_form("The archive is not connected.") == "the archive is not connected"
    extensive = render(package)[0]["extensive"]["body"]
    # "Markus" is not known to be a name or an ordinary word: the statements stay as they were confirmed.
    assert "as we understood them: Motor claims must be settled within two days. IT must approve every interface. Markus signs off the pilot." in extensive
    named = render(package, {**STATICS, "standard_recipients": [{**STATICS["standard_recipients"][0], "first_name": "Markus"}]})[0]["extensive"]["body"]
    assert "as we understood them: motor claims must be settled within two days; IT must approve every interface; Markus signs off the pilot." in named
    assert "this is the direction that was discussed: run a pilot with motor claims and claim documents from Munich." in extensive
    # A statement of several sentences is not pressed into one: the whole group stays as written.
    assert "What makes this difficult today: Claim documents are keyed in by hand. Is the archive connected? Nobody knew." in extensive
    assert all(has(extensive, text) for text in statements(package))


def test_the_presentation_is_only_called_attached_when_a_file_is_selected() -> None:
    with_file, _ = render(BASE, attachment=True)
    without, _ = render(BASE, attachment=False)
    for name in ("short", "medium", "extensive"):
        assert "attached" in with_file[name]["body"]
        assert "attach" not in without[name]["body"].lower(), name
        assert without[name]["word_count"] < with_file[name]["word_count"] and "\n\n\n" not in without[name]["body"]
        # Nothing else changes with this little material.
        removed = [line for line in with_file[name]["body"].split("\n\n") if line not in without[name]["body"].split("\n\n")]
        assert len(removed) == 1 and "attached" in removed[0]
    assert render(BASE)[0] == with_file, "a file is selected unless stated otherwise"


def test_the_extensive_draft_is_longer_only_where_more_was_confirmed() -> None:
    rich = snapshot(
        requirements=[finding(f"Requirement {index} must be met.") for index in range(8)],
        challenges=[finding(f"Challenge {index} slows the team down.") for index in range(4)],
        opportunities=[finding("Past quotes could be reused as a starting point.")],
        discussed_solutions=[finding(f"Solution {index} was looked at.") for index in range(5)],
        decisions=[finding("Run a pilot with ten quotes.")],
        follow_ups=[finding("Borek will send the plan by 16.10.2026.")],
    )
    lengths, _flags = render(rich)
    medium, extensive = lengths["medium"]["body"], lengths["extensive"]["body"]
    count = lambda body: sum(has(body, text) for text in statements(rich))  # noqa: E731
    assert count(medium) == 2 + 2 + 1 + 3 + 1, "the medium email shows two requirements, two challenges, the decision, three ideas and the next step"
    assert count(extensive) == 8 + 4 + 1 + 5 + 1 + 1, "the extensive email shows every confirmed statement"
    assert "Looking further ahead, this also came up: Past quotes could be reused as a starting point." in extensive
    assert "as we understood them: Requirement 0 must be met. Requirement 1 must be met." in extensive
    assert lengths["extensive"]["word_count"] > lengths["medium"]["word_count"] + 40
    assert not re.search(r"Requirement \d|Challenge \d|Solution \d", frame_of(extensive, rich)), "nothing but confirmed statements"


def test_word_caps_are_kept_by_dropping_whole_points() -> None:
    long_point = "The quoting team needs every incoming request answered with a complete and checked offer including delivery terms"
    many = snapshot(
        requirements=[finding(f"{long_point} for region {index}.") for index in range(40)],
        decisions=[finding(f"Decision number {index} was taken in the meeting.") for index in range(10)],
        follow_ups=[finding(f"Borek will send document {index} by 16.10.2026.") for index in range(12)],
    )
    for attachment in (True, False):
        lengths, flags = render(many, attachment=attachment)
        assert lengths["short"]["word_count"] <= 150 and lengths["medium"]["word_count"] <= 300 and lengths["extensive"]["word_count"] <= 500
        assert "content_trimmed" in flags, "the owner is told that confirmed points were left out"
        for name in ("short", "medium", "extensive"):
            body = lengths[name]["body"]
            frame = frame_of(body, many)
            assert "quoting team" not in frame and "ecision number" not in frame and "send document" not in frame, "a statement is whole or absent"
            assert all(line.endswith(".") for line in body.splitlines() if line.startswith("- ")), "no sentence is cut in the middle"
        assert lengths["short"]["body"].count("\n- Borek will send") <= 5 and "As next steps:" in lengths["extensive"]["body"]


def test_empty_blocks_are_omitted_and_an_empty_package_is_refused() -> None:
    only_requirement = snapshot(requirements=[finding("Quotes must go out within one day.")])
    content = content_from_snapshot(only_requirement)
    assert "no_next_steps_confirmed" in content["review_flags"] and "action_owner_unconfirmed" not in content["review_flags"]
    body = render_finalized_lengths(content, STATICS)[0]["extensive"]["body"]
    # A sentence without a confirmed statement is not written: no next step, decision or idea is implied.
    for absent in ("next step", "way forward", "our role", "difficult", "priorities", "further ahead"):
        assert absent not in body, absent
    assert "\n\n\n" not in body and body.count("\n\n") == 5, "greeting, thanks, one paragraph, attachment, closing, signature"
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
                      "what we heard", "we agreed", "agreed", "as you ", "good to hear", "As promised")


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
        frame = frame_of(f"{draft['subject']}\n{draft['body']}", package)
        for phrase in CLIENT_ATTRIBUTION:
            assert phrase not in frame, (name, phrase)
        assert "as we understood" in draft["body"], "points are reported as BOREK's understanding of the meeting"
    assert "this is the direction that was discussed: Borek will prepare a proposal for a pilot." in lengths["medium"]["body"]
    extensive = lengths["extensive"]["body"]
    assert "The core requirement, as we understood it: we recommend a fixed-price pilot of six weeks." in extensive
    assert "As for priorities: Borek suggests starting with the service team." in extensive
    assert "Looking further ahead, this also came up: our academy could train two of the client's developers." in extensive
    # The statements themselves are reproduced as confirmed, word for word.
    assert all(has(extensive, text) for text in statements(package))


def test_lead_ins_never_name_a_speaker_for_any_kind_of_finding() -> None:
    everything = snapshot(**{name: [finding(f"A {name} statement.")] for name in
                             ("requirements", "challenges", "priorities", "opportunities", "discussed_solutions", "decisions", "follow_ups")})
    lengths, _flags = render(everything)
    for name, draft in lengths.items():
        frame = frame_of(draft["body"], everything)
        for phrase in (*CLIENT_ATTRIBUTION, "the client", "you want", "you need", "you mentioned", "we promised"):
            assert phrase not in frame, (name, phrase)
    assert all(has(lengths["extensive"]["body"], f"A {name} statement") for name in everything["findings"])


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
    lengths, flags = render(package)
    for name, draft in lengths.items():
        assert draft["word_count"] == followup_content_word_count(draft["body"]) <= WORD_CAPS[name], (name, draft["word_count"])
        assert any(has(draft["body"], text) for text in statements(package)), "the email still reports the statements that fit"
        assert ("LONG" in draft["body"]) == (core(long_text) in draft["body"]), "the long statement is whole or absent, never partial"
        assert not re.search(r"\bw\d+\b", frame_of(draft["body"], package)), "no fragment of it is left behind"
    # It pushes no shorter statement out of a draft it cannot be part of.
    if size > WORD_CAPS["short"]:
        assert "LONG" not in lengths["short"]["body"] and has(lengths["short"]["body"], "Quotes must go out within one day.")
    if size > WORD_CAPS["medium"]:
        assert "LONG" not in lengths["medium"]["body"] and has(lengths["medium"]["body"], "Offers need a sign-off.")
    assert ("content_trimmed" in flags) == ("LONG" not in lengths["extensive"]["body"])


def test_generation_fails_with_a_classified_error_when_nothing_fits() -> None:
    """One confirmed statement, longer than the short draft allows: it is not shortened to make it fit."""
    with pytest.raises(ContentDoesNotFit) as error:
        render(snapshot(requirements=[finding(words(170, "ONLY"))]))
    assert error.value.code == "FOLLOWUP_CONTENT_TOO_LONG" and "short draft (150 content words)" in str(error.value)
    with pytest.raises(ContentDoesNotFit) as error:
        render(snapshot(follow_ups=[finding(words(520, "ONLY"))]))
    assert "without being shortened" in str(error.value)
    # Just inside the cap it is reported whole.
    fits = render(snapshot(requirements=[finding(words(100, "ONLY"))]))[0]
    assert all(core(words(100, "ONLY")) in draft["body"] for draft in fits.values())
