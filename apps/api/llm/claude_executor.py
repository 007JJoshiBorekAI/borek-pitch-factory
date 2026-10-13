"""Anthropic Claude transport for Stage B (planning, slide generation, compression).

Drop-in replacement for ``OpenAIResponsesExecutor``: same call signature, same
``LlmUsageResult`` return, schema-constrained output via forced tool use.
"""

from __future__ import annotations

import copy
import json
from typing import Any

from llm.claude.client import ClaudeClientError, sonnet_model, structured_complete
from llm.client import LlmUsageResult
from llm.json_schema_bundle import JsonSchemaBundleError, prepare_openai_json_schema
from llm.openai_executor import (
    OpenAIProviderConfigurationError,
    OpenAIProviderError,
    _operation_spec,
)
from services.observability.llm_logger import LlmStage

_SYSTEM_SUFFIX = (
    "\n\nReturn the result only by calling the provided tool, with an object that "
    "satisfies its input schema exactly."
)


class ClaudeStageBExecutor:
    """Execute schema-constrained Stage B requests through Anthropic Claude."""

    def __init__(self, *, api_key: str, model: str | None = None) -> None:
        if not api_key.strip():
            raise OpenAIProviderConfigurationError(
                "ANTHROPIC_API_KEY is required for live Claude execution"
            )
        self._model = (model or "").strip() or sonnet_model()

    @property
    def model(self) -> str:
        return self._model

    def __call__(
        self,
        stage: LlmStage,
        operation: str,
        prompt_version: str,
        retry_count: int,
        *,
        request: dict[str, Any] | None = None,
    ) -> LlmUsageResult:
        _ = (prompt_version, retry_count)
        spec = _operation_spec(stage, operation)
        if spec is None:
            raise OpenAIProviderError(
                f"ClaudeStageBExecutor does not support {stage.value}/{operation}"
            )
        if not isinstance(request, dict):
            raise OpenAIProviderError(f"{spec.label} input must be an object")

        from services.security.egress_policy import EgressBlockedError, enforce_external_egress

        try:
            request = enforce_external_egress(
                copy.deepcopy(request),
                provider="anthropic",
                stage=spec.kind,
            )
        except EgressBlockedError as exc:
            raise OpenAIProviderError(str(exc), code=exc.code, retryable=False) from exc
        if not isinstance(request, dict):
            raise OpenAIProviderError(f"{spec.label} input must be an object")

        instructions = request.get("instructions")
        target_schema = request.get("targetSchema")
        if not isinstance(instructions, str) or not instructions.strip():
            raise OpenAIProviderError(f"{spec.label} instructions are required")
        if not isinstance(target_schema, dict):
            raise OpenAIProviderError(f"{spec.label} canonical targetSchema is required")
        if spec.kind == "slide" and not isinstance(request.get("chapters"), (list, tuple)):
            raise OpenAIProviderError("Slide generation chapters must be an array")
        if spec.kind == "compression" and not isinstance(
            request.get("offendingValues"), dict
        ):
            raise OpenAIProviderError("Compression offendingValues must be an object")

        try:
            schema_for_api = prepare_openai_json_schema(target_schema)
        except JsonSchemaBundleError as exc:
            raise OpenAIProviderError(f"{spec.label} targetSchema is not usable: {exc}") from exc

        model_input = copy.deepcopy(request)
        model_input.pop("instructions", None)
        model_input.pop("targetSchema", None)

        usage: list[Any] = []
        try:
            payload = structured_complete(
                instructions + _SYSTEM_SUFFIX,
                json.dumps(model_input, ensure_ascii=False),
                schema_for_api,
                tool_name=spec.schema_name,
                tool_description=f"Return the structured {spec.label} result.",
                usage_out=usage,
            )
        except ClaudeClientError as exc:
            raise spec.error_cls(
                f"Claude {spec.label} failed: {exc.user_message}",
                code=getattr(exc, "code", ""),
                retryable=getattr(exc, "retryable", None),
            ) from exc

        if not isinstance(payload, dict):
            raise spec.error_cls(f"Claude {spec.label} response must be a JSON object")
        last = usage[-1] if usage else None
        return LlmUsageResult(
            payload=payload,
            input_tokens=_count(last, "input_tokens"),
            output_tokens=_count(last, "output_tokens"),
        )


def _count(usage: Any, name: str) -> int:
    value = usage.get(name) if isinstance(usage, dict) else getattr(usage, name, None)
    return value if isinstance(value, int) and value >= 0 else 0
