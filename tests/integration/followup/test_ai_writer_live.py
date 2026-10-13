"""Live check of the AI follow-up email writer against the configured Claude model.

The unit tests replace the model with scripted answers: they prove the grounding gate, not the
writing. This run shows what the real model writes for three synthetic clients and whether its
drafts pass the gate. It is deselected by default (``-m 'not live_claude'``) and needs credentials:

    BOREK_ALLOW_LIVE_MODEL_CALLS=1 pytest tests/integration/followup/test_ai_writer_live.py -m live_claude -s

with a valid ANTHROPIC_API_KEY in the environment or in the repository's git-ignored .env. Without
a usable key, or without the explicit authorisation variable, it is skipped before anything is sent.
A key the provider rejects ends the run after that one request.

Only synthetic findings are sent. The emails are printed for a human to read; the assertions
cover what can be checked mechanically.
"""

from __future__ import annotations

import os

import pytest

from llm.claude.client import ClaudeClientError, claude_credentials_problem, structured_complete
from services.followup.ai_writer import AiWriterRejected, facts_from_content, write_with_ai
from services.followup.finalized import WORD_CAPS, content_from_snapshot
from services.followup.rendering import followup_content_word_count
from tests.integration.followup.test_ai_writer_live_smoke import live_key

pytestmark = pytest.mark.live_claude


def finding(text: str, source: str = "transcript") -> dict[str, str]:
    return {"text": text, "source": source}


def package(**findings: list[str]) -> dict:
    categories = ("requirements", "challenges", "priorities", "opportunities", "discussed_solutions", "decisions", "follow_ups")
    return {"findings": {name: [finding(text) for text in findings.get(name, [])] for name in categories}, "excluded_findings": [], "meeting_extraction": {"execution_mode": "live"}}


def statics(project: str, client: str, first_name: str) -> dict:
    return {
        "project_name": project, "client_short": client, "salutation_style": "informal",
        "standard_recipients": [{"email": "contact@client.example", "first_name": first_name, "last_name": "Test", "salutation": "Ms", "kind": "to", "primary": True}],
        "sender_profile": {"name": "Alex Weber", "role": "AI Solutions Lead", "email": "alex.weber@borek.example"},
    }


CASES = {
    "allianz": (statics("Allianz claims intake", "Allianz", "Julia"), package(
        requirements=["Motor claims below 2,000 euros must be settled within two working days.", "Every automated decision must be explainable to the claims auditor."],
        challenges=["Claim documents arrive by email, portal and post and are keyed in by hand.", "The claims system and the document archive are not connected."],
        priorities=["Start with motor claims in the Munich service centre."],
        discussed_solutions=["A document intake assistant that classifies incoming claim documents and pre-fills the claim record.", "A reviewer view that shows the source passage for every extracted value."],
        opportunities=["The same intake could later be reused for property claims."],
        decisions=["Run a six-week pilot with motor claims in Munich.", "Data stays in the Allianz tenant during the pilot."],
        follow_ups=["Borek will send a pilot outline by 23.10.2026.", "Markus Thiel will provide 200 anonymised sample claims by 30.10.2026.", "Arrange a workshop with the claims audit team."],
    )),
    "facebook": (statics("Facebook support operations", "Facebook", "Maya"), package(
        requirements=["The assistant must produce a short case summary, identify the customer issue, and recommend the appropriate internal queue with an explanation.",
                      "Every suggested answer must link back to an approved knowledge source or policy reference so an agent can verify it before use."],
        challenges=["Incoming advertiser support cases are spread across multiple queues, and agents spend time reading long histories before deciding who owns the next step."],
        priorities=["The first pilot should focus on support-agent assistance, not autonomous decisions about advertiser accounts or policy enforcement."],
        discussed_solutions=["BOREK proposes a support copilot that ingests an authorized case summary, retrieves approved articles, and returns a cited response draft for an agent to edit."],
        decisions=["No autonomous account changes, policy enforcement actions, or outbound customer messages are permitted in the pilot."],
        follow_ups=["The security and privacy contacts will document the pilot's data-handling restrictions and the approval steps for any future internal system access."],
    )),
    "schnellecke": (statics("Schnellecke sequencing", "Schnellecke", "Henrik"), package(
        requirements=["Sequencing errors at the Wolfsburg cross-dock must be detected before a truck leaves the yard.", "Shift leaders need the exception list on the handheld scanners they already use."],
        challenges=["Delivery schedules from the OEM change several times per shift and are re-entered in the warehouse system by hand.", "Each site maintains its own Excel list of recurring packing errors."],
        priorities=["Start with inbound sequencing at one site before any rollout."],
        discussed_solutions=["An exception monitor that compares the latest delivery schedule with the loading plan and flags mismatches.", "A shared error catalogue that replaces the site-specific Excel lists."],
        opportunities=["The exception monitor could later cover outbound just-in-sequence deliveries."],
        decisions=["Use the Wolfsburg cross-dock as the pilot site."],
        follow_ups=["Borek will send a pilot proposal by 30.10.2026.", "Petra Lang will share one week of anonymised schedule changes."],
    )),
}


@pytest.fixture(scope="module")
def results(request: pytest.FixtureRequest) -> dict:
    if os.environ.get("BOREK_ALLOW_LIVE_MODEL_CALLS", "").strip() != "1":
        pytest.skip("Live model calls are not authorised for this run: set BOREK_ALLOW_LIVE_MODEL_CALLS=1 to send the synthetic findings to the model.")
    # Decided locally, before anything is sent: a missing, placeholder or malformed key makes no request.
    # The key comes from BOREK_LIVE_ANTHROPIC_API_KEY or .env, as in the smoke test, and is put back afterwards.
    key = live_key()
    problem = claude_credentials_problem(key)
    if problem:
        pytest.skip(f"{problem[1]} The live writing check needs valid model credentials.")
    previous = os.environ.get("ANTHROPIC_API_KEY")
    os.environ["ANTHROPIC_API_KEY"] = key
    request.addfinalizer(lambda: os.environ.__setitem__("ANTHROPIC_API_KEY", previous) if previous is not None else os.environ.pop("ANTHROPIC_API_KEY", None))

    def call(tool: str):
        return lambda system, user, schema: structured_complete(system, user, schema, tool_name=tool, tool_description="Submit the result.", max_tokens=8000)

    written = {}
    for name, (owner_details, frozen) in CASES.items():
        content = content_from_snapshot(frozen)
        try:
            written[name] = (write_with_ai(content, owner_details, writer=call("submit_followup_email"), verifier=call("submit_grounding_verdicts")), content)
        except ClaudeClientError as exc:
            if getattr(exc, "code", "") == "CLAUDE_AUTH":
                pytest.skip("The configured ANTHROPIC_API_KEY was rejected: the live writing check needs valid model credentials.")
            raise
        except AiWriterRejected as exc:
            pytest.fail(f"{name}: the model's draft was rejected twice ({exc.code}): {exc.issues[:5]}")
    return written


def test_the_model_writes_three_grounded_emails_per_client(results: dict) -> None:
    for name, (result, content) in results.items():
        record = result["verification"]
        print(f"\n===== {name}: accepted on attempt {record['attempts']}, {record['sentence_count']} sentences, facts cited {record['cited_fact_ids']}")
        for length in ("short", "medium", "extensive"):
            body = result["variants"]["attached"][length]
            print(f"\n--- {name} / {length} ({followup_content_word_count(body)} of {WORD_CAPS[length]} words)\n{body}")
            assert followup_content_word_count(body) <= WORD_CAPS[length]
            assert "attach" not in result["variants"]["plain"][length].lower()
        known = {fact["id"] for fact in facts_from_content(content)}
        assert set(record["cited_fact_ids"]) <= known and all(item["fact_ids"] or item["kind"] != "context" for item in record["sentences"])


def test_each_client_gets_its_own_wording(results: dict) -> None:
    """Beyond the names: the sentences of one client's email do not reappear in another's."""
    sentences = {name: {item["text"] for item in result["verification"]["sentences"] if item["length"] == "medium" and item["fact_ids"]} for name, (result, _content) in results.items()}
    for name, own in sentences.items():
        others = set().union(*[texts for other, texts in sentences.items() if other != name])
        assert not own & others, f"{name} shares fact-bearing sentences with another client"
