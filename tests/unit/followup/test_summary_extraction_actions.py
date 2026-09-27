from uuid import uuid4

from services.followup.summary_extraction import extract_followup_from_summary
from services.transcript.speaker_turns import split_speaker_turns
from services.transcript.summarize import summarize_speaker_sections

TEXT = (
    "Lena Hoffmann (BOREK): We decided the interface will be REST, not SOAP.\n"
    "Markus Weber (Acme): Agreed. I will provide test invoices by 18.09.2026.\n"
    "Lena Hoffmann (BOREK): I will deliver the interface specification by 25.09.2026.\n"
)


def test_transcript_lines_yield_action_items() -> None:
    sections = [
        {"speaker_role": turn.speaker, "content": turn.text}
        for turn in split_speaker_turns("workshop.txt", TEXT.encode())
    ]
    summary = summarize_speaker_sections(sections, opportunity_id=uuid4(), transcript_id=uuid4())
    haystack = "\n".join(f"{s['speaker_role']}: {s['content']}" for s in sections)
    extraction = extract_followup_from_summary(
        summary,
        meeting_topic="Invoice matching",
        transcript_haystack=haystack,
        sections=sections,
    )
    assert extraction["action_items"]
