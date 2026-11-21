from __future__ import annotations

import asyncio

import pytest

from app.engines.aliases import canonicalize_speaker, extract_alias_map, find_unresolved_aliases
from app.engines.promos import rank_promos_globally
from app.llm.dispatcher import ModelConfig, OpenAICompatibleProvider, call_llm
from app.schemas.demo import DemoScoringPayload
from app.schemas.narrative import EpisodeNarrativeAnalysis


def test_alias_extraction_and_canonicalization():
    continuity = "The Former Groom is Gerald. Lady in Gold Gown is Clarissa."
    logline = "A confrontation shatters a dynasty."
    alias_map = extract_alias_map(continuity, logline)

    assert alias_map.get("the former groom") == "Gerald"
    assert alias_map.get("lady in gold gown") == "Clarissa"

    canonical, was_aliased = canonicalize_speaker("THE FORMER GROOM (O.S.)", alias_map)
    assert was_aliased is True
    assert canonical == "Gerald"

    canonical, was_aliased = canonicalize_speaker("Lady in Gold Gown", alias_map)
    assert was_aliased is True
    assert canonical == "Clarissa"

    canonical, was_aliased = canonicalize_speaker("Juliana", alias_map)
    assert was_aliased is False
    assert canonical == "Juliana"

    unresolved = find_unresolved_aliases(["Stranger in Black", "Gerald"], alias_map)
    assert "Stranger In Black" in unresolved


def test_global_ranking_with_episode_variety_cap():
    candidates = [
        {"episode": "EP_001", "candidate_key": "P1", "score": 95.0, "duration_seconds": 35.0},
        {"episode": "EP_001", "candidate_key": "P2", "score": 94.0, "duration_seconds": 38.0},
        {"episode": "EP_001", "candidate_key": "P3", "score": 93.0, "duration_seconds": 40.0},
        {"episode": "EP_002", "candidate_key": "P4", "score": 92.0, "duration_seconds": 32.0},
        {"episode": "EP_003", "candidate_key": "P5", "score": 91.0, "duration_seconds": 42.0},
        {"episode": "EP_004", "candidate_key": "P6", "score": 90.0, "duration_seconds": 29.0},
    ]

    ranked, why_top_3 = rank_promos_globally(candidates, max_per_episode_in_top=2, top_limit=5)

    assert len(ranked) == 6
    assert len(why_top_3) == 3

    # EP_001 should have at most 2 in top 5
    top_5_episodes = [c["episode"] for c in ranked[:5]]
    assert top_5_episodes.count("EP_001") == 2
    # P3 was deferred because EP_001 hit the variety cap of 2
    assert ranked[0]["candidate_key"] == "P1"
    assert ranked[1]["candidate_key"] == "P2"
    assert ranked[2]["candidate_key"] == "P4"
    assert ranked[3]["candidate_key"] == "P5"
    assert ranked[4]["candidate_key"] == "P6"
    assert ranked[5]["candidate_key"] == "P3"


def resolve_immediate(coroutine):
    try:
        coroutine.send(None)
    except StopIteration as completed:
        return completed.value
    raise AssertionError("coroutine unexpectedly suspended")


def test_call_llm_fallback_dispatcher():
    # Tests that fallback provider works via central call_llm
    cfg = ModelConfig(provider="fallback")
    prompt = "Test prompt"
    context = {
        "episode_id": "EP_TEST",
        "events": [
            {
                "event_id": "E1",
                "event_type": "dialogue",
                "scene_id": "SC_01",
                "character": "JULIANA",
                "text": "I cannot marry you, Gerald.",
            }
        ],
    }
    result = resolve_immediate(
        call_llm(
            prompt=prompt,
            response_schema=EpisodeNarrativeAnalysis,
            config=cfg,
            context=context,
        )
    )
    assert result.value is not None
    assert isinstance(result.value, EpisodeNarrativeAnalysis)
    assert result.value.episode_id == "EP_TEST"
    assert len(result.value.analyses) == 1


def test_openai_compatible_adapter_sends_config_and_preserves_raw_json(monkeypatch):
    raw_json = (
        '{"scores":[{"candidate_id":"C1","hook":81,"cliffhanger":88,'
        '"standalone":76,"why_it_works":"A direct accusation opens a mystery."}]}'
    )
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        text = raw_json

        def json(self):
            return {
                "choices": [{"message": {"content": raw_json}}],
                "usage": {"prompt_tokens": 90, "completion_tokens": 30},
            }

    class FakeAsyncClient:
        def __init__(self, *, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, *, headers, json):
            captured.update(url=url, headers=headers, payload=json)
            return FakeResponse()

    monkeypatch.setattr("app.llm.dispatcher.httpx.AsyncClient", FakeAsyncClient)
    provider = OpenAICompatibleProvider(
        model="interview-model",
        base_url="https://example.test/v1",
        api_key="test-key",
        temperature=0.25,
        max_tokens=777,
    )

    result = asyncio.run(
        provider.generate_structured(
            prompt="Score candidate C1",
            response_schema=DemoScoringPayload,
        )
    )

    assert captured["url"] == "https://example.test/v1/chat/completions"
    assert captured["payload"]["model"] == "interview-model"
    assert captured["payload"]["temperature"] == 0.25
    assert captured["payload"]["max_tokens"] == 777
    assert result.raw_text == raw_json
    assert result.usage.input_tokens == 90
    assert result.usage.output_tokens == 30
    assert result.value.scores[0].candidate_id == "C1"


