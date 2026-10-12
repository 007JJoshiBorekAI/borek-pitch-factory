"""Smallest possible live check of the AI follow-up email writer: one client, one length.

    synthetic Allianz findings -> medium email -> grounding verifier

At most two requests are made (writer, verifier); a draft that fails the rule checks ends the run
after one. There is no correction round and no retry of any kind: not for a truncated answer, not
in the SDK. Output is capped per call. Token usage, model, verdict and an estimated cost are
printed and written to a small report file.

It is deselected by default and makes no request unless all of this holds:

    -m live_claude                       the test is selected on purpose
    BOREK_ALLOW_LIVE_MODEL_CALLS=1       live calls are explicitly authorised for this run
    a usable key                         BOREK_LIVE_ANTHROPIC_API_KEY in the shell, or
                                         ANTHROPIC_API_KEY in the repository's git-ignored .env

    BOREK_ALLOW_LIVE_MODEL_CALLS=1 pytest tests/integration/followup/test_ai_writer_live_smoke.py -m live_claude -s

The key is read for this one test and put back afterwards. Nothing else is touched: no API, no
store, no Docker environment, no AI_EXECUTION_MODE - the application stays in fixture mode.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import pytest
from dotenv import dotenv_values

from llm.claude import client as claude_client
from llm.claude.client import ClaudeClientError, claude_credentials_problem, sonnet_model, structured_complete
from services.followup.ai_writer import AiWriterRejected, facts_from_content, write_with_ai
from services.followup.finalized import WORD_CAPS, content_from_snapshot
from services.followup.rendering import followup_content_word_count

pytestmark = pytest.mark.live_claude

ROOT = Path(__file__).resolve().parents[3]
REPORT = Path(tempfile.gettempdir()) / "borek-followup-live-smoke.json"
# Enough for one medium email as sentences with their fact ids, and for one verdict per sentence.
WRITER_MAX_OUTPUT_TOKENS = 1200
VERIFIER_MAX_OUTPUT_TOKENS = 800
REQUEST_TIMEOUT_SECONDS = 120.0
# USD per million tokens (input, output): Anthropic list prices as known when this was written.
# Check the current price list before relying on the estimate; an unknown model gets none.
PRICES_PER_MILLION = {"claude-sonnet-4": (3.00, 15.00), "claude-opus-4": (15.00, 75.00), "claude-haiku-4": (1.00, 5.00)}

STATICS = {
    "project_name": "Allianz claims intake", "client_short": "Allianz", "salutation_style": "informal",
    "standard_recipients": [{"email": "julia.brandt@allianz.example", "first_name": "Julia", "last_name": "Brandt", "salutation": "Ms", "kind": "to", "primary": True}],
    "sender_profile": {"name": "Alex Weber", "role": "AI Solutions Lead", "email": "alex.weber@borek.example"},
}
FINDINGS = {
    "requirements": ["Motor claims below 2,000 euros must be settled within two working days.", "Every automated decision must be explainable to the claims auditor."],
    "challenges": ["Claim documents arrive by email, portal and post and are keyed in by hand.", "The claims system and the document archive are not connected."],
    "priorities": ["Start with motor claims in the Munich service centre."],
    "discussed_solutions": ["A document intake assistant that classifies incoming claim documents and pre-fills the claim record.", "A reviewer view that shows the source passage for every extracted value."],
    "opportunities": ["The same intake could later be reused for property claims."],
    "decisions": ["Run a six-week pilot with motor claims in Munich.", "Data stays in the Allianz tenant during the pilot."],
    "follow_ups": ["Borek will send a pilot outline by 23.10.2026.", "Markus Thiel will provide 200 anonymised sample claims by 30.10.2026.", "Arrange a workshop with the claims audit team."],
}


def synthetic_content() -> dict:
    package = {
        "findings": {name: [{"text": text, "source": "transcript"} for text in FINDINGS.get(name, [])] for name in
                     ("requirements", "challenges", "priorities", "opportunities", "discussed_solutions", "decisions", "follow_ups")},
        "excluded_findings": [], "meeting_extraction": {"execution_mode": "live"},
    }
    return content_from_snapshot(package)


def live_key() -> str:
    """The key for this test only. The integration test configuration replaces ANTHROPIC_API_KEY
    with a placeholder, so the key is taken from its own variable or straight from .env."""
    return (os.environ.get("BOREK_LIVE_ANTHROPIC_API_KEY") or dotenv_values(ROOT / ".env").get("ANTHROPIC_API_KEY") or "").strip()


def estimated_cost(model: str, input_tokens: int, output_tokens: int) -> float | None:
    for prefix, (per_input, per_output) in PRICES_PER_MILLION.items():
        if model.startswith(prefix):
            return round(input_tokens / 1_000_000 * per_input + output_tokens / 1_000_000 * per_output, 5)
    return None


def test_the_preparation_makes_no_request_and_keeps_the_application_in_fixture_mode() -> None:
    """Runs without credentials and without permission: what would be sent, and that nothing is."""
    facts = facts_from_content(synthetic_content())
    assert [fact["id"] for fact in facts] == ["R1", "R2", "C1", "C2", "P1", "D1", "D2", "S1", "S2", "O1", "N1", "N2", "N3"]
    assert estimated_cost("claude-sonnet-4-5", 3000, 2000) == 0.039 and estimated_cost("some-other-model", 1, 1) is None
    assert WRITER_MAX_OUTPUT_TOKENS <= 1500 and VERIFIER_MAX_OUTPUT_TOKENS <= 1000
    assert os.environ.get("AI_EXECUTION_MODE") == "fixture"


def test_one_grounded_medium_email_for_allianz(monkeypatch: pytest.MonkeyPatch) -> None:
    if os.environ.get("BOREK_ALLOW_LIVE_MODEL_CALLS", "").strip() != "1":
        pytest.skip("Live model calls are not authorised for this run: set BOREK_ALLOW_LIVE_MODEL_CALLS=1.")
    key = live_key()
    problem = claude_credentials_problem(key)
    if problem:
        pytest.skip(f"{problem[1]} Provide a valid key in BOREK_LIVE_ANTHROPIC_API_KEY or in .env.")

    import anthropic

    usage: list = []
    requests: list[str] = []

    def one_request(create_kwargs: dict, api_key: str):
        """The shared client's request, with no retry inside the SDK and a short timeout."""
        requests.append(create_kwargs["tools"][0]["name"])
        with anthropic.Anthropic(api_key=api_key, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=0).messages.stream(**create_kwargs) as stream:
            return stream.get_final_message()

    # All three are put back when the test ends.
    monkeypatch.setenv("ANTHROPIC_API_KEY", key)
    monkeypatch.setattr(claude_client, "_stream_final_message", one_request)
    monkeypatch.setattr(claude_client, "_MAX_TRUNCATION_RETRIES", 0)  # a truncated answer is an error, not a second request with a larger limit

    def call(tool: str, limit: int):
        return lambda system, user, schema: structured_complete(system, user, schema, tool_name=tool, tool_description="Submit the result.", max_tokens=limit, usage_out=usage)

    model = sonnet_model()
    report: dict = {"client": "Allianz (synthetic)", "length": "medium", "model": model, "accepted": False, "verifier_result": "not reached"}
    result = None
    try:
        result = write_with_ai(
            synthetic_content(), STATICS, lengths=("medium",), max_attempts=1,
            writer=call("submit_followup_email", WRITER_MAX_OUTPUT_TOKENS), verifier=call("submit_grounding_verdicts", VERIFIER_MAX_OUTPUT_TOKENS),
        )
        report.update(accepted=True, verifier_result="every sentence supported")
    except AiWriterRejected as exc:
        by_verifier = any(issue["code"] in ("UNSUPPORTED", "UNVERIFIED") for issue in exc.issues)
        report.update(verifier_result="rejected by the verifier" if by_verifier else "not reached: rejected by the rule checks", rejection={"code": exc.code, "issues": exc.issues[:20]})
    except ClaudeClientError as exc:
        report.update(verifier_result="not reached", error={"code": str(getattr(exc, "code", "") or "CLAUDE_ERROR"), "message": exc.user_message})

    def tokens(field: str) -> int:
        return sum(int(getattr(item, field, 0) or 0) for item in usage if item is not None)

    report.update(
        requests=requests, input_tokens=tokens("input_tokens"), output_tokens=tokens("output_tokens"),
        per_request=[{"request": name, "input_tokens": int(getattr(item, "input_tokens", 0) or 0), "output_tokens": int(getattr(item, "output_tokens", 0) or 0)} for name, item in zip(requests, usage)],
    )
    report["estimated_cost_usd"] = estimated_cost(model, report["input_tokens"], report["output_tokens"])
    if result:
        body = result["variants"]["attached"]["medium"]
        record = result["verification"]
        report.update(
            words=followup_content_word_count(body), word_limit=WORD_CAPS["medium"], sentence_count=record["sentence_count"],
            cited_fact_ids=record["cited_fact_ids"], sentences=[{"text": item["text"], "kind": item["kind"], "fact_ids": item["fact_ids"]} for item in record["sentences"]],
            email=body,
        )
    REPORT.write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    print("\n" + json.dumps({key_: value for key_, value in report.items() if key_ not in ("email", "sentences")}, indent=1, ensure_ascii=False))
    if result:
        print("\n" + report["email"])
    print(f"\nReport: {REPORT}")

    assert len(requests) <= 2, "one writer request and at most one verifier request"
    assert "error" not in report, report.get("error")
    assert report["accepted"], f"The draft was not accepted ({report['verifier_result']}); see {REPORT}"
    assert report["words"] <= WORD_CAPS["medium"]
