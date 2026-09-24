"""BT-36: map persisted journey artefacts off the public opportunity GET."""

from __future__ import annotations

from typing import Any

JOURNEY_OUTPUT_DB_COLUMNS = (
    "meeting_feedback_text",
    "meeting_feedback_updated_at",
    "stage1_outputs",
    "stage2_outputs",
    "email_drafts",
    "first_meeting_details",
)


def strip_journey_output_columns(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if key not in JOURNEY_OUTPUT_DB_COLUMNS}
