"""TSK-009 dummy ingest — fixture validates; live client is not faked."""

from __future__ import annotations

import pytest

from services.jamie.client import (
    DUMMY_MEETING_ID,
    DummyJamieClient,
    JamieIngestError,
    get_jamie_client,
    load_dummy_fixture,
    validate_ingest,
)


def test_dummy_fixture_validates() -> None:
    payload = load_dummy_fixture()
    assert payload["source"] == "dummy"
    assert payload["jamie_meeting_id"] == DUMMY_MEETING_ID
    assert payload["speaker_turns"]
    assert payload["participants"]
    assert payload["opportunity_id"]


def test_dummy_client_returns_fixture() -> None:
    client = DummyJamieClient()
    payload = client.fetch_finished_meeting(DUMMY_MEETING_ID)
    assert payload == load_dummy_fixture()


def test_dummy_client_rejects_unknown_meeting() -> None:
    with pytest.raises(JamieIngestError):
        DummyJamieClient().fetch_finished_meeting("jamie-live-id")


def test_live_mode_refuses_until_wired(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JAMIE_EXECUTION_MODE", "live")
    with pytest.raises(JamieIngestError, match="not wired"):
        get_jamie_client()


def test_default_mode_is_dummy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("JAMIE_EXECUTION_MODE", raising=False)
    client = get_jamie_client()
    assert isinstance(client, DummyJamieClient)


def test_validate_rejects_live_source_on_dummy_shape() -> None:
    payload = load_dummy_fixture()
    payload["source"] = "not-a-source"
    with pytest.raises(JamieIngestError):
        validate_ingest(payload)
