from uuid import uuid4

from services.transcript.summarize import (
    format_transcript_summary_for_prompt,
    summarize_transcript_text,
)


def test_summary_prompt_has_no_raw_turn_markers() -> None:
    transcript = "Ada: We agreed REST.\nBob: I will send the protocol."
    summary = summarize_transcript_text(
        transcript,
        opportunity_id=uuid4(),
        transcript_id=uuid4(),
    )
    block = format_transcript_summary_for_prompt(summary)
    assert "TRANSCRIPT_SUMMARY_BEGIN" in block
    assert "UNTRUSTED_TRANSCRIPT_BEGIN" not in block
    assert "Ada:" not in block
    assert "REST" in summary["narrative"]
