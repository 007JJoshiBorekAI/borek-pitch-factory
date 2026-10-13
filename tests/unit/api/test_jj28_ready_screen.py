"""Ready-screen downloads use the internal deck. A historical export is only a fallback."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.data.memory_store import get_memory_store

USER_ID = uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
GAMMA_PPTX = b"gamma-export-pptx-bytes"
GAMMA_PDF = b"gamma-export-pdf-bytes"


def _headers() -> dict[str, str]:
    token = create_test_access_token(
        user_id=USER_ID,
        email="owner@example.com",
        secret=settings.SUPABASE_JWT_SECRET,
    )
    return {"Authorization": f"Bearer {token}"}


def _ready_presentation(client: TestClient) -> tuple[str, str]:
    """Drive the pipeline to a ready deck and return (opportunity_id, presentation_id)."""
    opportunity = client.post(
        "/opportunities",
        headers=_headers(),
        json={
            "client_name": "Acme Corp",
            "opportunity_name": "Invoice Automation",
            "department": "Finance",
        },
    )
    assert opportunity.status_code == 201
    opportunity_id = opportunity.json()["id"]

    client.post(f"/opportunities/{opportunity_id}/framework/generate", headers=_headers())
    confirm = client.post(
        f"/opportunities/{opportunity_id}/framework/confirm",
        headers=_headers(),
        json={},
    )
    assert confirm.status_code == 200

    client.post(
        f"/opportunities/{opportunity_id}/presentation-plan/generate",
        headers=_headers(),
        json={},
    )
    generate = client.post(
        f"/opportunities/{opportunity_id}/presentation/generate",
        headers=_headers(),
        json={},
    )
    assert generate.status_code == 202
    return opportunity_id, generate.json()["presentation_id"]


def _write_gamma_export(
    root: Path,
    *,
    opportunity_id: str,
    presentation_id: str,
) -> None:
    version = get_memory_store().get_presentation_version_assets(
        presentation_id=uuid.UUID(presentation_id),
        user_id=USER_ID,
    )
    directory = root / "gamma" / opportunity_id / str(version["id"])
    directory.mkdir(parents=True, exist_ok=True)
    generation_id = uuid.uuid4()
    (directory / f"{generation_id}.pptx").write_bytes(GAMMA_PPTX)
    (directory / f"{generation_id}.pdf").write_bytes(GAMMA_PDF)


def test_internal_deck_is_preferred_over_a_historical_export(
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "ARTIFACT_ROOT", str(tmp_path))
    client = TestClient(create_app())
    opportunity_id, presentation_id = _ready_presentation(client)

    internal = client.get(
        f"/presentations/{presentation_id}/download/pptx",
        headers=_headers(),
    )
    assert internal.status_code == 200
    assert internal.content != GAMMA_PPTX

    _write_gamma_export(
        tmp_path,
        opportunity_id=opportunity_id,
        presentation_id=presentation_id,
    )

    pptx = client.get(
        f"/presentations/{presentation_id}/download/pptx",
        headers=_headers(),
    )
    assert pptx.status_code == 200
    assert pptx.content == internal.content
    assert pptx.content != GAMMA_PPTX
    assert (
        pptx.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
    assert f"{presentation_id}.pptx" in pptx.headers["content-disposition"]

    version = get_memory_store().get_presentation_version_assets(
        presentation_id=uuid.UUID(presentation_id),
        user_id=USER_ID,
    )
    Path(version["pptx_storage_path"]).unlink()
    Path(version["pdf_storage_path"]).unlink()

    historical_pptx = client.get(
        f"/presentations/{presentation_id}/download/pptx",
        headers=_headers(),
    )
    historical_pdf = client.get(
        f"/presentations/{presentation_id}/download/pdf",
        headers=_headers(),
    )
    assert historical_pptx.status_code == 200
    assert historical_pptx.content == GAMMA_PPTX
    assert historical_pdf.status_code == 200
    assert historical_pdf.content == GAMMA_PDF


def test_deck_payload_never_names_the_engine(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "ARTIFACT_ROOT", str(tmp_path))
    client = TestClient(create_app())
    opportunity_id, presentation_id = _ready_presentation(client)
    _write_gamma_export(
        tmp_path,
        opportunity_id=opportunity_id,
        presentation_id=presentation_id,
    )

    deck = client.get(f"/presentations/{presentation_id}/deck", headers=_headers())
    assert deck.status_code == 200
    body = deck.json()

    assert set(body) == {
        "presentation_id",
        "presentation_name",
        "version_number",
        "status",
        "slides",
        "pptx_download_url",
        "pdf_download_url",
    }
    assert "gamma" not in deck.text.lower()
    assert body["pptx_download_url"] == f"/presentations/{presentation_id}/download/pptx"
    assert body["pdf_download_url"] == f"/presentations/{presentation_id}/download/pdf"
    assert body["slides"]
    assert all(slide["preview_url"].endswith(".png") for slide in body["slides"])
