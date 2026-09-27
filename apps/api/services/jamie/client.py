"""TSK-009 — meeting ingest behind a client interface.

Dummy mode loads a frozen payload. Live Jamie maps vendor JSON onto the same
schema later. Downstream never reads Jamie's native shape.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Protocol

from jsonschema import Draft202012Validator, FormatChecker, ValidationError

SCHEMA_PATH = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "contracts"
    / "jamie_ingest.schema.json"
)
FIXTURE_PATH = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "contracts"
    / "fixtures"
    / "jamie_ingest"
    / "dummy_workshop.json"
)

DUMMY_MEETING_ID = "dummy-meeting-workshop-001"


class JamieIngestError(ValueError):
    pass


def load_ingest_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def validate_ingest(payload: dict[str, Any]) -> None:
    try:
        Draft202012Validator(
            load_ingest_schema(), format_checker=FormatChecker()
        ).validate(payload)
    except ValidationError as exc:
        raise JamieIngestError(exc.message) from exc


def load_dummy_fixture() -> dict[str, Any]:
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    validate_ingest(payload)
    if payload.get("source") != "dummy":
        raise JamieIngestError("dummy fixture must set source=dummy")
    return payload


class JamieClient(Protocol):
    def fetch_finished_meeting(self, meeting_id: str) -> dict[str, Any]: ...


class DummyJamieClient:
    """Deterministic ingest for pipeline work until live credentials exist."""

    def fetch_finished_meeting(self, meeting_id: str) -> dict[str, Any]:
        wanted = (meeting_id or "").strip() or DUMMY_MEETING_ID
        if wanted != DUMMY_MEETING_ID:
            raise JamieIngestError(
                f"dummy adapter only serves {DUMMY_MEETING_ID}, not {wanted}"
            )
        return load_dummy_fixture()


def jamie_execution_mode() -> str:
    mode = (os.environ.get("JAMIE_EXECUTION_MODE") or "dummy").strip().lower()
    if mode not in {"dummy", "live"}:
        raise JamieIngestError("JAMIE_EXECUTION_MODE must be dummy or live")
    return mode


def get_jamie_client() -> JamieClient:
    if jamie_execution_mode() == "live":
        raise JamieIngestError(
            "live Jamie client is not wired; keep JAMIE_EXECUTION_MODE=dummy"
        )
    return DummyJamieClient()
