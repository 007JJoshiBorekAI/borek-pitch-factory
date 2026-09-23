"""BT-34: map flat Stage 1 DB columns ↔ nested stage1_intake API object."""

from __future__ import annotations

from typing import Any
from uuid import UUID

STAGE1_DB_COLUMNS = (
    "client_web_page",
    "poc_name",
    "poc_position",
    "sales_topic_description",
    "about_company",
    "voice_recording_artifact_id",
)

STAGE1_NESTED_FIELDS = (
    "client_web_page",
    "poc_name",
    "poc_position",
    "sales_topic_description",
    "about_company",
)


def intake_nested_from_row(row: dict[str, Any]) -> dict[str, Any] | None:
    """Build nested stage1_intake for API responses."""
    if not any(row.get(key) is not None for key in STAGE1_NESTED_FIELDS):
        return None
    return {key: row.get(key) for key in STAGE1_NESTED_FIELDS}


def present_opportunity(row: dict[str, Any]) -> dict[str, Any]:
    """Remove flat intake columns and attach nested stage1_intake."""
    result = {key: value for key, value in row.items() if key not in STAGE1_DB_COLUMNS}
    result["stage1_intake"] = intake_nested_from_row(row)
    return result


def apply_intake_columns(
    payload: dict[str, Any],
    intake: dict[str, Any] | None,
) -> dict[str, Any]:
    """Write nested intake onto flat DB/API create payload columns."""
    if intake is None:
        return payload
    for key in STAGE1_NESTED_FIELDS:
        payload[key] = intake.get(key)
    return payload


def expand_opportunity_updates(updates: dict[str, Any]) -> dict[str, Any]:
    """Expand stage1_intake PATCH semantics onto flat nullable columns.

    - Omitted stage1_intake: unchanged (caller must not include the key).
    - Provided object: replaces all nested text fields; clears voice artifact.
    - Explicit null: clears all Stage 1 intake columns.
    """
    if "stage1_intake" not in updates:
        return updates
    intake = updates.pop("stage1_intake")
    expanded = dict(updates)
    if intake is None:
        for key in STAGE1_DB_COLUMNS:
            expanded[key] = None
        return expanded
    for key in STAGE1_NESTED_FIELDS:
        expanded[key] = intake.get(key)
    expanded["voice_recording_artifact_id"] = None
    return expanded


def legacy_row_without_intake_columns(row: dict[str, Any]) -> dict[str, Any]:
    """Normalize legacy rows missing new columns to explicit nulls."""
    normalized = dict(row)
    for key in STAGE1_DB_COLUMNS:
        normalized.setdefault(key, None)
    artifact_id = normalized.get("voice_recording_artifact_id")
    if artifact_id is not None:
        normalized["voice_recording_artifact_id"] = UUID(str(artifact_id))
    return normalized
