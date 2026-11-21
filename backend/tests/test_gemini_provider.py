from __future__ import annotations

import json
from collections.abc import Coroutine
from types import SimpleNamespace
from typing import Any, TypeVar

import pytest
import httpx
from google.genai import errors

from app.llm.base import ProviderError, RetriableProviderError
from app.llm.gemini import GeminiProvider
from app.schemas.narrative import EpisodeNarrativeAnalysis


ResultT = TypeVar("ResultT")


def resolve_immediate(coroutine: Coroutine[Any, Any, ResultT]) -> ResultT:
    try:
        coroutine.send(None)
    except StopIteration as completed:
        return completed.value
    raise AssertionError("fake Gemini client unexpectedly suspended")


def _valid_output() -> dict[str, object]:
    return {
        "episode_id": "EP_TEST",
        "analyses": [
            {
                "event_id": "EP_TEST_E001",
                "narrative_type": "open_question",
                "characters": ["Emma"],
                "conflict": None,
                "emotional_appeal": "curiosity",
                "hook_strength": 81,
                "tension": 70,
                "context_dependency": "low",
                "open_question": "Who took the letter?",
                "resolves_question": False,
                "evidence_event_ids": ["EP_TEST_E001"],
                "confidence": 0.9,
            }
        ],
    }


class FakeModels:
    def __init__(self, response: object = None, error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.kwargs: dict[str, object] | None = None

    async def generate_content(self, **kwargs: object) -> object:
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return self.response


class FakeClient:
    def __init__(self, models: FakeModels) -> None:
        self.aio = SimpleNamespace(models=models)


def test_gemini_provider_requests_and_validates_json_schema() -> None:
    response = SimpleNamespace(
        text=json.dumps(_valid_output()),
        usage_metadata=SimpleNamespace(
            prompt_token_count=123,
            candidates_token_count=45,
        ),
    )
    models = FakeModels(response=response)
    provider = GeminiProvider(
        api_key="test-key",
        model="test-model",
        temperature=0.25,
        max_tokens=777,
        client=FakeClient(models),
    )

    result = resolve_immediate(
        provider.generate_structured(
            prompt="Synthetic prompt",
            response_schema=EpisodeNarrativeAnalysis,
        )
    )

    assert result.value.episode_id == "EP_TEST"
    assert result.usage.input_tokens == 123
    assert result.usage.output_tokens == 45
    assert models.kwargs is not None
    config = models.kwargs["config"]
    assert config.response_mime_type == "application/json"
    assert config.response_json_schema["type"] == "object"
    assert config.temperature == 0.25
    assert config.max_output_tokens == 777


def test_gemini_provider_rejects_invalid_schema_output() -> None:
    models = FakeModels(
        response=SimpleNamespace(text='{"episode_id":"EP_TEST"}', usage_metadata=None)
    )
    provider = GeminiProvider(api_key="test-key", model="test-model", client=FakeClient(models))

    with pytest.raises(ProviderError, match="schema validation"):
        resolve_immediate(
            provider.generate_structured(
                prompt="Synthetic prompt",
                response_schema=EpisodeNarrativeAnalysis,
            )
        )


def test_gemini_server_errors_are_retriable() -> None:
    models = FakeModels(
        error=errors.ServerError(503, {"error": {"message": "temporarily unavailable"}})
    )
    provider = GeminiProvider(api_key="test-key", model="test-model", client=FakeClient(models))

    with pytest.raises(RetriableProviderError, match="temporary error"):
        resolve_immediate(
            provider.generate_structured(
                prompt="Synthetic prompt",
                response_schema=EpisodeNarrativeAnalysis,
            )
        )


def test_gemini_rate_limit_is_retriable() -> None:
    models = FakeModels(
        error=errors.ClientError(429, {"error": {"message": "quota exceeded"}})
    )
    provider = GeminiProvider(api_key="test-key", model="test-model", client=FakeClient(models))

    with pytest.raises(RetriableProviderError, match=r"temporary error \(429\)"):
        resolve_immediate(
            provider.generate_structured(
                prompt="Synthetic prompt",
                response_schema=EpisodeNarrativeAnalysis,
            )
        )


def test_gemini_invalid_key_has_plain_language_error() -> None:
    models = FakeModels(
        error=errors.ClientError(400, {"error": {"message": "API key not valid"}})
    )
    provider = GeminiProvider(api_key="invalid-key", model="test-model", client=FakeClient(models))

    with pytest.raises(ProviderError, match="API key was rejected"):
        resolve_immediate(
            provider.generate_structured(
                prompt="Synthetic prompt",
                response_schema=EpisodeNarrativeAnalysis,
            )
        )


@pytest.mark.parametrize(
    "response",
    [
        SimpleNamespace(text="", usage_metadata=None),
        SimpleNamespace(text='{"episode_id":"EP_TEST"}', usage_metadata=None),
    ],
)
def test_gemini_empty_or_malformed_output_is_retriable(response) -> None:
    provider = GeminiProvider(
        api_key="test-key",
        model="test-model",
        client=FakeClient(FakeModels(response=response)),
    )

    with pytest.raises(RetriableProviderError):
        resolve_immediate(
            provider.generate_structured(
                prompt="Synthetic prompt",
                response_schema=EpisodeNarrativeAnalysis,
            )
        )


def test_gemini_timeout_is_retriable() -> None:
    provider = GeminiProvider(
        api_key="test-key",
        model="test-model",
        client=FakeClient(FakeModels(error=httpx.ReadTimeout("timed out"))),
    )

    with pytest.raises(RetriableProviderError, match="timeout"):
        resolve_immediate(
            provider.generate_structured(
                prompt="Synthetic prompt",
                response_schema=EpisodeNarrativeAnalysis,
            )
        )


def test_gemini_unknown_model_is_actionable() -> None:
    provider = GeminiProvider(
        api_key="test-key",
        model="missing-model",
        client=FakeClient(
            FakeModels(error=errors.ClientError(404, {"error": {"message": "not found"}}))
        ),
    )

    with pytest.raises(ProviderError, match="missing-model.*not found"):
        resolve_immediate(
            provider.generate_structured(
                prompt="Synthetic prompt",
                response_schema=EpisodeNarrativeAnalysis,
            )
        )

