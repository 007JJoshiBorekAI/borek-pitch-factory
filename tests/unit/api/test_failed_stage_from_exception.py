"""Map classified failures to the pipeline stage that actually failed."""

from __future__ import annotations

from app.schemas.jobs import JobStage
from app.services.api_errors import failed_stage_from_exception


class _RendererTimeout(Exception):
    code = "RENDERER_TIMEOUT"


class _HistoricalProviderTimeout(Exception):
    code = "GAMMA_TIMEOUT"


def test_renderer_timeout_maps_to_pptx_rendering_stage() -> None:
    assert failed_stage_from_exception(_RendererTimeout()) == JobStage.PPTX_RENDERING


def test_historical_provider_timeout_maps_to_pptx_rendering_stage() -> None:
    assert failed_stage_from_exception(_HistoricalProviderTimeout()) == JobStage.PPTX_RENDERING


def test_pre_generation_errors_default_to_slide_generating() -> None:
    class PlanError(Exception):
        code = "PRESENTATION_PLAN_NOT_GENERATABLE"

    assert failed_stage_from_exception(PlanError("bad plan")) == JobStage.SLIDE_GENERATING
