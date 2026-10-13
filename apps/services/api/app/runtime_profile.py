"""Runtime execution profile helpers (AT-50 / AT-51)."""

from __future__ import annotations

import logging
from typing import Any

from app.config import Settings, settings

logger = logging.getLogger(__name__)

_FIXTURE_WITH_SUPABASE_WARNING = (
    "AI_EXECUTION_MODE=fixture with API_DATA_BACKEND=supabase: Stage A/B use "
    "deterministic fixtures (same plan/slide content every run). Set "
    "AI_EXECUTION_MODE=live in .env for API and worker when testing real transcripts."
)
_DEV_AUTH_ACTIVE_WARNING = (
    "AUTH_BYPASS=true: JWT auth is skipped and every request acts as DEV_AUTH_EMAIL. "
    "Local development only."
)
_DEV_AUTH_IGNORED_WARNING = (
    "AUTH_BYPASS=true is ignored because RUNTIME_PROFILE=production; a valid access token is required."
)
_PRODUCTION_FIXTURE_REFUSAL = (
    "RUNTIME_PROFILE=production cannot use AI_EXECUTION_MODE=fixture. "
    "Fixture Frameworks are for tests and local development only."
)


class ProductionFixtureModeError(RuntimeError):
    """Production must not silently serve the stub Framework template."""

    code = "UNSAFE_RUNTIME_PROFILE"


def runtime_profile(current: Settings | None = None) -> dict[str, str]:
    """Return the active backend execution modes for diagnostics."""
    cfg = current or settings
    return {
        "ai_execution_mode": cfg.AI_EXECUTION_MODE,
        "renderer_execution_mode": cfg.RENDERER_EXECUTION_MODE,
        "api_data_backend": cfg.API_DATA_BACKEND,
        "filing_destination": cfg.FILING_DESTINATION,
    }


def assert_live_frameworks_in_production(
    current: Settings | None = None,
    *,
    execution_mode: str | None = None,
) -> None:
    """Refuse production processes that would silently emit the stub Framework."""
    cfg = current or settings
    mode = execution_mode if execution_mode is not None else cfg.AI_EXECUTION_MODE
    if cfg.RUNTIME_PROFILE == "production" and mode != "live":
        raise ProductionFixtureModeError(_PRODUCTION_FIXTURE_REFUSAL)


def auth_mode(current: Settings | None = None) -> str:
    """dev_bypass when the development bypass is active, otherwise supabase_jwt."""
    cfg = current or settings
    return "dev_bypass" if cfg.dev_auth_active else "supabase_jwt"


def _auth_warnings(cfg: Settings) -> list[str]:
    if cfg.AUTH_BYPASS and not cfg.dev_auth_active:
        return [_DEV_AUTH_IGNORED_WARNING]
    return [_DEV_AUTH_ACTIVE_WARNING] if cfg.dev_auth_active else []


def log_runtime_profile(*, component: str, current: Settings | None = None) -> None:
    """Log execution modes at process startup and warn on common misconfiguration."""
    cfg = current or settings
    assert_live_frameworks_in_production(cfg)
    profile = runtime_profile(cfg)
    logger.info(
        "%s runtime profile: ai_execution_mode=%s renderer_execution_mode=%s "
        "api_data_backend=%s filing_destination=%s",
        component,
        profile["ai_execution_mode"],
        profile["renderer_execution_mode"],
        profile["api_data_backend"],
        profile["filing_destination"],
    )
    if cfg.API_DATA_BACKEND == "supabase" and cfg.AI_EXECUTION_MODE == "fixture":
        logger.warning(_FIXTURE_WITH_SUPABASE_WARNING)
    for warning in _auth_warnings(cfg):
        logger.warning(warning)


def runtime_warnings(current: Settings | None = None) -> list[str]:
    """Human-readable warnings for /health/runtime and ops checks."""
    cfg = current or settings
    warnings: list[str] = _auth_warnings(cfg)
    if cfg.RUNTIME_PROFILE == "production" and cfg.AI_EXECUTION_MODE != "live":
        warnings.append(_PRODUCTION_FIXTURE_REFUSAL)
    if cfg.API_DATA_BACKEND == "supabase" and cfg.AI_EXECUTION_MODE == "fixture":
        warnings.append(_FIXTURE_WITH_SUPABASE_WARNING)
    if (
        cfg.AI_EXECUTION_MODE == "live"
        and cfg.STAGE_B_LLM_PROVIDER == "openai"
        and not cfg.OPENAI_API_KEY.strip()
    ):
        warnings.append(
            "AI_EXECUTION_MODE=live but OPENAI_API_KEY is empty: presentation planning will fail."
        )
    if cfg.FILING_DESTINATION == "live" and (
        not cfg.ENTERPRISE_REPOSITORY_URL.strip() or not cfg.ENTERPRISE_REPOSITORY_TOKEN.strip()
    ):
        warnings.append(
            "FILING_DESTINATION=live but ENTERPRISE_REPOSITORY_URL or "
            "ENTERPRISE_REPOSITORY_TOKEN is empty; filing is fail-closed until O2 names the repository."
        )
    return warnings


def runtime_health_payload(current: Settings | None = None) -> dict[str, Any]:
    profile = runtime_profile(current)
    return {
        "status": "ok",
        **profile,
        "auth_mode": auth_mode(current),
        "warnings": runtime_warnings(current),
    }
