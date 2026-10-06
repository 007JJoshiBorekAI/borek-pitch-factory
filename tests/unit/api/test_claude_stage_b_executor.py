from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from llm.claude_executor import ClaudeStageBExecutor
from services.observability.llm_logger import LlmStage


def test_claude_executor_returns_payload_and_usage(monkeypatch: Any) -> None:
    captured: dict[str, Any] = {}

    def fake_structured_complete(system: str, user: str, schema: dict, **kwargs: Any) -> dict:
        captured.update(system=system, user=user, schema=schema, **kwargs)
        kwargs["usage_out"].append(SimpleNamespace(input_tokens=11, output_tokens=7))
        return {"title": "Deck", "slides": []}

    monkeypatch.setattr("llm.claude_executor.structured_complete", fake_structured_complete)

    executor = ClaudeStageBExecutor(api_key="sk-ant-test", model="claude-sonnet-4-5")
    result = executor(
        LlmStage.PLANNING,
        "presentation_planner",
        "v1",
        0,
        request={
            "instructions": "Plan the deck.",
            "targetSchema": {"type": "object", "properties": {"title": {"type": "string"}}},
            "chapters": [],
        },
    )

    assert result.payload == {"title": "Deck", "slides": []}
    assert (result.input_tokens, result.output_tokens) == (11, 7)
    assert captured["tool_name"] == "presentation_plan"
    assert "Plan the deck." in captured["system"]
    assert "targetSchema" not in captured["user"]
    assert "instructions" not in captured["user"]
