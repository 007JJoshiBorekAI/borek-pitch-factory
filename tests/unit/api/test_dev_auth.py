"""Development-only auth bypass: explicit identity, non-production only."""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.auth import create_test_access_token
from app.config import Settings, settings
from app.main import create_app
from app.runtime_profile import auth_mode, runtime_health_payload, runtime_warnings

DEV_USER_ID = "00000000-0000-4000-8000-0000000000d1"
DEV_EMAIL = "local-dev@borek.localhost"


def _settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)


def _enable_dev_auth(monkeypatch: pytest.MonkeyPatch, *, profile: str = "development") -> None:
    monkeypatch.setattr(settings, "AUTH_BYPASS", True)
    monkeypatch.setattr(settings, "RUNTIME_PROFILE", profile)
    monkeypatch.setattr(settings, "DEV_AUTH_USER_ID", DEV_USER_ID)
    monkeypatch.setattr(settings, "DEV_AUTH_EMAIL", DEV_EMAIL)


def test_bypass_is_off_by_default() -> None:
    cfg = _settings()
    assert cfg.dev_auth_active is False
    assert auth_mode(cfg) == "supabase_jwt"


@pytest.mark.parametrize(
    "identity",
    [
        {},
        {"DEV_AUTH_USER_ID": DEV_USER_ID},
        {"DEV_AUTH_EMAIL": DEV_EMAIL},
        {"DEV_AUTH_USER_ID": "not-a-uuid", "DEV_AUTH_EMAIL": DEV_EMAIL},
        {"DEV_AUTH_USER_ID": DEV_USER_ID, "DEV_AUTH_EMAIL": "not-an-email"},
        {"DEV_AUTH_USER_ID": "   ", "DEV_AUTH_EMAIL": "   "},
    ],
)
def test_bypass_without_valid_identity_fails_at_startup(identity: dict[str, str]) -> None:
    with pytest.raises(ValidationError, match="AUTH_BYPASS=true requires DEV_AUTH_"):
        _settings(AUTH_BYPASS=True, RUNTIME_PROFILE="development", API_DATA_BACKEND="memory", **identity)


def test_bypass_with_explicit_identity_is_active_outside_production() -> None:
    for profile in ("development", "test"):
        cfg = _settings(
            AUTH_BYPASS=True,
            RUNTIME_PROFILE=profile,
            API_DATA_BACKEND="memory",
            DEV_AUTH_USER_ID=DEV_USER_ID,
            DEV_AUTH_EMAIL=DEV_EMAIL,
        )
        assert cfg.dev_auth_active is True
        assert auth_mode(cfg) == "dev_bypass"
        assert any("AUTH_BYPASS=true" in warning for warning in runtime_warnings(cfg))


def test_bypass_is_ignored_in_production_even_with_identity() -> None:
    cfg = _settings(
        AUTH_BYPASS=True,
        RUNTIME_PROFILE="production",
        AI_EXECUTION_MODE="live",
        DEV_AUTH_USER_ID=DEV_USER_ID,
        DEV_AUTH_EMAIL=DEV_EMAIL,
    )
    assert cfg.dev_auth_active is False
    payload = runtime_health_payload(cfg)
    assert payload["auth_mode"] == "supabase_jwt"
    assert any("ignored" in warning for warning in payload["warnings"])


@pytest.mark.parametrize("profile", ["development", "test"])
@pytest.mark.parametrize("backend", ["supabase", "postgres", ""])
def test_bypass_with_non_memory_backend_fails_at_startup(profile: str, backend: str) -> None:
    with pytest.raises(ValidationError, match="only supported with API_DATA_BACKEND=memory") as exc_info:
        _settings(
            AUTH_BYPASS=True,
            RUNTIME_PROFILE=profile,
            API_DATA_BACKEND=backend,
            DEV_AUTH_USER_ID=DEV_USER_ID,
            DEV_AUTH_EMAIL=DEV_EMAIL,
        )
    assert "real Microsoft/Supabase sign-in" in str(exc_info.value)


def test_supabase_backend_without_bypass_still_starts() -> None:
    cfg = _settings(AUTH_BYPASS=False, API_DATA_BACKEND="supabase")
    assert cfg.dev_auth_active is False
    assert auth_mode(cfg) == "supabase_jwt"


def test_ignored_bypass_in_production_keeps_supabase_backend_on_user_tokens() -> None:
    cfg = _settings(
        AUTH_BYPASS=True,
        RUNTIME_PROFILE="production",
        AI_EXECUTION_MODE="live",
        API_DATA_BACKEND="supabase",
    )
    assert cfg.dev_auth_active is False


def test_request_data_store_never_uses_the_service_role_key() -> None:
    source = (Path(__file__).resolve().parents[3] / "apps/services/api/app/dependencies.py").read_text(encoding="utf-8")
    assert "SUPABASE_SERVICE_ROLE_KEY" not in source


def test_protected_route_requires_token_without_bypass() -> None:
    client = TestClient(create_app())
    assert client.get("/employees/me").status_code == 401
    assert client.get("/employees/me", headers={"Authorization": "Bearer dev-bypass"}).status_code == 401


def test_dev_auth_serves_configured_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_dev_auth(monkeypatch)
    client = TestClient(create_app())

    me = client.get("/employees/me", headers={"Authorization": "Bearer dev-bypass"})
    assert me.status_code == 200
    assert me.json()["user_id"] == DEV_USER_ID
    assert me.json()["email"] == DEV_EMAIL
    assert client.post("/employees/session").status_code == 200
    assert client.get("/opportunities").status_code == 200
    assert client.get("/health/runtime").json()["auth_mode"] == "dev_bypass"


def test_dev_auth_never_activates_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_dev_auth(monkeypatch, profile="production")
    client = TestClient(create_app())

    assert client.get("/employees/me").status_code == 401
    assert client.get("/employees/me", headers={"Authorization": "Bearer dev-bypass"}).status_code == 401
    assert client.get("/opportunities").status_code == 401

    token = create_test_access_token(
        user_id=uuid.UUID("11111111-1111-4111-8111-111111111111"),
        email="user-a@example.com",
        secret=settings.SUPABASE_JWT_SECRET,
    )
    real = client.get("/employees/me", headers={"Authorization": f"Bearer {token}"})
    assert real.status_code == 200
    assert real.json()["email"] == "user-a@example.com"
