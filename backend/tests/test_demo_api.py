from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from typing import Any, TypeVar

import pytest
from fastapi import HTTPException

from app.config import Settings
from app.llm.base import ProviderError, RetriableProviderError, StructuredGeneration
from app.api.demo import create_scoring_prompt, run_demo_scoring
from app.schemas.demo import (
    DemoModelConfig,
    DemoScoreCandidateInput,
    DemoScorePromptRequest,
    DemoScoreRequest,
    DemoTranscriptLine,
)
from app.schemas.narrative import ProviderUsage


ResultT = TypeVar("ResultT")


def resolve_immediate(coroutine: Coroutine[Any, Any, ResultT]) -> ResultT:
    try:
        coroutine.send(None)
    except StopIteration as completed:
        return completed.value
    raise AssertionError("demo handler unexpectedly suspended")


def candidate() -> DemoScoreCandidateInput:
    return DemoScoreCandidateInput(
        candidate_id="EP_001_P_TEST",
        episode="EP_001",
        start_clock="00:10.00",
        end_clock="00:40.00",
        duration_seconds=30,
        hook_line="Why did you hide the letter?",
        cliffhanger_line="Because the name on it was yours.",
        transcript_lines=[
            DemoTranscriptLine(
                speaker="Emma",
                text="Why did you hide the letter?",
                start_clock="00:10.00",
                end_clock="00:14.00",
            ),
            DemoTranscriptLine(
                speaker="Noah",
                text="Because the name on it was yours.",
                start_clock="00:35.00",
                end_clock="00:40.00",
            ),
        ],
    )


def test_demo_prompt_is_deterministic_and_contains_no_confidence_field() -> None:
    request = DemoScorePromptRequest(show_title="Synthetic", candidates=[candidate()])
    first = resolve_immediate(create_scoring_prompt(request))
    second = resolve_immediate(create_scoring_prompt(request))

    assert first.prompt_sha256 == second.prompt_sha256
    assert "EP_001_P_TEST" in first.prompt
    assert "confidence" not in first.response_schema["$defs"]["DemoCandidateModelScore"]["properties"]


def test_no_api_scoring_validates_and_preserves_manual_json() -> None:
    raw_json = (
        '{"scores":[{"candidate_id":"EP_001_P_TEST","hook":82,'
        '"cliffhanger":88,"standalone":79,'
        '"why_it_works":"The question opens a clear mystery and the answer creates a new one."}]}'
    )
    request = DemoScoreRequest(
        show_title="Synthetic",
        candidates=[candidate()],
        model=DemoModelConfig(provider="no-api", model="manual-paste"),
        manual_payload=raw_json,
    )

    response = resolve_immediate(run_demo_scoring(request))

    assert response.provider == "no-api"
    assert response.model_calls == 1
    assert response.raw_response == raw_json
    assert response.scores[0].hook == 82


def test_no_api_scoring_rejects_mismatched_candidate_ids() -> None:
    request = DemoScoreRequest(
        show_title="Synthetic",
        candidates=[candidate()],
        model=DemoModelConfig(provider="no-api", model="manual-paste"),
        manual_payload={
            "scores": [
                {
                    "candidate_id": "WRONG",
                    "hook": 80,
                    "cliffhanger": 80,
                    "standalone": 80,
                    "why_it_works": "Valid text but the wrong candidate identifier was returned.",
                }
            ]
        },
    )

    with pytest.raises(HTTPException) as error:
        resolve_immediate(run_demo_scoring(request))

    assert error.value.status_code == 502
    assert error.value.detail["code"] == "model_scoring_failed"


def test_gemini_without_request_or_backend_key_is_actionable(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.demo.get_settings",
        lambda: Settings(llm_provider="gemini", gemini_api_key=""),
    )
    request = DemoScoreRequest(
        show_title="Synthetic",
        candidates=[candidate()],
        model=DemoModelConfig(provider="gemini", model="test-model"),
    )

    with pytest.raises(HTTPException) as error:
        asyncio.run(run_demo_scoring(request))

    assert error.value.status_code == 422
    assert error.value.detail["code"] == "api_key_required"
    assert "backend has no configured key" in error.value.detail["message"]


def _generation() -> StructuredGeneration:
    value = {
        "scores": [
            {
                "candidate_id": "EP_001_P_TEST",
                "hook": 82,
                "cliffhanger": 88,
                "standalone": 79,
                "why_it_works": "The question opens a clear mystery and the answer creates a new one.",
            }
        ]
    }
    from app.schemas.demo import DemoScoringPayload

    return StructuredGeneration(
        value=DemoScoringPayload.model_validate(value),
        usage=ProviderUsage(input_tokens=10, output_tokens=5, latency_ms=3),
        raw_output=value,
        raw_text=None,
    )


def test_retriable_model_error_retries_once_then_succeeds(monkeypatch) -> None:
    calls = 0

    async def fake_call_llm(**_kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RetriableProviderError("Gemini API temporary error (503)")
        return _generation()

    monkeypatch.setattr("app.api.demo.call_llm", fake_call_llm)
    request = DemoScoreRequest(
        show_title="Synthetic",
        candidates=[candidate()],
        model=DemoModelConfig(provider="gemini", model="test-model", api_key="test-key"),
    )

    response = asyncio.run(run_demo_scoring(request))

    assert calls == 2
    assert response.model_calls == 2
    assert response.retries == 1


def test_invalid_key_error_is_not_retried(monkeypatch) -> None:
    calls = 0

    async def fake_call_llm(**_kwargs):
        nonlocal calls
        calls += 1
        raise ProviderError("Gemini API key was rejected. Check the key and its permissions.")

    monkeypatch.setattr("app.api.demo.call_llm", fake_call_llm)
    request = DemoScoreRequest(
        show_title="Synthetic",
        candidates=[candidate()],
        model=DemoModelConfig(provider="gemini", model="test-model", api_key="invalid-key"),
    )

    with pytest.raises(HTTPException) as error:
        asyncio.run(run_demo_scoring(request))

    assert calls == 1
    assert error.value.status_code == 502
    assert "API key was rejected" in error.value.detail["message"]
