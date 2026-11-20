from __future__ import annotations

import pytest

from app.engines.aliases import canonicalize_speaker, extract_alias_map, find_unresolved_aliases
from app.engines.promos import rank_promos_globally
from app.llm.dispatcher import ModelConfig, call_llm
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


